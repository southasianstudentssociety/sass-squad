#!/usr/bin/env bash
# Apply every migration to a fresh local database, then run the test files.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-sass_test}
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "alter database $DB set search_path = \"\$user\", public, extensions"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/supabase_stub.sql
for f in migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null || { echo "FAILED: $f"; exit 1; }
done
echo "Migrations applied."
for t in tests/test_*.sql; do
  [ -e "$t" ] || continue
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$t" || { echo "FAILED: $t"; exit 1; }
  echo "ok  $t"
done
