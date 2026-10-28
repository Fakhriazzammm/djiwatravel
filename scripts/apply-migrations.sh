#!/usr/bin/env bash
# Apply pending SQL migrations on the Djiwa Travel host, tracked in deploy_schema_migrations.
#
# Runs where the database lives (peer auth as the owning role). The deploy script syncs
# migrations/ and this file to the host, then calls it before swapping the app build.
#
# Usage:
#   scripts/apply-migrations.sh              # apply every migration not recorded yet
#   scripts/apply-migrations.sh --status     # show applied / pending / checksum drift
#   scripts/apply-migrations.sh --baseline   # record existing files as applied, run nothing
#
# Baseline is for a host whose schema is already current but has no tracking table yet.
# Never baseline a host that still needs migrations applied.
#
# Exit codes: 0 ok (or nothing pending), non-zero = a migration failed and was rolled back.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${PROJECT_DIR}/migrations"
DB_URL="${DATABASE_URL:-postgresql:///djiwatravel?host=/var/run/postgresql&user=ubuntu}"
MODE="${1:-apply}"

case "${MODE}" in
  apply|--status|--baseline) ;;
  -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
  *) echo "unknown argument: ${MODE}" >&2; exit 2 ;;
esac

psql "${DB_URL}" -v ON_ERROR_STOP=1 -q -c "
  create table if not exists deploy_schema_migrations (
    version text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )" >/dev/null

checksum() { sha256sum "$1" | cut -d' ' -f1; }
is_applied() { psql "${DB_URL}" -tAc "select checksum from deploy_schema_migrations where version = '$1'"; }

if [ "${MODE}" = "--baseline" ]; then
  for file in "${MIGRATIONS_DIR}"/*.sql; do
    version="$(basename "${file}")"
    psql "${DB_URL}" -v ON_ERROR_STOP=1 -q -c \
      "insert into deploy_schema_migrations (version, checksum) values ('${version}', '$(checksum "${file}")')
       on conflict (version) do nothing"
  done
  echo "BASELINE_OK: $(psql "${DB_URL}" -tAc 'select count(*) from deploy_schema_migrations') migrasi tercatat"
  exit 0
fi

if [ "${MODE}" = "apply" ] &&
   [ "$(psql "${DB_URL}" -tAc 'select count(*) from deploy_schema_migrations')" = "0" ] &&
   compgen -G "${MIGRATIONS_DIR}/*.sql" >/dev/null; then
  echo "ERROR: tabel deploy_schema_migrations masih kosong, jadi semua migrasi akan dijalankan ulang." >&2
  echo "       Jika skema host ini sudah current, jalankan sekali: bash scripts/apply-migrations.sh --baseline" >&2
  echo "       Jika belum, jalankan migrasi manual sampai current lalu baseline." >&2
  exit 3
fi

pending=0
drift=0
for file in "${MIGRATIONS_DIR}"/*.sql; do
  version="$(basename "${file}")"
  sum="$(checksum "${file}")"
  recorded="$(is_applied "${version}")"

  if [ "${MODE}" = "--status" ]; then
    if [ -z "${recorded}" ]; then
      echo "PENDING  ${version}"
    elif [ "${recorded}" != "${sum}" ]; then
      echo "DRIFT    ${version}"
      drift=$((drift + 1))
    else
      echo "applied  ${version}"
    fi
    continue
  fi

  [ -z "${recorded}" ] || {
    if [ "${recorded}" != "${sum}" ]; then
      echo "PERINGATAN: ${version} sudah diterapkan tapi isinya berubah (checksum beda); tidak dijalankan ulang." >&2
      drift=$((drift + 1))
    fi
    continue
  }

  pending=$((pending + 1))
  echo "--- apply ${version} ---"
  # -1: satu transaksi per file, jadi migrasi yang gagal tidak meninggalkan setengah skema.
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -1 -q -f "${file}"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -q -c \
    "insert into deploy_schema_migrations (version, checksum) values ('${version}', '${sum}')"
  echo "OK       ${version}"
done

if [ "${MODE}" = "--status" ]; then
  exit 0
fi

echo "MIGRATIONS_DONE: ${pending} baru diterapkan, ${drift} checksum drift"
