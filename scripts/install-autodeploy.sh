#!/usr/bin/env bash
# Install/refresh the auto-deploy timer on the production VPS. Run ON the VPS with sudo:
#
#   sudo bash scripts/install-autodeploy.sh
#
# It requires the app directory to already be a git checkout of the repo (see README). Safe to
# re-run: units are replaced, the timer restarted, and .deployed-sha is only initialised when absent.

set -euo pipefail

APP_DIR="${DJIWA_APP_DIR:-/home/ubuntu/djiwatravel}"
BRANCH="${DJIWA_BRANCH:-main}"
SERVICE_USER="${DJIWA_SERVICE_USER:-ubuntu}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ "$(id -u)" = "0" ] || { echo "ERROR: jalankan dengan sudo" >&2; exit 2; }
[ -d "${APP_DIR}/.git" ] || { echo "ERROR: ${APP_DIR} belum git checkout" >&2; exit 2; }

install -m 644 "${SCRIPT_DIR}/systemd/djiwa-autodeploy.service" /etc/systemd/system/djiwa-autodeploy.service
install -m 644 "${SCRIPT_DIR}/systemd/djiwa-autodeploy.timer" /etc/systemd/system/djiwa-autodeploy.timer
systemctl daemon-reload

if [ ! -f "${APP_DIR}/.deployed-sha" ]; then
  sudo -u "${SERVICE_USER}" git -C "${APP_DIR}" fetch --quiet origin "${BRANCH}"
  sudo -u "${SERVICE_USER}" git -C "${APP_DIR}" rev-parse FETCH_HEAD > "${APP_DIR}/.deployed-sha"
  chown "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}/.deployed-sha"
  echo "baseline .deployed-sha = $(cat "${APP_DIR}/.deployed-sha")"
fi

[ -f "${APP_DIR}/.deps-lock" ] || {
  sudo -u "${SERVICE_USER}" sh -c "cd '${APP_DIR}' && sha256sum package-lock.json | cut -d' ' -f1" > "${APP_DIR}/.deps-lock"
  chown "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}/.deps-lock"
}

systemctl enable --now djiwa-autodeploy.timer
systemctl restart djiwa-autodeploy.timer

echo "--- timer ---"
systemctl list-timers djiwa-autodeploy.timer --no-pager
echo "AUTODEPLOY_OK: memantau origin/${BRANCH} setiap 3 menit"
