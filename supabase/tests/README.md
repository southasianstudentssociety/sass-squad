# Database tests

Applies every migration to a throwaway local Postgres 16 (with a small stub of
Supabase's `auth` and `storage` schemas), then runs each `test_*.sql` as
different users. Every test file runs in a transaction and rolls back.

```bash
# one-off: a local server on port 54329, run as a non-root user
/usr/lib/postgresql/16/bin/initdb -D ~/pgdata -U postgres --auth=trust
/usr/lib/postgresql/16/bin/pg_ctl -D ~/pgdata -o "-p 54329 -k $HOME" -l ~/pg.log start

PGHOST=$HOME PGPORT=54329 PGUSER=postgres supabase/tests/run.sh
```
