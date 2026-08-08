# db/

Drizzle ORM schema and SQL migrations for the Bridge Platform (Supabase
Postgres, same project as `TheNexusPlatform` so `nexusUserId` = Supabase auth
user id).

## Apply pending migrations

```
pnpm db:apply       # from Applications/BridgePlatform
pnpm db:status      # list applied vs pending, change nothing
```

Migrations live in `db/migrations/NNNN_name.sql`, applied in filename order; the
applied set is tracked in the `bridge_migrations` table. The runner
(`db/apply.mjs`) reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
from `apps/bridge-web/.env.local` and applies each pending file through the
`bridge_exec_migration` RPC — no browser, no DB password. A migration is recorded
in the ledger only after it succeeds.

## One-time bootstrap

The runner needs a small helper (the ledger table + a service-role-only exec
function) created once. Run **`db/_bootstrap.sql`** a single time — paste it into
the Supabase SQL editor and press Run, or feed it through any connection with DDL
rights. It also seeds the ledger with everything already applied through `0026`,
so the first `pnpm db:apply` only runs anything newer.
`node db/apply.mjs --bootstrap` prints that SQL to stdout.

## Writing a migration

- Next number, zero-padded four digits; describe it in the name.
- Idempotent where practical (`create table if not exists`, `add column if not
  exists`) so a re-run is harmless.
- Enable RLS on any new table.
- New numbers only — never renumber an applied migration.
