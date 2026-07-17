# Dev Environment Runbook

Local setup for the Nexus platform (single TypeScript backend + `platform_logic` frontend + local Postgres). Established in Phase 0 of `NEXUS_CURRENT_IMPLEMENTATION_PLAN.md`.

## One-time install
- **PostgreSQL 16** via Homebrew: `brew install postgresql@16` (installed).
- Data dir initialized at `~/nexus-dev-pg` (superuser role `rahul`, trust auth, port **5433**).

## Start Postgres
```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
pg_ctl -D "$HOME/nexus-dev-pg" -o "-p 5433 -k /tmp" -l "$HOME/nexus-dev-pg/server.log" start
```
Connection string: `postgresql://rahul@localhost:5433/nexus_dev`

## Backend (`nexus/TheNexusPlatform/backend-ts`, port 8000)
`.env` is already written with `DATABASE_URL` pointing at the local DB.
```bash
cd nexus/TheNexusPlatform/backend-ts
npm install                       # once
npm run migrate                   # DATABASE_URL must be in env (see note)
npm run seed:admin                # platform operator account
npx tsx scripts/seedDemoData.ts   # org + programs + offerings + app + registrations
npm start                         # serves http://localhost:8000
```
> **Note:** `runMigrations.ts` does not load `.env`. Run migrate with the URL in the environment:
> `DATABASE_URL='postgresql://rahul@localhost:5433/nexus_dev' npm run migrate`

### Reset the DB to a clean state
```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
dropdb -h localhost -p 5433 -U rahul nexus_dev && createdb -h localhost -p 5433 -U rahul nexus_dev
cd nexus/TheNexusPlatform/backend-ts
DATABASE_URL='postgresql://rahul@localhost:5433/nexus_dev' npm run migrate
DATABASE_URL='postgresql://rahul@localhost:5433/nexus_dev' npm run seed:admin
npx tsx scripts/seedDemoData.ts      # backend must be running
```

## Frontend (`nexus/TheNexusPlatform/platform_logic`, port 5180)
```bash
cd nexus/TheNexusPlatform/platform_logic
npm install                       # once
npm run dev                       # serves http://localhost:5180
```
No env needed — `apiBase.ts` defaults to `http://localhost:8000` in dev. The backend's
CORS allows any localhost origin, so `:5180` works out of the box.

## App Shell runtime (`nexus/TheNexusPlatform/app_shell`, port 5175)
The real end-user app runtime (`@laic/app-shell`). Boots any Nexus-published shell config:
```bash
cd nexus/TheNexusPlatform/app_shell
npm install                       # once
npm run dev                       # serves http://localhost:5175
# open http://localhost:5175/?app=bridge-ai-coach
```
`.env.local` holds `VITE_NEXUS_URL` and `VITE_NEXUS_HOOK_KEY` (the app's hook key — rotate it
from the Nexus Shell editor and update this file; dev-only, a production app proxies the hook
server-side). Bundled demo slugs (brainbee/mindaib/bridgecoach) stay on offline mock data; any
other slug fetches the latest **published** config from Nexus. Signups made in the app create
real accounts and land in that offering's registration queue in Nexus.

## Demo logins
| Role | Where to sign in | Email | Password |
|---|---|---|---|
| Platform operator (Nexus admin) | `http://localhost:5180/login` | `devteam@mindbrainai.nexus` | `L1FE1n@I123` |
| Org admin (Life in AI Center) | `http://localhost:5180/@/life-in-ai-center` | `ashvin@laic.org` | `demo-password-123` |

**Dev quick sign-in:** in dev builds, the operator gate shows one-tap seed-account buttons
(`platform_logic/src/nexus/dev/personas.ts`). Every org portal and the topbar "Test as…" switcher
instead show **real, live** people — every actual org member/admin, fetched from
`GET /api/platform/dev/personas` — so anyone you invite from Org Settings immediately appears as a
testable persona, including on the topbar's "People in this org" list. Clicking a **pending
invitee** auto-activates their account via `POST /api/platform/dev/login-as` (creates their
profile + real membership on first click — no need to walk the `/invite/:token` link) and logs you
in as them for real (not a visual preview — you get their actual `/auth/me` identity). The topbar
switcher also lists **roles defined in the current program** (§Team & Roles) for one-click role
preview. All of this is gated by `_devLoginEnabled()` on the backend (on whenever Supabase isn't
configured, i.e. local dev) and `import.meta.env.DEV` on the frontend — never active in a
Supabase-backed / production deployment.

## Org separation (portals)
- Operators sign in at the bare gate `/login`; **organizations sign in at their own branded portal**
  `/@/:slug` (e.g. `/@/life-in-ai-center`), which shows the org's name, logo, and accent.
- The org slug is resolved in one place — `platform_logic/src/nexus/orgResolver.ts`. It reads the
  path today; switching to real subdomains (`laic.lvh.me` / `laic.nexus.app`) later means editing
  only `orgSlugFromLocation()` (the subdomain branch is already stubbed there) plus adding the host
  to Vite `allowedHosts` and the backend CORS list.
- The actual isolation wall is the backend's org-scoping/RLS, not the URL — the portal is
  presentation that makes the separation legible.

## Auth model in local dev (important)
- **No Supabase configured**, so auth runs in *demo-token mode*: the access token **is the user id** (no JWT). Platform data still lives in **Postgres** (DB mode is active via `DATABASE_URL`).
- Consequence: `GET /api/platform/orgs/mine` can return `[]` because it matches on `owner_id`, which the demo signup path sets to a different profile id than the caller's. Resolve an org via `GET /api/platform/auth/me` → `memberships[].org_id` instead (the seed script does this).

## Gotchas hit during setup
- A **stale, unrelated backend** from `~/Downloads/owlwise-2/backend-ts` was occupying port 8000 (running in local-JSON mode). If data behaves inconsistently, check `lsof -ti :8000` and kill strays before `npm start`.
- Migrations self-create the `uuid-ossp` extension and the `nexus_app` RLS role, so a superuser dev connection (the default `rahul`) is required for `npm run migrate`.
- **A profile's `id` is not always its auth/session id.** Since migration `0010`, one auth credential can back several org-scoped `profiles` rows (`profiles.auth_user_id`), so a profile's own `id` may differ from the id that actually authenticates. `dev/login-as` returns `profile.auth_user_id ?? profile.id` for exactly this reason — using `profile.id` directly caused "test as" to silently fail (`/auth/me` → 401 → session cleared → redirected to `/login`/`/orgs` unexpectedly). Any new code that mints a session for an existing profile must do the same.

## Live deployment (Vercel)

- Frontend: https://platformlogic.vercel.app (project `platform_logic`, deploy from `platform_logic/`)
- Backend: https://nexus-backend-teal.vercel.app (project `nexus-backend`, deploy from `backend-ts/`)
- Database: Neon Postgres (`neon-bronze-saddle`, connected to `nexus-backend`; `DATABASE_URL` auto-provisioned)
- Backend entry: `src/vercelEntry.ts` → bundled by `npm run build:vercel` into `api/index.mjs` (run before `vercel deploy`).
  Uses per-method web-handler exports — a default (req, res) handler starves `c.req.json()` because Vercel pre-reads the body.
- Demo auth on Postgres: `demo_auth_users` (migration 0020) replaces the JSON-file store whenever `DATABASE_URL` is set.
- Neon needs `grant nexus_app to neondb_owner;` once (local superuser could SET ROLE implicitly; neondb_owner cannot).
- Frontend prod env: `VITE_API_URL` (backend URL), `VITE_DEV_LOGINS=1` (keeps quick-login/test-as buttons in the public demo —
  anyone with the URL can sign in as anyone; demo data only).
- Reseed: `BASE_URL=https://nexus-backend-teal.vercel.app npx tsx scripts/seedDemoData.ts` (operator first via
  `DATABASE_URL=<neon> npx tsx scripts/seedPlatformAdmin.ts`).
- Known gap: logo uploads on the live site don't persist (filesystem storage adapter; set S3_BUCKET for real storage).
