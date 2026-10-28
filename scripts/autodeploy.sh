#!/usr/bin/env bash
# Pull-and-deploy on the production VPS itself. Run by djiwa-autodeploy.timer, or by hand.
#
# Why this exists: pushes to main should reach production without a laptop in the loop. The host
# keeps a git checkout of the repo, and this script only acts when origin/<branch> moved past the
# SHA recorded in .deployed-sha. Every run is guarded by a lock, builds before touching .output,
# verifies every route, and rolls back to the previous build if anything fails.
#
# Usage:
#   scripts/autodeploy.sh              # deploy only if main moved
#   scripts/autodeploy.sh --force      # rebuild and redeploy the current HEAD anyway
#   scripts/autodeploy.sh --check      # print state, change nothing
#
# Env: DJIWA_APP_DIR, DJIWA_BRANCH, DJIWA_SERVICE, DJIWA_PUBLIC_URL, DJIWA_KEEP_BACKUPS.
#
# Exit codes: 0 nothing to do or success, non-zero = deploy failed (previous build still serving).

set -euo pipefail

APP_DIR="${DJIWA_APP_DIR:-/home/ubuntu/djiwatravel}"
BRANCH="${DJIWA_BRANCH:-main}"
SERVICE="${DJIWA_SERVICE:-djiwatravel.service}"
PUBLIC_URL="${DJIWA_PUBLIC_URL:-https://djiwatravel.com}"
KEEP_BACKUPS="${DJIWA_KEEP_BACKUPS:-3}"
LOCK_FILE="${DJIWA_LOCK:-/tmp/djiwa-autodeploy.lock}"
STATE_FILE="${APP_DIR}/.deployed-sha"

FORCE=0
CHECK=0
case "${1:-}" in
  --force) FORCE=1 ;;
  --check) CHECK=1 ;;
  "") ;;
  *) echo "unknown argument: $1" >&2; exit 2 ;;
esac

cd "${APP_DIR}"
[ -d .git ] || { echo "ERROR: ${APP_DIR} bukan git checkout" >&2; exit 2; }

git fetch --quiet origin "${BRANCH}"
TARGET="$(git rev-parse FETCH_HEAD)"
CURRENT="$(cat "${STATE_FILE}" 2>/dev/null || echo none)"

if [ "${CHECK}" = "1" ]; then
  echo "app_dir : ${APP_DIR}"
  echo "target  : ${TARGET}"
  echo "current : ${CURRENT}"
  echo "service : $(systemctl is-active "${SERVICE}" 2>/dev/null || true)"
  exit 0
fi

if [ "${TARGET}" = "${CURRENT}" ] && [ "${FORCE}" = "0" ]; then
  echo "sudah di ${TARGET}; tidak ada perubahan"
  exit 0
fi

# Satu deploy pada satu waktu: timer dan deploy manual tidak boleh saling menimpa.
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "deploy lain sedang berjalan; dilewati"
  exit 0
fi

export PATH="/home/ubuntu/.nvm/versions/node/v22.23.4/bin:${PATH}"

# Timer berjalan sebagai user ubuntu, jadi restart unit sistem butuh sudo tanpa password.
as_root() {
  if [ "$(id -u)" = "0" ]; then "$@"; else sudo -n "$@"; fi
}

echo "=== deploy ${CURRENT} -> ${TARGET} ==="
git reset --hard --quiet "${TARGET}"

echo "--- migrasi ---"
if ! bash scripts/apply-migrations.sh apply; then
  echo "ERROR: migrasi gagal; build lama tetap jalan" >&2
  exit 1
fi

if ! command -v node >/dev/null; then
  echo "ERROR: node tidak ditemukan di PATH" >&2
  exit 1
fi

LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [ "${LOCK_HASH}" != "$(cat .deps-lock 2>/dev/null || true)" ]; then
  echo "--- dependency berubah, npm install ---"
  if ! npm install --no-audit --no-fund; then
    echo "ERROR: npm install gagal; build lama tetap jalan" >&2
    exit 1
  fi
  echo "${LOCK_HASH}" > .deps-lock
fi

# Build menulis langsung ke .output, jadi simpan salinan dulu: build gagal tidak boleh merusak
# artefak yang sedang dipakai service.
rm -rf .output.prev
cp -a .output .output.prev
echo "--- build ---"
if ! npm run build; then
  echo "ERROR: build gagal; mengembalikan .output sebelumnya" >&2
  rm -rf .output
  mv .output.prev .output
  exit 1
fi

BACKUP=".output.bak-$(date +%Y%m%d-%H%M%S)"
mv .output.prev "${BACKUP}"

rollback() {
  echo "ROLLBACK ke ${BACKUP} ..." >&2
  rm -rf .output
  mv "${BACKUP}" .output
  as_root systemctl restart "${SERVICE}" || true
}

echo "--- restart ${SERVICE} ---"
as_root systemctl restart "${SERVICE}"

FAILED=0
for _ in $(seq 1 20); do
  if systemctl is-active --quiet "${SERVICE}" &&
     [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)" = "200" ]; then
    break
  fi
  sleep 1
done
systemctl is-active --quiet "${SERVICE}" || FAILED=1

if [ "${FAILED}" = "0" ]; then
  echo "--- verifikasi route ---"
  while IFS= read -r path; do
    [ -n "${path}" ] || continue
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000${path}" || true)"
    printf '  %-30s %s\n' "${path}" "${code}"
    case "${code}" in 2??|3??) ;; *) FAILED=1 ;; esac
  done < <(bash scripts/list-routes.sh 2>/dev/null)

  asset="$(curl -s --compressed "${PUBLIC_URL}/" | grep -a -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 || true)"
  if [ -n "${asset}" ] && [ -f ".output/public/${asset}" ]; then
    echo "  asset ${asset} (cocok)"
  elif [ -n "${asset}" ]; then
    echo "PERINGATAN: HTML publik memuat ${asset} yang tidak ada di build ini" >&2
  fi
fi

if [ "${FAILED}" != "0" ]; then
  rollback
  exit 1
fi

echo "${TARGET}" > "${STATE_FILE}"
ls -1dt .output.bak-* 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -rf || true
echo "=== OK ${TARGET} ==="
