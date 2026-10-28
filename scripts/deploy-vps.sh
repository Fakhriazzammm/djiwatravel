#!/usr/bin/env bash
# Deploy Djiwa Travel to the production VPS (nginx -> 127.0.0.1:3000, systemd unit).
#
# Flow: build locally -> rsync .output to a staging dir on the VPS -> atomic swap with a
# timestamped backup -> restart the service -> health-check every route -> auto-rollback on failure.
#
# Usage:
#   scripts/deploy-vps.sh                 # build + deploy + verify
#   scripts/deploy-vps.sh --skip-build    # ship the existing .output as-is
#   scripts/deploy-vps.sh --dry-run       # print the plan, touch nothing
#   scripts/deploy-vps.sh --no-rollback   # keep the new build even if health checks fail
#
# Overrides (env):
#   DJIWA_DEPLOY_HOST=ubuntu@43.133.156.93
#   DJIWA_DEPLOY_KEY=$HOME/.ssh/djiwa_vps
#   DJIWA_DEPLOY_DIR=/home/ubuntu/djiwatravel
#   DJIWA_DEPLOY_SERVICE=djiwatravel.service
#   DJIWA_DEPLOY_URL=https://djiwatravel.com
#   DJIWA_DEPLOY_KEEP_BACKUPS=3
#
# Exit codes: 0 deployed and verified, non-zero = production is on the previous build (rolled back).

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

# Routes that must answer 2xx/3xx after the swap. /catalog legitimately redirects (307).
VERIFY_PATHS=(/ /explore /my-trips /profile /wallet)

SKIP_BUILD=0
DRY_RUN=0
NO_ROLLBACK=0

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    --no-rollback) NO_ROLLBACK=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1 (try --help)" >&2; exit 2 ;;
  esac
done

ssh_run() { ssh "${SSH_OPTS[@]}" "${HOST}" "$@"; }

step() { printf '\n=== %s ===\n' "$*"; }

for bin in npm rsync ssh curl; do
  command -v "${bin}" >/dev/null || { echo "ERROR: '${bin}' tidak ditemukan" >&2; exit 2; }
done
[ -f "${KEY}" ] || { echo "ERROR: SSH key tidak ditemukan: ${KEY}" >&2; exit 2; }

COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

step "Preflight"
echo "host    : ${HOST}:${REMOTE_DIR}"
echo "service : ${SERVICE}"
echo "url     : ${PUBLIC_URL}"
echo "commit  : ${COMMIT} (${BRANCH})"

if ! ssh_run true; then
  echo "ERROR: tidak bisa SSH ke ${HOST} dengan key ${KEY}" >&2
  exit 2
fi

if [ "${DIRTY}" != "0" ]; then
  echo "PERINGATAN: ${DIRTY} file lokal belum di-commit; yang di-deploy tetap isi working tree." >&2
fi

if [ "${DRY_RUN}" = "1" ]; then
  echo
  echo "--dry-run: tidak ada perubahan."
  if [ "${SKIP_BUILD}" = "1" ]; then
    echo "1. build: dilewati (--skip-build)"
  else
    echo "1. npm run build"
  fi
  echo "2. rsync .output/ -> ${HOST}:${REMOTE_DIR}/.output.new/"
  echo "3. backup .output -> .output.bak-<timestamp>, swap, restart ${SERVICE}"
  echo "4. verifikasi: ${VERIFY_PATHS[*]}"
  exit 0
fi

if [ "${SKIP_BUILD}" = "1" ]; then
  [ -f .output/server/index.mjs ] || { echo "ERROR: .output belum ada, jalankan tanpa --skip-build" >&2; exit 2; }
  echo "build   : dilewati (--skip-build)"
else
  step "Build lokal"
  npm run build
  [ -f .output/server/index.mjs ] || { echo "ERROR: build tidak menghasilkan .output/server/index.mjs" >&2; exit 1; }
fi

step "Upload artefak"
rsync -az --delete -e "${RSYNC_RSH}" .output/ "${HOST}:${REMOTE_DIR}/.output.new/"
REMOTE_SIZE="$(ssh_run "du -sh '${REMOTE_DIR}/.output.new' | cut -f1")"
echo "terkirim: ${REMOTE_SIZE}"

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
  echo "ROLLBACK_SELESAI: production kembali ke build sebelumnya" >&2
}

step "Health check"
HEALTHY=0
for _ in $(seq 1 20); do
  if ssh_run "systemctl is-active --quiet '${SERVICE}'"; then
    if [ "$(ssh_run "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/" || true)" = "200" ]; then
      HEALTHY=1
      break
    fi
  fi
  sleep 1
done

FAILED=0
if [ "${HEALTHY}" != "1" ]; then
  echo "GAGAL: service tidak menjawab 200 dalam 20 detik" >&2
  FAILED=1
else
  for path in "${VERIFY_PATHS[@]}"; do
    code="$(ssh_run "curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3000${path}'" || true)"
    printf '  %-14s %s\n' "${path}" "${code}"
    case "${code}" in 2??|3??) ;; *) FAILED=1 ;; esac
  done
fi

step "Verifikasi publik"
if [ "${FAILED}" = "0" ]; then
  for path in "${VERIFY_PATHS[@]}"; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "${PUBLIC_URL}${path}" || true)"
    printf '  %-14s %s\n' "${path}" "${code}"
    case "${code}" in 2??|3??) ;; *) FAILED=1 ;; esac
  done

  # Pastikan HTML publik memang menyajikan bundle dari build yang baru dikirim.
  REMOTE_ASSET="$(curl -s "${PUBLIC_URL}/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 || true)"
  if [ -n "${REMOTE_ASSET}" ] && [ -f ".output/public/${REMOTE_ASSET}" ]; then
    echo "  asset          ${REMOTE_ASSET} (cocok)"
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

step "Selesai"
echo "commit  : ${COMMIT} (${BRANCH})"
echo "backup  : ${REMOTE_DIR}/${BACKUP}"
echo "service : $(ssh_run "systemctl is-active '${SERVICE}'")"
echo "url     : ${PUBLIC_URL}"
