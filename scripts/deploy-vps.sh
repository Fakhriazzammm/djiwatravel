#!/usr/bin/env bash
# Deploy Djiwa Travel to the production VPS (nginx -> 127.0.0.1:3000, systemd unit).
#
# Flow: build locally -> sync source + migrations -> apply pending SQL -> upload .output to a
# staging dir -> atomic swap with a timestamped backup -> restart -> check EVERY route found in
# src/routes (new pages included automatically) -> auto-rollback on failure.
#
# Usage:
#   scripts/deploy-vps.sh                 # build + migrate + deploy + verify
#   scripts/deploy-vps.sh --skip-build    # ship the existing .output as-is
#   scripts/deploy-vps.sh --no-migrate    # skip the SQL migration phase
#   scripts/deploy-vps.sh --skip-source   # only ship .output, do not mirror source to the VPS
#   scripts/deploy-vps.sh --dry-run       # print the plan, touch nothing
#   scripts/deploy-vps.sh --no-rollback   # keep the new build even if health checks fail
#   scripts/deploy-vps.sh --allow-unpushed # deploy a HEAD that is not on origin/<branch> yet
#
# One-time (host whose schema is current but has no tracking table):
#   ssh <host> 'cd /home/ubuntu/djiwatravel && bash scripts/apply-migrations.sh --baseline'
#
# Overrides (env):
#   DJIWA_DEPLOY_HOST=ubuntu@43.133.156.93
#   DJIWA_DEPLOY_KEY=$HOME/.ssh/djiwa_vps
#   DJIWA_DEPLOY_DIR=/home/ubuntu/djiwatravel
#   DJIWA_DEPLOY_SERVICE=djiwatravel.service
#   DJIWA_DEPLOY_URL=https://djiwatravel.com
#   DJIWA_DEPLOY_KEEP_BACKUPS=3
#
# Exit codes: 0 deployed and verified, non-zero = production stays on the previous build.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"

HOST="${DJIWA_DEPLOY_HOST:-ubuntu@43.133.156.93}"
KEY="${DJIWA_DEPLOY_KEY:-${HOME}/.ssh/djiwa_vps}"
REMOTE_DIR="${DJIWA_DEPLOY_DIR:-/home/ubuntu/djiwatravel}"
SERVICE="${DJIWA_DEPLOY_SERVICE:-djiwatravel.service}"
PUBLIC_URL="${DJIWA_DEPLOY_URL:-https://djiwatravel.com}"
KEEP_BACKUPS="${DJIWA_DEPLOY_KEEP_BACKUPS:-3}"

SSH_OPTS=(-i "${KEY}" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
RSYNC_RSH="ssh -i ${KEY} -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"

SKIP_BUILD=0
SKIP_SOURCE=0
SKIP_MIGRATE=0
DRY_RUN=0
NO_ROLLBACK=0
ALLOW_UNPUSHED=0

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-source) SKIP_SOURCE=1; shift ;;
    --no-migrate) SKIP_MIGRATE=1; shift ;;
    --no-rollback) NO_ROLLBACK=1; shift ;;
    --allow-unpushed) ALLOW_UNPUSHED=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1 (try --help)" >&2; exit 2 ;;
  esac
done

ssh_run() { ssh "${SSH_OPTS[@]}" "${HOST}" "$@"; }
step() { printf '\n=== %s ===\n' "$*"; }

# Route list comes from the filesystem router, so a new src/routes/*.tsx is deployed and checked
# without editing this script. Dynamic segments ($id, $slug, ...) cannot be probed without real IDs.
ROUTE_PATHS=()
while IFS= read -r route_path; do
  [ -n "${route_path}" ] && ROUTE_PATHS+=("${route_path}")
done < <(bash scripts/list-routes.sh 2>/dev/null)
DYNAMIC_ROUTES="$(bash scripts/list-routes.sh 2>&1 >/dev/null | sed -n 's/^dynamic=//p')"

[ "${#ROUTE_PATHS[@]}" -gt 0 ] || { echo "ERROR: tidak ada route ditemukan di src/routes" >&2; exit 2; }

for bin in npm rsync ssh curl; do
  command -v "${bin}" >/dev/null || { echo "ERROR: '${bin}' tidak ditemukan" >&2; exit 2; }
done
[ -f "${KEY}" ] || { echo "ERROR: SSH key tidak ditemukan: ${KEY}" >&2; exit 2; }

COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
COMMIT_FULL="$(git rev-parse HEAD 2>/dev/null || echo '')"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

step "Preflight"
echo "host    : ${HOST}:${REMOTE_DIR}"
echo "service : ${SERVICE}"
echo "url     : ${PUBLIC_URL}"
echo "commit  : ${COMMIT} (${BRANCH})"
echo "routes  : ${#ROUTE_PATHS[@]} statis + ${DYNAMIC_ROUTES} dinamis"

if ! ssh_run true; then
  echo "ERROR: tidak bisa SSH ke ${HOST} dengan key ${KEY}" >&2
  exit 2
fi

if [ "${DIRTY}" != "0" ]; then
  echo "PERINGATAN: ${DIRTY} file lokal belum di-commit; yang di-deploy tetap isi working tree." >&2
fi

# Auto-deploy di VPS memantau origin/<branch>. Commit yang belum di-push akan tertimpa dalam
# hitungan menit, jadi tolak lebih awal daripada mengejutkan setelah rilis.
if [ "${ALLOW_UNPUSHED}" = "0" ] && [ -n "${COMMIT_FULL}" ]; then
  if git fetch --quiet origin "${BRANCH}" 2>/dev/null; then
    REMOTE_SHA="$(git rev-parse FETCH_HEAD 2>/dev/null || true)"
    if [ -n "${REMOTE_SHA}" ] && [ "${REMOTE_SHA}" != "${COMMIT_FULL}" ]; then
      echo "ERROR: HEAD ${COMMIT} belum ada di origin/${BRANCH}; auto-deploy VPS akan menimpanya." >&2
      echo "       Push dulu, atau jalankan dengan --allow-unpushed kalau memang mau." >&2
      exit 2
    fi
  fi
fi

if [ "${DRY_RUN}" = "1" ]; then
  echo
  echo "--dry-run: tidak ada perubahan."
  echo "1. npm run build"
  echo "2. sync src/ public/ migrations/ drizzle/ scripts/ + config ke VPS"
  echo "3. scripts/apply-migrations.sh (migrasi SQL baru)"
  echo "4. rsync .output/ -> ${REMOTE_DIR}/.output.new/"
  echo "5. backup .output, swap, restart ${SERVICE}"
  echo "6. verifikasi ${#ROUTE_PATHS[@]} route: ${ROUTE_PATHS[*]}"
  exit 0
fi

if [ "${SKIP_MIGRATE}" = "0" ]; then
  step "Migrasi database"
  # Sync dulu supaya scripts/apply-migrations.sh dan migrations/ terbaru ada di host.
  rsync -az --delete -e "${RSYNC_RSH}" migrations/ "${HOST}:${REMOTE_DIR}/migrations/"
  rsync -az --delete -e "${RSYNC_RSH}" scripts/ "${HOST}:${REMOTE_DIR}/scripts/"
  if ! ssh_run "cd '${REMOTE_DIR}' && bash scripts/apply-migrations.sh apply"; then
    echo "ERROR: migrasi gagal; build belum di-swap, production masih versi lama." >&2
    exit 1
  fi
fi

if [ "${SKIP_BUILD}" = "1" ]; then
  [ -f .output/server/index.mjs ] || { echo "ERROR: .output belum ada, jalankan tanpa --skip-build" >&2; exit 2; }
  echo "build   : dilewati (--skip-build)"
else
  step "Build lokal"
  npm run build
  [ -f .output/server/index.mjs ] || { echo "ERROR: build tidak menghasilkan .output/server/index.mjs" >&2; exit 1; }
fi

if [ "${SKIP_SOURCE}" = "1" ]; then
  echo "source  : dilewati (--skip-source)"
else
  step "Sync source ke VPS"
  for dir in src public migrations drizzle scripts; do
    [ -d "${dir}" ] || continue
    rsync -az --delete -e "${RSYNC_RSH}" "${dir}/" "${HOST}:${REMOTE_DIR}/${dir}/"
  done
  rsync -az -e "${RSYNC_RSH}" \
    package.json package-lock.json tsconfig.json vite.config.ts drizzle.config.ts components.json README.md \
    "${HOST}:${REMOTE_DIR}/" 2>/dev/null || true
  echo "source  : src/ public/ migrations/ drizzle/ scripts/ + config tersinkron"
fi

step "Upload artefak"
rsync -az --delete -e "${RSYNC_RSH}" .output/ "${HOST}:${REMOTE_DIR}/.output.new/"
echo "terkirim: $(ssh_run "du -sh '${REMOTE_DIR}/.output.new' | cut -f1")"

step "Swap + restart"
BACKUP="$(ssh_run "set -e
  cd '${REMOTE_DIR}'
  TS=\$(date +%Y%m%d-%H%M%S)
  rm -rf .output.failed
  if [ -d .output ]; then mv .output \".output.bak-\$TS\"; fi
  mv .output.new .output
  echo \".output.bak-\$TS\"")"
echo "backup  : ${REMOTE_DIR}/${BACKUP}"
ssh_run "sudo -n systemctl restart '${SERVICE}'"

rollback() {
  echo "ROLLBACK ke ${BACKUP} ..." >&2
  ssh_run "set -e
    cd '${REMOTE_DIR}'
    rm -rf .output.failed
    mv .output .output.failed
    mv '${BACKUP}' .output
    sudo -n systemctl restart '${SERVICE}'" || true
  echo "ROLLBACK_SELESAI: production kembali ke build sebelumnya (migrasi SQL additive tetap terpasang)" >&2
}

wait_for_app() {
  for _ in $(seq 1 20); do
    if ssh_run "systemctl is-active --quiet '${SERVICE}'" &&
       [ "$(ssh_run "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/" || true)" = "200" ]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

check_paths() { # $1 = "remote" | "public"
  local mode="$1" line path code failures=0
  if [ "${mode}" = "remote" ]; then
    while IFS= read -r line; do
      printf '  %s\n' "${line}"
      code="${line##* }"
      case "${code}" in 2??|3??) ;; *) failures=$((failures + 1)) ;; esac
    done < <(printf '%s\n' "${ROUTE_PATHS[@]}" | ssh "${SSH_OPTS[@]}" "${HOST}" \
      "while IFS= read -r p; do code=\$(curl -s -o /dev/null -w '%{http_code}' \"http://127.0.0.1:3000\$p\"); printf '%-30s %s\n' \"\$p\" \"\$code\"; done")
  else
    for path in "${ROUTE_PATHS[@]}"; do
      code="$(curl -s -o /dev/null -w '%{http_code}' "${PUBLIC_URL}${path}" || true)"
      printf '  %-30s %s\n' "${path}" "${code}"
      case "${code}" in 2??|3??) ;; *) failures=$((failures + 1)) ;; esac
    done
  fi
  return "${failures}"
}

step "Health check (semua route, via localhost:3000)"
FAILED=0
if ! wait_for_app; then
  echo "GAGAL: service tidak menjawab 200 dalam 20 detik" >&2
  FAILED=1
elif ! check_paths remote; then
  FAILED=1
fi

step "Verifikasi publik (${PUBLIC_URL})"
if [ "${FAILED}" = "0" ]; then
  if ! check_paths public; then
    FAILED=1
  fi

  # Pastikan HTML publik memuat bundle dari build yang baru dikirim.
  REMOTE_ASSET="$(curl -s --compressed "${PUBLIC_URL}/" | grep -a -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 || true)"
  if [ -n "${REMOTE_ASSET}" ] && [ -f ".output/public/${REMOTE_ASSET}" ]; then
    echo "  asset                          ${REMOTE_ASSET} (cocok)"
  elif [ -n "${REMOTE_ASSET}" ]; then
    echo "PERINGATAN: HTML publik memuat ${REMOTE_ASSET}, tidak ada di build lokal (cache/proxy?)" >&2
  fi
fi

if [ "${FAILED}" != "0" ]; then
  if [ "${NO_ROLLBACK}" = "1" ]; then
    echo "GAGAL dan --no-rollback aktif; production tetap memakai build baru." >&2
    exit 1
  fi
  rollback
  exit 1
fi

step "Prune backup (simpan ${KEEP_BACKUPS} terakhir)"
ssh_run "cd '${REMOTE_DIR}' && ls -1dt .output.bak-* 2>/dev/null | tail -n +\$(( ${KEEP_BACKUPS} + 1 )) | xargs -r rm -rf || true"

# Catat SHA yang sekarang live supaya timer auto-deploy tahu ini sudah terpasang dan tidak
# membangun ulang/ menimpa. Hanya untuk working tree bersih; kalau kotor, biarkan auto-deploy
# yang menang pada push berikutnya.
if [ -n "${COMMIT_FULL}" ] && [ "${DIRTY}" = "0" ]; then
  ssh_run "cd '${REMOTE_DIR}' && echo '${COMMIT_FULL}' > .deployed-sha"
  echo "state   : .deployed-sha = ${COMMIT}"
else
  echo "state   : .deployed-sha tidak diperbarui (working tree kotor / SHA tidak diketahui)"
fi

step "Selesai"
echo "commit  : ${COMMIT} (${BRANCH})"
echo "backup  : ${REMOTE_DIR}/${BACKUP}"
echo "routes  : ${#ROUTE_PATHS[@]} statis OK, ${DYNAMIC_ROUTES} dinamis tidak diprobe"
echo "service : $(ssh_run "systemctl is-active '${SERVICE}'")"
echo "url     : ${PUBLIC_URL}"
