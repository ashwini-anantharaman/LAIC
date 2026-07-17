# Implementation Plan — Bringing `nexus_current.html` to Life on the Real Backend

**Date:** 2026-07-15
**Scope:** Wire the full functionality demonstrated in `nexus_current.html` (the envisioned UX prototype) to the real Nexus backends, using `platform_logic/` as the frontend base.

> **Progress (updated 2026-07-16):** Phases 0–2 ✅ complete.
> - **Phase 0** — local Postgres + migrated/seeded `backend-ts` on :8000 + `platform_logic` on :5180, verified E2E (see `DEV_SETUP.md`).
> - **Phase 1** — new minimal router-driven shell under `platform_logic/src/nexus/`: three session modes, scope-aware nav, light/dark, §6 visual direction. Plus **dev quick-login** (gate + portals + "Test as…" topbar switcher, `import.meta.env.DEV`-gated) and **per-org branded portals** at `/@/:slug` (operator gate stays separate) backed by a public `GET /orgs/by-slug/:slug`; org-slug resolution isolated in `orgResolver.ts` for a later subdomain swap.
> - **Phase 2** — wired: org dashboard, programs (+create, assign-admin affordance), offerings (+create, publish/close), registrations (+approve/reject), participants & groups (+create/nesting), org settings (theme + members + **invite administrator**), partners (affiliations), community (integrations), operator organizations (+ **governance/entitlements modal**), and the **invitation activation flow** (`/invite/:token`, verified E2E: create → signup → accept → membership). Both projects type-clean.
> - **Phase 3 — substantially complete.** ✅ **Per-program roles + Team & Roles**: `program_roles` table (migration `0014`) + CRUD API, a role builder UI (name + 5 areas × view/edit/comment), and a **"Test as" role preview**.
> - ✅ **Real dev "test as" for people** (user-requested, plus a real bug fix): `GET/POST /api/platform/dev/{personas,login-as}` — real sessions, **auto-activating** pending invites. Org portal + topbar switcher list every real person dynamically. **Fixed a genuine bug found via this feature:** a profile's own `id` can differ from its auth-credential id (one login → many org-scoped profiles, migration `0010`); `dev/login-as` was minting tokens with the wrong id, causing "test as" to silently fail auth and bounce to the wrong screen. Also fixed the topbar switcher not calling `refresh()` after swapping sessions.
> - ✅ **Capability envelope + enforcement**: `organizations.settings.capabilities` (programTypes: edu/game, offeringTypes: course/challenge/app, features: appShells/integrations), `GET/PUT /orgs/:id/capabilities` (operator-only write), enforced with 403s in program/offering/app/integration creation (platform_admin bypasses). Wired into the operator's Govern dialog. *(5-category program widening beyond edu/game deferred — see doc note on risk/reward.)*
> - ✅ **Program-administrator assignment** (§3.5 delegation, org-altitude action): `GET/POST /programs/:id/administrators`, reusing the invitation mechanism (role=administrator, program-scoped). Programs page shows the real assigned admin per program and an "Assign admin" dialog with a copyable activation link.
> - ✅ **Operator provisioning endpoint**: `POST /admin/organizations` — the real 6-step-equivalent event (org + isolation boundary + default entitlements + one invitation per named administrator, first = owner). No password ever set on anyone's behalf. Wired into a real multi-admin provisioning dialog.
> - ✅ **Cross-org platform audit**: `GET /admin/audit` (operator-only, org names resolved) + a live `OperatorAudit` page (was a placeholder).
> - ✅ **`community` entitlement module** (migration `0015`, widened the DB check constraint + zod enum).
> - ✅ **Fixed a real dev-tooling gap**: `platform_logic` had no working `tsconfig.json` / installed TypeScript (silently masking type errors); added both, plus a `typecheck` npm script — both projects now type-check standalone and clean (0 errors each).
> - ✅ **Fixed the invitation flow (user-reported: "can't name this person, the email doesn't get reflected anywhere")** — three real gaps closed:
>   1. **No name field anywhere.** Added `invitations.display_name` (migration `0016`), threaded through `createInvitation`/`assignProgramAdministrator`/accept — the name typed at invite time now pre-fills the invitee's profile and is never dropped.
>   2. **Invites were invisible until accepted.** New `GET /orgs/:id/invitations` + a frontend `listOrgInvitations` — the org Settings → Members table now lists pending invitations inline ("Taylor Swift · taylor@… · invited") right after creating one, so it's visibly confirmed as saved.
>   3. **No path for a brand-new invitee to actually get in.** `AcceptInvite.tsx` previously required an existing session with no way to create one — a dead end for the common case (inviting someone who's never used the platform). Rebuilt with two real paths: signed-in users confirm/edit their name and accept; brand-new invitees get a real create-account form (name + locked email + password) that signs up and accepts in one step. Verified end-to-end with real browser clicks: name entered at invite → prefilled at accept → real membership under that name → signed in on the org dashboard.
>   4. **Bonus fix found along the way:** invitation-accept errors (already-used/expired/invalid token) were thrown as bare `Error`s that surfaced as raw 500s; now proper `HttpError`s (404/410) with user-facing messages.
> - ✅ **Closed the delegation-loop gaps (user-reported)** — the "core of the test process":
>   1. **Role assignment existed only as role *definitions*** — no way to put a person in one. New `program_role_assignments` table (migration `0017`, email-keyed so it works pre- and post-activation), endpoints (`GET/POST /programs/:id/members`, `PUT …/members/role`, `GET …/my-role`), and a **People section on Team & Roles**: every program member/invitee in a table with a role dropdown (assign/clear inline), an **Invite member** dialog (name + email + role in one step), and per-person **"Test as"** that really signs in as them.
>   2. **Members are now actually confined by their assigned role.** A non-admin member's sidebar shows only their role's granted areas (verified: a "Reviewer" with teams+community sees exactly Home/Community/Team & Roles); program administrators keep the full program workspace; members no longer see a "Back to org" link (§3.5).
>   3. **Program admins land in their program on login** (verified working — maya goes straight into Brain Bee with edit access).
>   4. **"People not getting saved" was actually a discoverability bug** — data always persisted (verified across backend restarts), but the operator gate only showed 2 hardcoded personas + 1 hardcoded portal link. The gate now lists **every org dynamically** (`GET /dev/personas` sibling `GET /dev/orgs`), each linking to its portal where all real members/invitees appear as one-tap test logins.
>   5. **Fixes found along the way:** dev auto-activation now honors the invitation's typed name (was falling back to the email prefix), creates a proper org-scoped profile (was creating an RLS-invisible one, which made members render as "—" with no email), and `listProgramMembers` resolves profiles by both profile-id and auth-id.
> - ✅ **Root-caused "admins deadass not saving" (user-reported)** — not a max-count; an **invitation-absorption bug**. Opening an activation link while still signed in as yourself (the natural way to test it) accepted the invitation into *your* account: the invited person was never created, the inviter silently accumulated stacked memberships (Ashvin had 8), and the invite vanished from "pending" — looking exactly like a save failure, with "AK" still in the corner because you really were still Ashvin. Fixed three ways:
>   1. **Backend guard:** an email-addressed invitation now returns **409** (with a clear message) if accepted by a different email.
>   2. **Accept-page interlock:** if you open an invite link while signed in as someone else, the page shows "This invitation is for X, but you're signed in as Y" with a **Continue as X** button that signs you out into the invitee's create-account flow.
>   3. **Data repair:** stripped Ashvin's 7 absorbed memberships (back to just `owner`) and resurrected all 7 swallowed invitations to `pending` — every person you created (testy, baba booey, jb, caleb, …) now exists and is testable.
> - ✅ **Portal persona list grouped into collapsible role tabs** (user-requested): Owner / Administrator / Instructor sections with counts; small groups start open, large ones collapsed — the roster no longer swamps the portal. Verified: Administrator (17) expands to show every member and restored invitee as a one-tap test login.
> - ✅ **Member/invitation removal (user-requested)** — `DELETE /members/:id` (memberships) and `DELETE /invitations/:id` (withdraw pending, link stops working) with server-side authorization: org-scoped removal needs org edit access; program-scoped removal needs that program's **administrator** (a new `_canManageMembers` guard, deliberately stricter than `isOfferingAdmin`, which counts instructors — testing surfaced exactly that hole: an instructor could remove people; now 403). The owner can never be removed (400), and you can't remove yourself. Trash buttons wired into both surfaces: org Settings → Members and program Team & Roles → People. Verified E2E: guards (owner 400, instructor 403), real removal, invitation withdrawal via a live UI click.
> - **Phase 3 closed.** Remaining items dispositioned: App Shell config → Phase 4 (done, below); 5 program categories + server-side area-perm enforcement + password-reset endpoints deliberately deferred (all documented).
> - **Phase 4 (in progress) — the App Shell editor core is done and verified:**
>   - **Backend:** `shell_config` JSONB on `registered_apps` + `app_config_versions` immutable snapshots (migration `0018`); `GET/PUT /apps/:id/config`, `POST /apps/:id/publish-version`. The signup hook now serves the **shell config's** sign-up fields when defined (the §3.4 precedence decision), falling back to the offering's.
>   - **Frontend:** App Shells page is real (list, create with one-time API key reveal, open editor). The **Shell Editor**: six tabs (Setup / Branding / Start / Sign-up / Onboarding / Navigation), a **live phone-frame preview** re-rendering per keystroke and switching screens per tab, Save / **Publish version** / Rotate hook key. Browser-verified: live edit updates the preview + unsaved badge; publish bumped v1 → v2.
>   - **The signature loop closed, API-verified:** app authenticates with its hook key → fetches its sign-up fields **from the published shell config** → posts a registration → it lands in the program's queue (`Player One | approved | app_hook`; the draft-offering gate correctly 400s until the offering is published).
>   - ✅ **The real runtime is wired (Phase 4 complete).** New public `GET /apps/by-slug/:slug/boot-config` serves the latest *published* snapshot adapted to the `@laic/app-shell` `AppShellConfig` contract (validator-passing; extra sign-up fields beyond name/email become onboarding questions — the runtime's auth form is fixed, so required custom fields are collected right after signup). `app_shell/` gained a real `createNexusClient` (`nexusClient.ts`): real account signup/login, hook registration posted once onboarding completes (carrying the answers as `field_data`), launch context from `/auth/me`. Config loading: bundled demo slugs keep offline seeds; any other slug boots live from Nexus (`?app=bridge-ai-coach`). Hook key via `VITE_NEXUS_HOOK_KEY` (dev-only; documented that production apps proxy the hook server-side). **Verified full-loop in the browser:** edit config in the Nexus editor → publish v2 → app boots showing v2.0.0 with the edited branding → "Onboarded User" signs up → answers "Bridge experience *" → lands in the running app at `/learn` → appears in the Nexus registration queue as `approved | app_hook | {level: 'advanced', selected_role: 'learner'}`. Also caught + fixed en route: the hook's required-field validation correctly rejected registrations missing custom fields, exposing the auth-form/signup-fields contract gap that the onboarding mapping now closes. All three projects (backend, platform_logic, app_shell) type-check clean.
> - ✅ **Phase 5 complete (placeholder scope, as agreed)** — the Learning Platform launch seam is real even though the interior is a stub:
>   - `POST /programs/:id/learning-platform/launch` — entitlement-gated (learning module), find-or-creates the program's LP registered-app record, mints a **single-use launch token** with the org/program/role context. Verified: exchange succeeds once, replay 401s.
>   - A full-screen launch surface (`/o/:orgId/p/:programId/learning`, outside the console chrome): context bar ("Learning Platform · Brain Bee Program · owner"), a **"launch context verified"** pill (the page performs the LP's side of the handshake — mint → exchange), a branded placeholder pane, and "Back to Nexus". When a real LP lands, setting `launch_url` on the `learning-platform-*` app makes this same page open it with the token — no console changes.
>   - `content_package` JSONB on offerings (migration `0019`) exposed through the API; course offerings show a "Learning Platform package" pill when present (populated by the future LP).
>   - Program overview cards wired: "Launch Learning Platform" → the launch surface; "Make an application" → App Shells. Browser-verified end-to-end.
> - ✅ **Phase 6 complete — all phases done.**
>   - **Org logo upload** wired end-to-end: Settings → Theme gets a file input (≤1 MB image → base64 → existing `POST /orgs/:id/logo`); the logo shows in the Settings preview, the **console sidebar brand slot**, and the **org portal**. The org's **accent color now recolors primary actions** throughout its space (inline `--primary` override; operator pages stay neutral). Settings loads the *current* theme instead of defaults.
>   - **Fixed `/orgs/mine` at the source** (the long-standing auth-id/profile-id quirk that returned `[]`) — it now resolves memberships through both id kinds.
>   - **Confirm dialogs on every destructive action** (remove member, withdraw invitation, delete role) via a reusable `ConfirmButton` (AlertDialog): "Remove X? They lose access immediately… Cancel / Remove."
>   - **§6 copy sweep**: last placeholder toasts and stale phase-reference comments cleaned.
>   - **Dark mode verified** (html.dark class, dark tokens, pages render).
>   - All verified in one browser pass; all three projects type-check clean.
>
> **Status: Phases 0–6 all complete.** Remaining known deferrals (documented above): server-side per-area role-permission enforcement, 5 program categories, email delivery + password reset, OAuth/SSO, subdomain portals, the real Learning Platform interior, production deployment/hardening.
**Decisions locked in:**
1. **Frontend base:** evolve `nexus/TheNexusPlatform/platform_logic/` (React + Vite + shadcn) — restructure its IA to match the prototype; reuse its `src/services/api.ts` client.
2. **Single backend:** `backend-ts` (Hono/TypeScript, as administered by Quan) is the **one and only** backend. The Python FastAPI backend is **removed from the plan entirely** — no dual-service setup. Learning/AI features it uniquely held (ingest, content generation, RAG, mastery) are **out of scope this pass**; the Learning Platform is a launch-seam placeholder (see Phase 5).
3. **Dev database:** local Postgres (Docker) in full DB mode, so groups, invitations, partners/org-graph, and RBAC are all live (they 501 in demo mode).
4. **Delegation model:** the whole system is a recursive downward-delegation hierarchy — each level provisions the *administrator* of the level below and, by default, never has to touch that level's internal roles (though it may drill in). See the new §3.5.

> **Supersedes the earlier "TS platform + Python learning" decision.** Python is dropped; there is a single TypeScript backend.

---

## 1. What `nexus_current.html` actually is

The file contains three layers:

| Layer | Location in file | Role |
|---|---|---|
| **Main Nexus console** | inline JS (lines ~1496–3981) — vanilla JS SPA over an in-memory `DB` object | **The functional spec.** Every flow below comes from here. |
| **Embedded Learning Platform** | compiled React bundle (`lpBundle`, lines 621–1376), launched in an iframe with a launch-context bar | Placeholder for the real Learning Platform (per direction: can stay a placeholder) |
| **Embedded App Shell Studio** | compiled React bundle (`asBundle`, lines 1377–1494), iframe | Explicitly unfinished / placeholder |

The inline console is what we implement. The two iframes are launch seams whose *contracts* (launch context, "back to Nexus") we keep, while their contents stay placeholders for now.

### 1.1 Feature inventory of the prototype (the spec)

**A. Identity & entry**
1. **Nexus gate** — platform-operator-only sign-in; org members are pointed to their own org portal ("Organizations sign in at their own URL — never through here").
2. **Org portals** (Canvas-style, per-org URL like `nexus.laic.com`) — org-branded login with SSO buttons (Google / Microsoft / org SSO), email+password, forgot/reset-password flow, and an **invited-member activation flow**: set password → 6-digit email verification → account active.
3. **Three session modes** driving completely different UIs:
   - `nexus` (platform operator): sees only Organizations + Platform audit.
   - `org` (org admin): full org space.
   - `member` (program member): confined to the areas their **role** grants; if a role grants exactly one area, login launches straight into it (e.g. a Content Developer lands directly in the Learning Platform).

**B. Nexus operator console**
4. Organizations table: tenant mode (`full_tenant`/`program_affiliate`/`profile_only`), data residency (shared/dedicated), status; "Visit portal" and "Manage".
5. **Provision organization** — a fixed 6-step onboarding event (create record → RLS boundary → create owner + admins with activation invites → default entitlements → org-scoped storage → initial theme). Multiple administrators; first = owner.
6. **Governance modal** (boundary controls only — Nexus never sees org contents): tenant mode, residency, status, **module entitlements** (learning/coaching/analytics/community), and a **capability envelope** — which *program categories* the org may create (course/challenge/app/coaching/community), which *offering types* it may publish (course/challenge/app), and which *platform features* it gets (Build App Shells, Integrations). Toggling a capability off removes it from the org console immediately (locked type-cards, hidden buttons).
7. Platform-level audit (provisioning/governance events across all spaces).

**C. Org space (org admin)**
8. **Dashboard** — stat cards (programs / offerings / app shells / pending signups), program cards, recent activity, and a **cross-program participants panel** with per-program color-coded filter chips (programs are soft-isolated inside an org, unlike the hard wall between orgs).
9. **Overview & settings** — org profile, minimal **theme** (accent color + logo; deep theming lives per App Shell), **administrators** management (invite admin → activation invite; resend invite; trigger password reset — passwords never visible), all-members table.
10. **Programs** — create/list; each program card shows offerings count, owner, type.
11. **Org audit log** — every admin action in the space.

**D. Program workspace (the biggest structural change vs. today's platform_logic)**
Entering a program switches the sidebar to program-scoped nav: Overview / Offerings / App Shells / Registrations (with pending badge) / Participants & Groups / Community / Team & Roles / Partners.
12. **Program overview** — mini-stats; "Launch <LP instance>" hero card (per-program Learning Platform instance, shared or isolated — see F); "Make an application" card (capability-gated); offerings list.
13. **Offerings** — three headline types (course / challenge / app) with capability-gated creation; status lifecycle (draft → open/private_beta → closed); approval mode (auto/manual); participant label; course offerings show a linked **Learning Platform content package** ("N modules · N lessons · N blocks — by reference, never cloned").
14. **App Shells** — the signature object: *one runtime renders many apps; a shell is only configuration.* Editor is **two-phase**:
    - *Phase 1 — Initial screens*, tabbed: App Setup (name, slug, runtime template, status) · Branding (4 colors, logo glyph, font) · Start Screen (welcome copy + role buttons with entry flows) · **Sign-up & Login** (configurable signup fields — these ARE the app's signup screen; the runtime renders them and posts values back via the signup hook; sign-in identifier methods; self-signup / invite-code toggles; hook key panel showing `GET /api/hook/signup-fields` + `POST /api/hook/registrations`) · Onboarding (post-signup questions) · Navigation & Flags (tabs + enabled modules gated by entitlements) · Build (bundle ids, environment, **immutable config version history**).
    - *Phase 2 — Main content*: compose the app's home screen from published Learning Platform objects **by reference** (search, add/remove/reorder; "edit in the studio and every app updates").
    - Live phone-frame preview on every keystroke; "Open full runtime" overlay that re-skins one runtime across all shells; **Publish version** (snapshot) and **Rotate hook key**.
15. **Registrations** — queue per program/org with sources (`app_hook`, `invite_link`, `coach_add`, `admin_add`), approve → participant created, reject; stat cards.
16. **Participants & Groups** — one freeform group concept (class, club, chapter, region, coach group…) with parent nesting.
17. **Community** — stub (Discord-style channel list; "Connect Discord"); a permissionable area.
18. **Team & Roles** — **per-program custom roles**: a role = name + per-area access level (view/edit/comment) across 5 areas (Learning Platform, App builder, Community, Teams, Partners). Role builder modal; invite member with role (email invite OR copyable activation link; credentials block shows username / activation link / landing URL — never a password); manage member (rename, role, status active/invited/suspended, remove); **"Test as"** opens that member's exact view; role-driven member home screen with launch cards.
19. **Partners** — affiliated organizations (federations, clubs, independent coaches, schools) that live *inside* the program, invisible to Nexus. Per-partner capability grants (learning / coaching / enroll students / community) — "the same capability model, one level down" (recursive gating).

**E. Governance-in-org**
20. Entitlements view (capabilities granted by Nexus shown read-only; module entitlements table; integrations, Discord first). *(Note: `vEnts` and `vContent` exist in the prototype code but are not reachable from the current nav — treat as secondary.)*

**F. Learning Platform seam**
21. Nexus launches the LP in a full-screen surface with a **verified launch context** (org / program / offering) and a "Back to Nexus" chrome bar.
22. **LP instances**: one LP implementation, instantiated per program with its own config (name, colors, icon, object types, roles). Two programs can **share** an instance (they see each other's learning objects); otherwise isolated.
23. Authoring flow (shown by both the legacy inline wizard and the embedded bundle): Source → Structure (open-ended hierarchy naming, TOC-vs-AI parsing) → Skeleton → Generate (style/level/depth) → Editor (blocks per lesson) → Review → Learner-interaction policy (allow AI tutor / quiz-me / flashcards / notes; order; hints; explanation timing) → **Publish**, which links a content package back to the Nexus offering *by reference* and flips the offering to `in_review`.
24. Object Library: reusable learning objects with type, **scope (program vs org)**, reuse count, status — the same objects App Shells compose.

**G. App runtime**
25. One runtime, config-driven screens: welcome (role buttons, auth methods), signup (fields from shell config → posts to `/api/hook/registrations`), onboarding, home (LP content blocks + nav tabs). At runtime, "the app requests a content manifest — Nexus verifies launch context, the Learning Platform resolves the refs server-side."

---

## 2. What already exists (backend coverage map)

`backend-ts` (Hono, `:8000`) is remarkably close to this spec — most of the prototype's nouns exist as tables and routes. It is the single backend; the Python service is not used.

| Prototype feature | Backend support | Status |
|---|---|---|
| Email/password auth, signup types, `/auth/me` | `POST /api/platform/auth/{signup,login}`, `GET /auth/me` (backend-ts) | ✅ exists |
| Launch tokens / app handoff | `GET /api/apps/:id/launch-context` → `POST /auth/launch-exchange` | ✅ exists |
| Platform operator | `platform_admin` role, `GET /api/platform/admin/organizations`, `seed:admin` script | ✅ exists |
| Organizations (tenant mode, status, theme, logo) | orgs tables + `PATCH /orgs/:id/theme`, `POST /orgs/:id/logo` | ✅ exists (residency: not a column — store in org settings) |
| Programs (create/list/delete) | `/orgs/:id/programs` | ⚠️ partial — backend category is `game\|edu`; prototype has 5 program categories |
| **Assign a Program Administrator at the org level** | membership model supports it (`org_membership` with `role:"administrator"` + `program_id`; `isOfferingAdmin()` honors it) | ⚠️ **no org-level assignment endpoint/UI** — must be built (§3.3) |
| Offerings (types, lifecycle, approval, signup fields, labels) | full offerings subsystem + publish/close | ✅ exists |
| Registrations queue + sources + approve/reject/admin-add/coach-add/bulk-import | offerings router + hook router | ✅ exists |
| **Signup hook** (`GET /signup-fields`, `POST /registrations`, per-app API key, rate limit) | `/api/hook/*` — the exact endpoints the prototype prints on screen | ✅ exists |
| Registered apps + rotate key / revoke | `/api/apps/:id/*` | ✅ exists |
| Groups w/ nesting | `/orgs/:id/groups`, `/groups/:id/members` (DB mode) | ✅ exists |
| Invitations (secure token link → accept) | `/orgs/:id/invitations`, `/invitations/:token/accept` (DB mode) | ✅ exists (maps to activation flow) |
| Partners / affiliated orgs | `organization_relationships` + `program_organization_affiliations` with two-sided consent + PATCH access (DB mode) | ✅ exists (needs UI mapping + access-grant fields review) |
| Entitlements (module gating) | `/orgs/:id/entitlements` (nexus/learning/coaching/analytics) | ⚠️ partial — no `community` module; no capability envelope |
| Audit | `audit_events` + `GET /orgs/:id/audit` | ⚠️ partial — no platform-level (cross-org) list endpoint |
| Per-program custom roles (5 areas × view/edit/comment) | RBAC tables exist in migration `0009` (`roles`, `permissions`, `role_permissions`, `role_assignments`) | ❌ **no endpoints** — role CRUD/assignment API must be built |
| App Shell **config** (branding/copy/auth/signupFields/roleButtons/onboarding/nav/modules/content) + **versioning** | `registered_apps` has identity/keys/launch fields only; `offerings.signup_fields` exists | ❌ **missing** — shell config storage + version snapshots must be built |
| Capability envelope (programTypes / offeringTypes / features) + enforcement | — | ❌ missing |
| Operator provisioning event (org + N admin invites, one transaction) | `provisionOrganization` exists for self-signup; invitations exist | ⚠️ composable — needs one operator endpoint |
| Password reset trigger / resend invite | Supabase auth supports reset; no explicit endpoints | ❌ small additions |
| Cross-program participants view | per-offering registrations GET | ⚠️ aggregate client-side or add org-scoped listing |
| SSO (Google/Microsoft/org) | — | ❌ later (Supabase Auth OAuth when moving off local PG) |
| Learning: ingest, generation, RAG, mastery, module structures | ~~Python backend~~ — **out of scope** (Python removed) | ⛔ deferred — LP is a launch-seam placeholder (Phase 5) |
| LP instances (per-program, shared/isolated), object library w/ scope+reuse, content packages on offerings, content manifest | — | ❌ missing — future LP workstream (placeholder now) |
| Community | `integrations` (discord) | stub on both sides — keep stub |

**Frontend coverage:** `platform_logic/src/services/api.ts` (~60 functions) already calls nearly every ✅ row above. `app_shell/packages/app-shell` (`@laic/app-shell`) is a clean, dependency-injected implementation of exactly the runtime described in G — currently on a mock client with stub modules.

---

## 3. Architecture target

```
┌────────────────────────────────────────────────────────────────┐
│  platform_logic (React) — restructured to the prototype's IA   │
│  Gate → Org Portals → Org Space → Program Workspace → Editors  │
└────────────┬───────────────────────────────────────────────────┘
             │ /api/platform, /api/*, /api/hook
             ▼
┌──────────────────────────────────────────────────┐
│ backend-ts (Hono, :8000) — THE single backend    │
│ platform layer · Postgres + Drizzle + RLS        │
└────────────┬─────────────────────────────┬───────┘
             ▼                             │ launch-context
   local Postgres (Docker),               │ (token exchange)
   migrations 0000–0013                   ▼
┌──────────────────────────┐   ┌─────────────────────────────────┐
│ @laic/app-shell runtime  │   │ Learning Platform (placeholder) │
│ (real ShellPlatformClient│   │ branded launch surface only —   │
│  replacing mockClient)   │   │ real runtime is a later workstream│
└────────────┬─────────────┘   └─────────────────────────────────┘
             │ signup → POST /api/hook/registrations
             ▼ (into the Nexus registration queue)
```
No Python. One backend. The Learning Platform and App Shell Studio are launch-seam placeholders whose *contracts* (launch context, back-to-Nexus chrome) are real, but whose interiors are stubs this pass.

Key principle carried over from the prototype: **the App Shell editor and object model live in Nexus (platform_logic + backend-ts); the App Shell *runtime* is the existing `@laic/app-shell` package pointed at real endpoints; the Learning Platform is a separately-launched service.** The embedded studio/LP bundles in the HTML remain placeholders behind the same launch seams.

> Note on the docs: `Nexus_Platform_Implementation_Architecture_v3.md` removed the App Shell from Nexus's responsibilities, but `nexus_current.html` (newer, and stated to be the envisioned flow) reinstates it as a first-class Nexus object. **The prototype wins.** We keep v3's good ideas that the prototype also kept: centralized auth, signup hook, registered-app credentials, minimal org theming.

## 3.5 The delegation hierarchy (core mental model)

The entire system is **recursive downward delegation**: each level provisions the *administrator* of the level directly below it, and by default is done — it never has to configure that lower level's internal roles. It *may* drill in and do so, but it doesn't need to. Authority flows down; the work of managing a level's people belongs to that level's own administrator.

```
Nexus operator ──assigns──▶ Org administrator(s)        [HARD WALL: operator can NEVER enter the org]
Org administrator ──assigns──▶ Program administrator(s)  [org admin MAY enter a program, but doesn't need to]
Program administrator ──creates──▶ program roles + members [incl. e.g. a "Learning Platform admin" role]
Learning Platform admin ──creates──▶ LP sub-roles          [inside the LP, when the LP is real]
…and so on into any launched sub-platform (App, Bridge, Coaching).
```

**Two properties that must hold everywhere:**
1. **Assign-down, don't manage-down.** A level's admin screen offers a single clear action to name the administrator of each child (invite/assign), and then that child is self-governing. The parent is *not* forced through the child's role matrix. (This is why the Nexus operator console has no role editor for org-internal roles, an org admin's Programs list has an "assign administrator" affordance but not a mandatory dive into each program's Team & Roles, etc.)
2. **The Nexus→Org boundary is the one exception to "may drill in."** The operator provisions org admins and governs the *boundary* (tenant mode, entitlements, capability envelope) but genuinely cannot see or enter org contents. Every other parent→child edge is drill-in-*optional*; this one edge is drill-in-*forbidden*.

**How this maps to the backend (confirmed against the code):**
- **Program Administrator = a reserved role**, implemented as an `org_membership` with `role: "administrator"` and a `program_id` set. `isOfferingAdmin()` already grants such a membership full reach over that one program. It is *not* one of the custom roles — it is the delegated administrator, and the custom view/edit/comment roles are what that administrator then builds for people beneath them.
- **Org-level assignment is the missing piece to build (§3.3):** from the org's Programs area, an org admin picks/creates a program and assigns its administrator (creating that scoped membership via invitation or direct add). Today the prototype only invites members from *inside* a program; we add the org-altitude action.
- **Custom per-program roles** (the 5 areas × view/edit/comment) are the separate RBAC tables (`roles`/`role_assignments`, migration `0009`) that the Program Administrator manages from inside the program — the roles API in §3.3.
- **Sub-platform admins (e.g. Learning Platform admin)** are, at the Nexus layer, just another program role a Program Admin can grant. What that role *unlocks* — landing in the LP and managing LP-internal sub-roles — lives inside the LP and is **documented as the intended recursive pattern but not built this pass** (LP is a placeholder). The seam is real; the interior waits.

---

## 4. Phased plan

### Phase 0 — Dev environment (½ day)
- `docker run` Postgres 16; set `DATABASE_URL`; `npm run migrate` in `backend-ts` (migrations `0000`–`0013`); `npm run seed:admin` for the platform operator.
- Run **`backend-ts` on `:8000` — the only backend.** No Python service.
- `platform_logic`: `VITE_API_URL=http://localhost:8000`. Verify `/health`, login, and one Slice-11 endpoint (e.g. groups) returns 200, not 501.
- Seed script: one org (LAIC-like), 3 programs each with a Program Administrator, 3 offerings, a registered app, sample registrations — mirroring the prototype's demo data so every screen has content while building.

### Phase 1 — IA restructure of platform_logic (the skeleton)
Replace the current screen state machine with router-driven structure matching the prototype:
- **Routes:** `/gate` (operator login) · `/portal/:orgSlug` (org portal: login, activation, reset) · `/o/:orgId/{dashboard,settings,programs,audit}` · `/o/:orgId/p/:programId/{overview,offerings,shells,registrations,groups,community,team,partners}` · `/o/:orgId/p/:programId/shells/:shellId/edit` · full-screen launch surfaces for LP / App Shell Studio placeholders.
- **Session context provider** with the three modes (nexus / org / member) computed from `GET /auth/me` (role + memberships); nav renders per mode exactly as the prototype's `renderNav()` does, including the member "confined areas" rule and single-area direct-launch.
- **Program scope switcher** ("Back to ORG" / program-scoped sidebar with pending-registrations badge).
- Port the prototype's page-composition patterns (phead / stat cards / object cards / tables / modals / toasts) onto shadcn components.
- **Apply the visual-style directive (§6) from the first screen onward.**

*Everything in this phase is frontend-only; existing api.ts calls keep working.*

### Phase 2 — Wire everything that already has endpoints
Order roughly by prototype prominence:
1. **Org dashboard** (stats + programs + audit feed + cross-program participants panel, aggregated client-side from per-offering registrations for now).
2. **Programs** list/create; **program overview** page. Each program row/card carries the **"assign administrator"** affordance (the org-altitude delegation action — wired in Phase 3.3) and shows its current Program Administrator.
3. **Offerings** list/create/publish/close with type cards; approval + label fields.
4. **Registrations** queue with approve/reject and source pills (org- and program-filtered).
5. **Participants & Groups** (groups + members + parent nesting).
6. **Org settings**: profile, theme color + logo upload, administrators (invitations create/accept), members table.
7. **Partners**: map to `program_organization_affiliations` + `organization_relationships` (create, consent state, PATCH access grants).
8. **Operator console**: organizations table (`/admin/organizations`), org governance modal (tenant mode/status + module entitlements via existing PUT), platform audit (org-scoped for now).
9. **Portal auth flows**: login, invitation-token activation (set password → accept), sign-out. (6-digit email verification: visual step only until email delivery exists — invitations already return a secure token link.)

**Exit criterion:** an operator can provision-ish an org (create + invite), an org admin can run programs/offerings/registrations/groups/partners end-to-end against Postgres.

### Phase 3 — Backend additions (backend-ts)
Small, well-scoped extensions; each mirrors a prototype control:
1. **Capability envelope** — add `capabilities` JSONB on organizations (`programTypes`, `offeringTypes`, `features:{appShells,integrations}`); `GET` merged into org payload, `PUT /orgs/:id/capabilities` (platform_admin only); **enforce** in create-program / create-offering / create-app routes; audit event `organization.govern`. Frontend: governance modal toggles + locked cards/buttons in the org console.
2. **Program categories** — widen `programs.category` to the five prototype categories (keep `game`/`edu` as aliases or migrate), gated by the envelope.
3. **Program-admin assignment + per-program roles API** — the two-tier delegation from §3.5:
   - **Assign Program Administrator (org altitude):** `POST /programs/:id/administrators` — invite or directly assign a user as the program's reserved administrator (creates an `org_membership` with `role:"administrator"` + `program_id`). `GET` to list; `DELETE` to unassign. This is the org admin's "assign-down, don't manage-down" action; it does **not** require the org admin to touch the program's internal roles.
   - **Custom per-program roles (program-admin altitude):** endpoints over the `0009` RBAC tables — `GET/POST /programs/:id/roles`, `PATCH/DELETE /roles/:id` (guard: in-use), member assignment via membership create/update. Permission model = the prototype's 5 areas × {view, edit, comment}. A **"Learning Platform admin"** is simply one such role whose granted area is Learning Platform (its LP-internal sub-role management is documented for later, per Phase 5).
   - `/auth/me` memberships gain the resolved area-perms + the reserved-admin flag so the frontend computes the correct session mode and confined-nav.
4. **App Shell config + versions** — `config` JSONB on `registered_apps` (schema = the prototype's shell config, validated with Zod — reuse/align with `@laic/app-shell`'s `AppShellConfig` types); new `app_config_versions` table (immutable snapshots) + `POST /apps/:id/publish-version`; `GET /api/hook/signup-fields` reads from the shell config (decide precedence over `offerings.signup_fields` — recommend: shell config wins when the offering has a linked app).
5. **Operator provisioning endpoint** — `POST /admin/organizations`: transactional org + N administrator invitations + default entitlements + theme; returns the step results so the UI can animate the 6-step event honestly.
6. **Convenience endpoints** — platform-level audit list (`GET /admin/audit`); org-scoped registrations listing (kills the client-side aggregation from Phase 2); `POST /members/:id/reset-password` + resend-invitation (email delivery can stay "copy the link" as in the Python backend).
7. **`community` module** added to the entitlement enum (stub-gated area).

### Phase 4 — App Shell editor + real runtime
1. Build the **two-phase editor** in platform_logic exactly per the prototype's `vEditor`: seven tabs, live phone-frame preview (render with the actual `@laic/app-shell` components in an embedded frame → the preview *is* the runtime, which is truer than the prototype's hand-rolled preview), publish-version, rotate-hook-key.
2. **Phase-2 composition UI** ships against a stubbed object list until the LP seam is real (the prototype itself uses a hardcoded object library — parity is easy); the manifest contract is designed now (below), resolved later.
3. Give `@laic/app-shell` a **real `ShellPlatformClient`**: fetch shell config from backend-ts by slug, post signups to `/api/hook/registrations` with the app API key, exchange launch tokens. Boot the three demo configs from DB instead of local JSON. Registrations submitted from a running shell appear in the Nexus queue — closing the prototype's signature loop (app signup → hook → approve → participant).
4. The embedded **App Shell Studio** bundle stays a placeholder launch surface (chrome bar + iframe), reachable from the same buttons.

### Phase 5 — Learning Platform seam (placeholder only this pass)
The LP is a **launch-seam placeholder** — no Python, no AI authoring/ingest/RAG/mastery built now.
1. **Launch surface:** "Launch Learning Platform" opens the full-screen chrome (org/program context bar + Back to Nexus) around a branded placeholder pane. Simple, one-tap launch — no "isolated instance / shared instance" chrome or explanatory copy (see §6).
2. **Real launch-context handshake is wired even though the interior is a stub:** the launch goes through the registered-app launch-context/token exchange, so when a real LP (a future TS workstream, or `Components/laic-learning-platform` adapted) drops in, the seam already works.
3. **Offering ↔ content-package field is stubbed:** add `content_package` JSONB + status on offerings so a course offering can *display* a linked-package flag; populated for real only when a real LP exists.
4. **Documented-for-later (not built):** LP instances (per-program config, shared/isolated), the object library (org/program scope + reuse), the runtime content-manifest endpoint, and the **recursive LP-admin sub-role management** from §3.5. These are the LP's own interior, deferred with the LP itself.

### Phase 6 — Polish / deferred
- SSO buttons → Supabase Auth OAuth (when moving from local PG to Supabase); real email delivery for invites/resets/verification codes.
- Subdomain-per-org portals (path-based `/portal/:slug` until DNS matters).
- "Test as member" — dev-only impersonation (frontend simulation first; a guarded backend impersonation endpoint only if needed).
- Isolation-test panel (great demo; wire to a real read-across-org probe), data residency field, cross-program export button, Discord integration beyond the stub, analytics module.

### Restyle pass (July 2026) — ✅ done
Glassmorphic restyle across the whole app, verified light + dark via CDP screenshots:
- `theme.css` rewritten: light = extremely soft baby-blue near-white (`#f2f6fc`) with translucent glass cards; dark = deep blue-purple (`#0d0f1f`) with indigo radial glows; `--page-gradient` body backgrounds; shared `.glass-card` / `.glass-bar` classes (backdrop-blur + saturate).
- Sidebar tinted with the org's accent (`color-mix(in srgb, accent 86%, transparent)` + blur) with luminance-based readable foreground (`readableOn`/`accentVars` in AppShell); glass topbar.
- Hierarchy upgrade in `kit.tsx`: page h1 `text-3xl/4xl`, larger stats, more section breathing room.
- Breadcrumbs humanized: org name › program name › page label (no raw UUIDs).
- All card surfaces swept to `glass-card`; brand-chip contrast fixed on accent sidebars. Typecheck clean.

### Platforms, roles & theming pass (July 2026) — ✅ done
Verified locally (API + CDP, light + dark):
- **Role builder — platform areas are Admin toggles.** Learning Platform and Bridge Platform (new area) grant a single `administrator` level via the on/off switch — no level select. App builder / Community / Teams / Partners keep view/edit/comment. `AccessLevel` gains `"administrator"`; `RoleArea` gains `"bridge"`; backend `_ACCESS_LEVEL` enum + `programRolePerms` accept both (area keys stay open, so no per-key validation change).
- **Bridge Platform** added everywhere as a first-class platform alongside Learning Platform and App Shell. Its launch surface is an intentional placeholder (`BridgeLaunch.tsx` at `/o/:orgId/p/:programId/bridge`) — the platform itself isn't built.
- **Nexus-level gating.** `DEFAULT_CAPABILITIES.features` now carries `learningPlatform`, `appShells`, `bridge` (all default on). The operator's Govern dialog toggles them per org (Platform features section). `getOrgCapabilities` is org-readable; `setOrgCapabilities` stays platform-admin only.
- **Per-program platform enable/disable.** Program overview shows every platform the org is entitled to; each active one has a hover ✕ to remove and reappears as a dashed "+ Add" tile (admins only). Stored in `programs.metadata_json.platforms` via `PUT /api/programs/:id/platforms` (`setProgramPlatforms`, program-admin guarded, audited). `_programResponse` + `programRow` expose `platforms`.
- **Role-confined platform cards.** A confined member (or a dev "Test as role" preview) only sees the platform cards their role grants — Learning Platform ↔ `learning`, App Shell ↔ `appbuilder`, Bridge Platform ↔ `bridge`. Program admins/owners see all three. Shared `useProgramAccess(programId)` hook (`nexus/access.ts`) centralizes the admin-vs-confined decision used by both the overview and the confined sidebar nav. A *real* member whose entire access is a single platform (no community/teams/partners) is auto-launched straight into it (`navigate … replace`); previews are never redirected, so the previewing admin isn't trapped in a full-screen surface.
- **Accent color follows the theme.** One stored hue is re-lit per mode — a light shade in light mode, a darker shade in dark mode — via `nexus/theme/accent.ts` (`accentForMode`, HSL lightness bands). `AppShell.accentVars(accent, dark)` derives the active-mode variant; the Settings picker normalizes the pick to the current mode and previews both Light/Dark swatches.

### Liquid-glass pass (July 2026) — ✅ done
Pushed the glass language toward macOS/iOS Liquid Glass, verified light + dark via CDP:
- **Accents constrained to complementary bands** (`accent.ts`): light mode = pastel (L 68–80, S 38–62), dark mode = the same hue deeper and richer (L 34–46, S 42–72). Hue stays fully free — wide color range, pinned lightness/saturation so every pick complements its theme.
- **Sidebar is genuinely translucent glass** — new `.glass-sidebar` class (blur +6px over base, saturate 1.7); the org accent is a `color-mix` tint at 66% (light) / 46% (dark) over the page gradient instead of an opaque fill, so the backdrop glows through.
- **Specular edges on all panels**: `--glass-shadow` now carries an inset top highlight (the "catches light" line), a hairline outer definition ring, and a soft ambient drop; `--glass-border` is a translucent white hairline per mode. Blur raised to 24px/26px with saturate 1.6; radius up to 0.95rem.
- **Canvas re-lit**: light = very light baby blue (`#eef6fe`) with baby-blue + sea-green + periwinkle radials; dark keeps the deep blue-purple base with an added subtle teal glow so the two modes share the same gradient geometry.

---

## 5. Risks & watch items
- **`offerings.signup_fields` vs shell-config signup fields** — one source of truth must be picked (Phase 3.4) or the hook returns stale fields.
- **RBAC enforcement depth** — Phase 3.3 delivers role storage + frontend gating; *server-side* enforcement of area-level perms on every route is a follow-up hardening pass (note it in the roles API design).
- **Vercel deployment of backend-ts is unverified** (its README says so) — irrelevant for local dev, flag before any deploy.
- **Migration `0010`+ RLS uses a dedicated `nexus_app` DB role** — the Docker Postgres setup must create it (check `scripts/runMigrations.ts` expectations early in Phase 0).

---

## 6. Visual style & content directives (first implementation)

The prototype is the source of truth for **flow and information architecture only** — not for visual style, and *especially* not for its on-screen prose. The default posture is **strip, don't narrate**: if a piece of text explains how the system works rather than labeling what a control does, it comes out.

### 6.1 Remove the explanatory/narration copy (system-wide)
The prototype is saturated with AI-generated explainer text that must not carry over. Delete or reduce to a short control label:
- **All the "flag" info boxes** — the blue/violet callout paragraphs on nearly every page (e.g. "The Learning seam…", "One Learning Platform, instantiated per program…", "Within LAIC, programs are not hard-isolated…", "Affiliated orgs live inside…", "Bridge is not a separate module…"). Remove them.
- **The two Nexus-view notes specifically called out:** *"Only top-level orgs appear here…"* and *"Provisioning runs a fixed 6-step event…"* — both gone. (The provisioning flow can still *animate* its steps if useful, but with no paragraph explaining that it does.)
- **Verbose page subtitles** that narrate rather than orient — trim to a short phrase or drop entirely.
- **Per-button helper sentences** — e.g. the "isolated instance / shared instance · objects private to this program" chrome around the LP launch card. The launch action becomes **a simple labeled icon/button that just launches** — no instance-model exposition, no reuse counts in the primary flow.
- Treat these as *examples of a category*, not a checklist: the same broom sweeps every analogous note across the app. When in doubt, cut.
- Where a genuinely useful hint remains, prefer a small tooltip / `?` affordance over inline prose.

### 6.2 Remove the meaningless status decorations
- Kill the sidebar footer tags **"v0.5 · prototype"** and **"shared DB · RLS"** (and the `● production` env pill) — they convey nothing to a user and read as scaffolding. If a build/version indicator is ever wanted, it belongs in an about/settings corner, not the chrome.

### 6.3 Auth: no third-party SSO for now
- **Remove "Continue with Google / Microsoft / <Org> SSO"** from the org portal login. Too costly to implement now. Keep **email + password** and the **invited-member activation flow** (set password → verify → active). OAuth/SSO is explicitly deferred to §Phase 6.

### 6.4 Theming
- **Light / dark mode** from day one — shadcn theme tokens, class-based `dark` toggle, persisted per user.
- **Per-org theming = logo upload + a single accent color** (backed by the existing `PATCH /orgs/:id/theme` + `POST /orgs/:id/logo`). Applied to that org's Nexus pages (accent on primary actions/active states, logo in the brand slot). Nothing deeper — no per-page color config in this pass.

### 6.5 Typography & overall look
- Keep the **styling and fonts of our existing GitHub implementation** — `platform_logic`'s shadcn/ui baseline (its default font stack and tokens) — **not** the prototype's decorative Space-Grotesk + gradient + heavy-pill aesthetic.
- Target an **elegant, minimal, highly polished** feel — the reference points are Apple and similarly restrained product sites: generous whitespace, a tight neutral palette with one accent, few borders, subtle shadows/dividers instead of boxes-everywhere, restrained motion, no gradient fills on cards/icons.
- Fewer pills and badges; use them only for genuine status (draft/open/pending), not as decoration.
- **The point of the whole exercise is the flow and functionality** — the UI should get out of the way and make the structure legible, not perform.

> All finer visual decisions remain deferred and will be specified later. This section fixes the *direction* (minimal, elegant, un-narrated, light/dark, org accent+logo), not pixel specs.

---

## 7. Immediate next steps
1. Phase 0 environment (Docker PG + migrations + seeds + both servers running).
2. Phase 1 route/IA skeleton in `platform_logic` with the three session modes.
3. Phase 2 wiring, starting with dashboard + programs + offerings + registrations.
