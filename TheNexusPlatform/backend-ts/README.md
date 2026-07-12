# Nexus Platform API — TypeScript (Hono)

A TypeScript port of the Python/FastAPI platform backend (`../backend`). Same
HTTP contract: identical routes, snake_case JSON, and the FastAPI `{ "detail": ... }`
error envelope — so the existing frontends work against it with **zero code changes**.

Stack: **Hono** + `@hono/node-server` + `@supabase/supabase-js` + **Zod** + `tsx` + **Vitest**.
No ORM — every query is contained in `src/platformDb.ts`, so a later move to
Drizzle/Prisma is a one-file refactor (honors the v3 §23 portability rule).

## Scope

This port covers the **platform layer only**: auth, organizations, programs,
stages/groups, offerings, registered apps, the signup hook, participants,
registrations, entitlements, audit, and the mock game scenario generator.

The **learning subsystem** (`content`, `courses`, `uploads`, `learning`, ingest,
BM25 RAG, PDF extraction) is **not** ported — per the v3 architecture, Nexus does
not own learning content; that becomes a separate Learning Platform app connected
via the registered-app / hook / launch-context boundary. See "Dropped endpoints".

## Running

```bash
cd backend-ts
npm install
cp .env.example .env        # or copy ../backend/.env — same var names
npm run dev                 # tsx watch, port 8000 (override with PORT)
```

Without Supabase configured (or when the schema isn't migrated), the backend
runs in **demo mode** against a local JSON store — the same dual-mode fallback as
the Python backend. By default it reads/writes `../backend/.local_data` so demo
data carries over; override with `LOCAL_DATA_DIR`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | `tsx watch src/index.ts` (hot reload) |
| `npm start` | run once |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit + in-process route tests |
| `npm run migrate` | apply `../backend/supabase/*.sql` over `DATABASE_URL` |
| `npm run parity` | boot Python (:8009) + TS (:8010), diff the acceptance flow |

Migrations read the SQL from `../backend/supabase/` (Python side stays the single
source of truth), in the same order as `run_platform_migrations.py`.

## Python → TypeScript file map

| Python (`backend/app/`) | TypeScript (`backend-ts/src/`) |
|---|---|
| `main.py` | `index.ts` + `app.ts` |
| `config.py` | `config.ts` |
| `supabase_client.py` (platform parts) | `supabaseClient.ts` |
| `platform_auth.py` | `auth.ts` |
| `platform_permissions.py` | `permissions.ts` |
| `platform_db.py` | `platformDb.ts` |
| `platform_local_store.py` | `platformLocalStore.ts` |
| `game_store.py` | `gameStore.ts` |
| `schemas_platform.py` + `schemas_game.py` | `schemas.ts` |
| `claude.py` | `claude.ts` |
| `routers/platform.py` | `routes/platform.ts` |
| `routers/offerings.py` | `routes/offerings.ts` |
| `routers/hook.py` | `routes/hook.ts` |
| `routers/game.py` | `routes/game.ts` |
| `scripts/run_platform_migrations.py` | `scripts/runMigrations.ts` |

The route inventory matches the Python backend exactly (51 routes + `/health`),
verified by `npm run parity`.

## Behavior parity notes

- **Error envelope**: all errors render as `{ "detail": ... }`; validation errors
  as `{ "detail": [{ loc, msg, type }] }`. Zod and Pydantic word validation
  *messages* differently and Pydantic adds `input`/`ctx`; the frontends only
  consume `detail[].msg`, so this is contract-compatible, not byte-identical.
- **Hashing is byte-identical** to Python: API keys `nxk_` + base64url(32 bytes),
  sha256-hashed; launch tokens base64url(24 bytes), sha256, 60s single-use.
- **Datetimes** are ISO strings passed through as stored; `new Date()` on the
  frontend parses both the `Z` and `+00:00` forms.
- **Audit is best-effort** (never throws); **entitlements are permissive when
  unconfigured**; the `nexus` module cannot be disabled — all preserved.

## Dropped endpoints (learning subsystem)

These return `404 { "detail": "Not Found" }` (no stubs). Only the root `src/`
student app uses them; it will regress until a Learning Platform app is wired in.

```
POST /api/content/generate            POST /api/courses/preview-structure
POST /api/content/assistant           GET  /api/courses/ingest-jobs/{id}
GET  /api/content/module/{id}         POST /api/courses
GET  /api/learning/mastery/{id}       GET  /api/courses/join/{code}
POST /api/learning/attempt            GET  /api/courses/{id}
POST /api/uploads                     POST /api/courses/{id}/enroll
```

## Deploying to Vercel (swap from the Python backend)

The repo's root `vercel.json` currently points the `backend` service at the
Python app (`backend`, `app.main:app`). Swapping to this TS backend is the last
step — **verify it on a Vercel preview deployment before promoting**, since it
can't be checked locally. Two options:

### Option A — keep the `services` schema (minimal diff)

Repoint the `backend` service in `vercel.json`:

```json
"backend": { "root": "backend-ts", "entrypoint": "src/index.ts" }
```

Deploy to a preview and confirm `/health` + a login flow before promoting. The
`services` Node-entrypoint format isn't publicly documented; if the preview build
fails, use Option B.

### Option B — standard serverless function (well-documented fallback)

1. Create `api/[[...route]].ts` at the repo root:

   ```ts
   import { handle } from "hono/vercel";
   import { createApp } from "../backend-ts/src/app";
   export const config = { runtime: "nodejs" };
   export default handle(createApp());
   ```

2. Add an `/api/health` alias in `src/app.ts` (one line next to `/health`) and
   rewrite `/health` → `/api/health` in `vercel.json`.
3. Add the runtime deps (`hono`, `@hono/node-server`, `@supabase/supabase-js`,
   `zod`, `@anthropic-ai/sdk`) to the **root** `package.json` so the function
   bundler resolves them, and drop the `backend` service + its `/api` rewrite.

Either way, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
`FRONTEND_ORIGIN`, and `EXTRA_CORS_ORIGINS` in the Vercel project. Production has
no `.local_data` (`.vercelignore`), so Supabase must be configured there.
Rollback is a one-line `vercel.json` revert.
