# The Nexus Platform API — TypeScript backend

A 1:1 TypeScript port of the Python/FastAPI backend (`../backend`), built on
[Hono](https://hono.dev), `@supabase/supabase-js`, and [Zod](https://zod.dev).

It exposes the **same HTTP API** (same paths, same JSON shapes, same
`{ "detail": ... }` error envelope) and reads the **same environment
variables**, so the existing frontend and any existing `.env` work unchanged.

## Endpoints

- `GET  /health`
- `*    /api/platform/*` — auth, orgs, stages, join codes, dashboard, members
- `GET  /api/platform/bridge/context`

(The dead course/upload/mastery code in the Python `supabase_client.py` /
`local_store.py` was **not** ported — no router mounted it.)

## Run

```bash
cd backend-ts
npm install
cp .env.example .env      # fill in Supabase creds (same values as ../backend/.env)
npm run dev               # http://localhost:8000  (tsx watch)
```

Other scripts:

| command | purpose |
|---|---|
| `npm start` | run once (no watch) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (bridge-context mapping tests) |
| `npm run migrate` | apply `../backend/supabase/*.sql` via `DATABASE_URL` |

## Data layer

Mirrors the Python behavior exactly:

- **Supabase configured + schema migrated** → uses Postgres via `@supabase/supabase-js`.
- **Supabase configured, schema missing** → falls back to local JSON in
  `backend-ts/.local_data/` (detected by the `PGRST205` probe in `useLocal()`).
- **Supabase not configured** → platform routes return `503`, same as FastAPI.

## Structure

| TypeScript | Ported from (Python) |
|---|---|
| `src/config.ts` | `app/config.py` |
| `src/supabaseClient.ts` | `app/supabase_client.py` (client factories only) |
| `src/permissions.ts` | `app/platform_permissions.py` |
| `src/platformLocalStore.ts` | `app/platform_local_store.py` |
| `src/platformDb.ts` | `app/platform_db.py` |
| `src/auth.ts` | `app/platform_auth.py` |
| `src/schemas.ts` | `app/schemas_platform.py` (Pydantic → Zod) |
| `src/routes/platform.ts` | `app/routers/platform.py` |
| `src/routes/bridge.ts` | `app/routers/bridge_context.py` |
| `src/app.ts` + `src/index.ts` | `app/main.py` |
| `scripts/runMigrations.ts` | `scripts/run_platform_migrations.py` |
| `tests/bridge.test.ts` | `tests/test_bridge_context.py` |

## Notes / follow-ups

- Field names are kept **snake_case** throughout (DB rows, internal objects,
  and JSON responses) to preserve the exact contract the frontend consumes.
- `truststore` (corporate-proxy TLS) has no equivalent here — Node uses the OS
  certificate store natively, so it's not needed.
- Once verified, the Python `../backend` folder can be removed, and the
  frontend's dev-error hint (`services/api.ts`, "cd backend && uvicorn …") can
  be updated to `cd backend-ts && npm run dev`.
- Deploy: `npm start` runs a Node server (parity with uvicorn). For Vercel,
  Hono also has an edge/serverless adapter if you later want same-project
  deploy with the frontend.
