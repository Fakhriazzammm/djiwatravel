#!/usr/bin/env bash
# Apply one SQL migration to the Djiwa Travel Postgres as the schema owner.
#
# Why this exists: the runtime role (djiwatravel_app) is NOT the table owner, so a migration run
# as the app user fails with "must be owner of table ..." / "permission denied for schema public".
# The owner is djiwatravel_migrator, and `sudo -u postgres psql -f /root/...` cannot even read the
# file because /root is 0700. This script handles both, with ON_ERROR_STOP so a failure can never
# look like success.
#
# Usage:
#   scripts/run-migration.sh migrations/010_catalog_pricing_rules.sql
#   scripts/run-migration.sh migrations/010_catalog_pricing_rules.sql --owner djiwatravel_migrator
#   scripts/run-migration.sh migrations/010_catalog_pricing_rules.sql --grant esim_price_rule_events:select,insert,update
#   scripts/run-migration.sh migrations/010_catalog_pricing_rules.sql --verify "select count(*) from esim_price_rule_events"
#
# Exit codes: 0 applied (or --dry-run), non-zero = nothing assumed, read the output.

set -euo pipefail

FILE=""
OWNER="${MIGRATION_OWNER_ROLE:-}"
GRANTS=()
VERIFIES=()
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --owner) OWNER="$2"; shift 2 ;;
    --grant) GRANTS+=("$2"); shift 2 ;;
    --verify) VERIFIES+=("$2"); shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) FILE="$1"; shift ;;
  esac
done

[ -n "$FILE" ] || { echo "usage: $0 <file.sql> [--owner role] [--grant table:privs] [--verify sql] [--dry-run]" >&2; exit 2; }
[ -f "$FILE" ] || { echo "ERROR: migration file not found: $FILE" >&2; exit 2; }

# Credentials: prefer the service env file so the script behaves the same for every operator.
if [ -z "${DATABASE_URL:-}" ] && [ -f /etc/djiwatravel/esimaccess.env ]; then
  set -a; . /etc/djiwatravel/esimaccess.env; set +a
fi
[ -n "${DATABASE_URL:-}" ] || { echo "ERROR: DATABASE_URL is not set and /etc/djiwatravel/esimaccess.env is missing" >&2; exit 2; }

DB_NAME=$(psql "$DATABASE_URL" -tAc 'select current_database()')
APP_ROLE=$(psql "$DATABASE_URL" -tAc 'select current_user')

# Owner: explicit flag, then env, then detect from an existing table, then the known migrator role.
if [ -z "$OWNER" ]; then
  OWNER=$(psql "$DATABASE_URL" -tAc \
    "select tableowner from pg_tables where tablename in ('esim_price_rules','customer_orders','admin_settings') order by tablename limit 1" || true)
fi
: "${OWNER:=djiwatravel_migrator}"

echo "file    : $FILE"
echo "database: $DB_NAME"
echo "owner   : $OWNER"
echo "app role: $APP_ROLE"

if [ "$DRY_RUN" = "1" ]; then
  echo "--dry-run: nothing applied. Statements in the file:"
  grep -ciE '^\s*(alter|create|drop|grant|comment|insert|update)' "$FILE" || true
  exit 0
fi

# postgres (the superuser we sudo to) cannot read /root, so stage a world-readable copy and set the
# owner role inside the file itself: psql -c and -f do not mix with meta-commands like \i.
STAGE=$(mktemp /tmp/mig-XXXXXX.sql)
trap 'rm -f "$STAGE"' EXIT
printf 'set role %s;\n' "$OWNER" > "$STAGE"
cat "$FILE" >> "$STAGE"
chmod 644 "$STAGE"

echo "--- applying (ON_ERROR_STOP=1) ---"
sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$STAGE"
echo "MIGRATION_OK: $FILE"

for spec in "${GRANTS[@]:-}"; do
  [ -n "$spec" ] || continue
  TABLE="${spec%%:*}"
  PRIVS="${spec#*:}"
  [ "$PRIVS" != "$spec" ] || PRIVS="select"
  echo "--- grant $PRIVS on $TABLE to $APP_ROLE ---"
  # Objects created by the owner are not reachable by the app role until granted explicitly.
  sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 \
    -c "grant $PRIVS on $TABLE to $APP_ROLE;"
done

for sql in "${VERIFIES[@]:-}"; do
  [ -n "$sql" ] || continue
  echo "--- verify: $sql ---"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "$sql"
done

echo "DONE: $(sha256sum "$FILE" | cut -c1-16) $(date -u +%Y-%m-%dT%H:%M:%SZ)"
