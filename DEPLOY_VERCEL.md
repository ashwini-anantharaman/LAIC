# Deploying Nexus to Vercel (org: `the-nexus-dev-team`)

Five separate Vercel **projects**, all importing this same GitHub repo but each
with a different **Root Directory**. Deploy the **backend first**, then the
frontends (they need the backend's URL), then wire the backend's URLs back.

| # | Project (suggested name) | Root Directory | Framework | Notes |
|---|---|---|---|---|
| 1 | `nexus-api` | `TheNexusPlatform/backend-ts` | Other | Hono serverless (Node) |
| 2 | `nexus-bridge` | `Applications/BridgePlatform/apps/bridge-web` | Next.js | already deployed today |
| 3 | `nexus-console` | `TheNexusPlatform/platform_logic` | Vite | operators + org portals |
| 4 | `nexus-appshell` | `TheNexusPlatform/app_shell` | Vite | Studio + live player |
| 5 | `nexus-learning` | `Components/laic-learning-platform` | Vite | learning platform |

> The old `TheNexusPlatform/vercel.json` (a Python-monolith config) is **not**
> used by these per-app projects — do **not** create a project whose Root
> Directory is `TheNexusPlatform`.

---

## Per-project setup (Vercel dashboard)

For each: **Add New → Project → import this repo → set Root Directory → add env
vars → Deploy.** Framework auto-detects from the `vercel.json` I added.

### 1. `nexus-api`  (deploy FIRST)
Root: `TheNexusPlatform/backend-ts`. Env vars:

| Key | Value |
|---|---|
| `DATABASE_URL` | Supabase **Transaction pooler** string, **port 6543** — `postgresql://postgres.cegdgojouixxcqerylzd:<DB-PW>@aws-1-us-west-2.pooler.supabase.com:6543/postgres` |
| `DB_PREPARE` | `false` |
| `SUPABASE_URL` | `https://cegdgojouixxcqerylzd.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the **legacy `service_role` JWT** (`eyJ…`) |
| `FRONTEND_ORIGIN` | console URL (fill after #3, then redeploy) |
| `BRIDGE_PLATFORM_URL` | bridge URL (fill after #2, then redeploy) |
| `LEARNING_PLATFORM_URL` | learning URL (fill after #5, then redeploy) |
| `EXTRA_CORS_ORIGINS` | *(optional)* any non-`*.vercel.app` origins, comma-separated |

- **Do NOT set `NEXUS_ENABLE_DEV_LOGIN`.** Dev quick sign-in is password-less
  impersonation — off in production. You sign in with real credentials.
- ⚠️ **Transaction pooler (6543), not session pooler (5432).** Serverless opens
  many short-lived connections; `DB_PREPARE=false` is required for it.
- CORS already allows any `*.vercel.app` origin, so the frontends work without
  extra config.
- Grab the deployed URL (e.g. `https://nexus-api.vercel.app`) for the rest.

### 2. `nexus-bridge`
Root: `Applications/BridgePlatform/apps/bridge-web`. Env vars:

| Key | Value |
|---|---|
| `NEXUS_CLIENT_MODE` | `http` |
| `NEXUS_API_BASE_URL` | the `nexus-api` URL |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://cegdgojouixxcqerylzd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **legacy anon JWT** (`eyJ…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | the legacy `service_role` JWT |
| `STORE_BACKEND` | `postgres` |
| `ANTHROPIC_API_KEY` | *(only if you use LLM extraction)* |

### 3. `nexus-console`
Root: `TheNexusPlatform/platform_logic`. Env vars:

| Key | Value |
|---|---|
| `VITE_API_URL` | the `nexus-api` URL |

(The build **fails on purpose** if `VITE_API_URL` is unset or localhost in prod.)

### 4. `nexus-appshell`
Root: `TheNexusPlatform/app_shell`. Env vars:

| Key | Value |
|---|---|
| `VITE_API_URL` | the `nexus-api` URL |

### 5. `nexus-learning`
Root: `Components/laic-learning-platform`. Env vars:

| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | the `nexus-api` URL  *(note: `_BASE_` — different name)* |

---

## Order & back-wiring
1. Deploy **`nexus-api`** → note its URL.
2. Deploy **bridge, console, app_shell, learning** with the API URL in their env.
3. Go back to **`nexus-api`** env and fill `FRONTEND_ORIGIN` (console),
   `BRIDGE_PLATFORM_URL` (bridge), `LEARNING_PLATFORM_URL` (learning) → **Redeploy**
   (Vercel only picks up env changes on a new deployment).

## Sign-in in production
- No dev quick sign-in. Operators sign in at the console `/login` with real
  credentials (e.g. `devteam@mindbrainai.nexus`). Org members use their org
  portal `/@/<slug>`.
- The 11 backfilled members can sign in with the temp password already set.

## Known limitation (plain `.vercel.app` domains)
- Console → **Bridge launch (full-page redirect) works** across domains.
- The **App-Shell in-iframe embed of Bridge will NOT work** — it relies on a
  same-site cookie, which a cross-domain iframe won't send. To get the embed in
  prod, put the apps on subdomains of one custom domain (e.g. `api.`, `app.`,
  `bridge.` under `nexus.xxx`) or add partitioned cookies. Deferred for now.

## Database migrations
Already applied to Supabase. On future schema changes, run migrations **locally**
against the **session pooler (5432)** (not from Vercel):
`cd backend-ts && DATABASE_URL=<session-pooler-5432> npm run migrate`.

## What I changed in the repo for this
- `backend-ts/api/index.ts` — Hono→Vercel Node serverless entry.
- `backend-ts/vercel.json` — Node function + region + rewrite to the entry.
- `app_shell/src/nexus/client.ts` + `src/vite-env.d.ts` — API URL now env-driven.
- `app_shell/vercel.json`, `Components/laic-learning-platform/vercel.json` — SPA configs.
- `offerings.ts` — Bridge/Learning launch URL now follows the current env
  (fixes launches pointing at a stale stored URL).

> First deploy caveat: the backend on serverless is the least-tested piece. If
> the function errors on first hit, check the Vercel function logs — the usual
> culprits are `DATABASE_URL` still on 5432 (use 6543) or `DB_PREPARE` unset.
