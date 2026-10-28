#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-/Users/apple/Applications/Postgres.app/Contents/Versions/latest/bin}"
DATA_DIR="${PROJECT_DIR}/.local/postgres"
DB_NAME="${LOCAL_DB_NAME:-djiwatravel}"
DB_URL="${DATABASE_URL:-postgresql://apple@127.0.0.1:5432/${DB_NAME}}"

command -v node >/dev/null || { echo "node tidak ditemukan" >&2; exit 1; }
[ -x "${PG_BIN}/initdb" ] || {
  echo "PostgreSQL tidak ditemukan di ${PG_BIN}. Pasang Postgres.app atau ubah PG_BIN." >&2
  exit 1
}

mkdir -p "${DATA_DIR}"
if [ ! -f "${DATA_DIR}/PG_VERSION" ]; then
  "${PG_BIN}/initdb" -D "${DATA_DIR}" -U apple --auth=trust --no-locale --encoding=UTF8
fi

if ! "${PG_BIN}/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  "${PG_BIN}/pg_ctl" -D "${DATA_DIR}" -l "${DATA_DIR}/server.log" -o "-p 5432" start
fi

"${PG_BIN}/createdb" -h 127.0.0.1 -p 5432 -U apple "${DB_NAME}" 2>/dev/null || true

DATABASE_URL="${DB_URL}" npx drizzle-kit push
echo "Local database ready: ${DB_URL}"
