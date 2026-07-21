# Learning Platform integration plan (mirror of the Bridge integration)

Goal: integrate the LAIC Learning Platform (`origin/ashwiniNew`, live at
laic-smoky.vercel.app) into Nexus the same way the Bridge Platform was — Nexus
is the single login/identity authority, the platform receives a session via a
launch-token handshake, roles are stored centrally in Nexus and shown
"managed in Learning Platform" (read-only) on the console, admins are editable
and can assign/remove roles. Reuse the Bridge machinery; don't re-debug it.

---

## 1. What already exists (the head start)

**Nexus side — Quan mirrored these from Bridge; they're live in QR-version:**
- `GET /api/platform/learning/context` — returns the caller's learning role via
  `LEARNING_ROLE_MAP` (learning_admin / instructor / reviewer / student), honors
  the org's `learning` module entitlement + the program's `learning` feature.
- `POST /api/programs/:id/learning-platform/launch` — find-or-creates the
  program's `learning-platform-<id>` registered app, mints a single-use launch
  token, hands off to `launch_url` when `LEARNING_PLATFORM_URL` is set.
- `LearningLaunch.tsx` (Nexus console) — the launch surface; already does the
  `?launch_token=…&return_url=…` handoff exactly like BridgeLaunch, plus the
  Sign-out control.
- Learning schema pack: `migrations/platforms/learning/0001_learning_schema.sql`
  — an org-scoped `learning_objects` landing zone in the SHARED Supabase, whose
  row shape already mirrors the app's `src/lib/supabase.ts` toRow/fromRow. Plus
  `9000_nexus_hardening.sql` (revokes nexus_app, learning_service RLS scaffold).
- `platform_role_assignments` table has a generic `platform` column — already
  stores `"bridge"`; `"learning"` needs no schema change.

**Learning app side (ashwiniNew):**
- `src/app/components/screens/AdminPeopleRoles.tsx` — a People & Roles screen
  already built (permission catalogue + role presets). Today it's cosmetic
  (persists nothing) — we wire it to the Nexus endpoints.
- Role taxonomy in `src/lib/types.ts` (administrator / content-developer /
  object-reviewer / course-reviewer / coach / student).
- `learning_objects` persistence via a client-side Supabase (anon key), its OWN
  project. Most domain data is still hardcoded in `src/lib/data.ts`.

**What this means:** the console, the launch seam, the role map, the schema, and
even the platform's People screen mostly exist. The work is (a) a small backend
generalization, (b) app-side auth seams, (c) data/deploy.

---

## 2. Key differences from Bridge (what makes it not identical)

1. **Vite SPA, not Next.js.** Bridge (bridge-web) was Next.js with server
   components + route handlers → it held the Nexus session in an **httpOnly
   cookie** and fetched `/bridge/context` server-side. The Learning app is a
   static Vite SPA; its `server/index.mjs` is a stateless Anthropic proxy with
   open CORS and no session store. So the launch token/session will live in the
   **browser (localStorage)** and the SPA calls `/learning/context` with a
   bearer header. Weaker than httpOnly, but fine for "make it real, not
   perfect." (A tiny Vercel serverless function could restore httpOnly later.)
2. **No auth to remove — and no router in use.** It has a demo persona picker
   (`LoginPortal.tsx`, client-side `isLoggedIn` flag). `react-router` is a dep
   but unused (manual `currentScreen` state). We add launch handling before the
   gate and replace the picker with Nexus-context hydration.
3. **Separate Supabase (anon key, client-side writes).** One table
   (`learning_objects`) + a `media` bucket. Different project from Nexus.

---

## 3. The generalization move (do this FIRST — it's what makes it easy)

Turn the Bridge-specific people machinery into a `platform`-parameterized one so
Learning reuses every fix we made (admin read-only, trash-can removal,
invite-with-role, `is_admin` via effective grant, etc.). Backend only:

- `GET/PUT/DELETE /api/platform/bridge/people*` → `…/platforms/:platform/people*`
  (keep `bridge` working, add `learning`). `_requireBridgeAdmin` →
  `_requirePlatformAdmin(user, platform, programId)`.
- Per-platform assignable role sets + admin-tier sets:
  - bridge: coach / reviewer / learner (admin read-only)
  - learning: instructor / reviewer / student (admin read-only) — from
    LEARNING_ROLE_MAP; confirm the exact labels with Ashwini's screen.
- `platformAccess._grantLevel`: the pre-built-role lookup is bridge-only today;
  generalize to look up the assignment for the requested `area`/platform (a
  learning pre-built role → its grant level, same as bridge).
- `my-role` (offerings.ts): today merges only the `bridge` assignment; loop over
  platforms so `perms.learning` is set for a learning-assigned student (this is
  what makes the confined nav + auto-launch work for Learning).
- Nexus `ProgramTeam` People table: reflect ANY platform role greyed as
  "managed in <Platform>" (bridge OR learning), not just bridge.

Effort: small/mechanical. No new concepts — it's the same code with a parameter.

---

## 4. App-side work (ashwiniNew → integrated), mirroring bridge-web

1. **Bring ashwiniNew's current code into the monorepo**, replacing the stale
   `Components/laic-learning-platform` snapshot, so it shares
   `@laic/learner-contracts` and deploys like Bridge (git-less deploy, own
   Vercel project). Ashwini keeps developing on her standalone repo.
2. **Launch entry**: handle `/launch?launch_token=…&program_id=…&return_url=…`
   before the auth gate (parse `window.location`; adopting the already-present
   react-router is optional). Exchange the token at
   `POST /api/platform/auth/launch-exchange`, store the returned Nexus session
   token + program id in localStorage.
3. **Context + gate**: a client module (parallel to `src/lib/api.ts`) that GETs
   `/api/platform/learning/context` with the bearer token; gate the app on it
   (replace `isLoggedIn`/LoginPortal). Map the Nexus learning role → the app's
   `Role` union. Add Sign out + Back to Nexus.
4. **People & Roles**: wire the existing `AdminPeopleRoles.tsx` to
   `/platforms/learning/people` (list + is_admin), `…/people/role` (assign the
   3 assignable roles / clear), and `DELETE …/people` (trash-can). Admins render
   read-only "Admin / Program-level access". This is where Ashwini's prebuilt
   screen saves the most time.
5. **Nexus**: set `LEARNING_PLATFORM_URL` on nexus-backend so the console's
   Learning card does the real handoff (like `BRIDGE_PLATFORM_URL`).

---

## 5. Answering the open concerns

**"Test version, or merge into Ashwini's live Vercel?"** — Same play as Bridge:
do the integration in the monorepo (QR-version or a `learning-integration`
branch), deploy to a NEW Vercel project on your account (`learning-platform`),
leave `laic-smoky` untouched. Cut over when ready; retire laic-smoky when the
team agrees. Ongoing: re-sync Ashwini's new features into the monorepo copy
(dual-maintenance drift — the known cost, same as Bridge's schema mirror), or
make the monorepo copy the source of truth going forward.

**"Different Supabase — copy over, new current version, merge later?"** — Point
the app at the SHARED Nexus Supabase (the `learning_objects` landing zone is
already there, org-scoped). Steps, mirroring the Bridge DB step:
  1. `pg_dump` Ashwini's learning Supabase first (her real content — the safety
     net, kept outside the repo).
  2. Copy her `learning_objects` rows into the shared project's table, stamping
     `organization_id` (+ `program_id`). Migrate the `media` bucket.
  3. Repoint the app's `VITE_SUPABASE_URL/ANON_KEY` at the shared project.
  4. Defer RLS-via-JWT (writes use the anon key today; org isolation is
     app-layer for now — same deferral as Bridge's `bridge_service`).
It's one table + a bucket, so the copy is small.

**"Make it real — managed-by-learning display, admins editable, delete roles."**
— All of that falls out of §3 for free: platform roles show greyed "managed in
Learning Platform" on the console (read-only, delete-only); admin is Nexus
territory (editable via the console); admins in the Learning People screen
assign/clear/remove. Identical behavior to Bridge, because it's the same code.

---

## 6. Sequencing & rough effort

1. Backend generalization (§3) — ~0.5 day, mechanical, reuses Bridge logic.
2. ashwiniNew → monorepo + launch/context/gate seams (§4.1–4.3) — ~1 day.
3. Wire AdminPeopleRoles to the endpoints (§4.4) — ~0.5 day (screen exists).
4. Data migration + Supabase repoint + deploy (§5) — ~0.5 day (git-less deploy,
   sfo1 region, transaction-pooler + max:1/prepare:false lessons already learned).
5. E2E: portal → launch → land in Learning as the assigned role → People &
   Roles invite/assign/remove → console shows it greyed. ~0.5 day.

## 7. Deferred (same as Bridge)
- httpOnly session (SPA uses localStorage for v1).
- `learning_service` RLS wiring / JWT-to-Supabase (org isolation app-layer now).
- Wiring the learning app's rich permission catalogue to real per-permission
  enforcement (role → screen visibility is enough for v1).
</content>
