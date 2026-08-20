# Content Manager — role, library tab, club sharing, delegated sub-roles

**Status:** BUILT. **Date:** 2026-08-19.

> Implemented as described below. §9 records what the build and an adversarial
> review changed: a Nexus route for the new tab, a merge for customized
> catalogues, six escalation closures around delegation, and two honesty fixes on
> the write paths. Verified against a live Postgres — see §7.

## Context

An administrator needs to create a **Content Manager** role at the program level. That role
unlocks a **Content Library** tab in the program workspace. Inside it, the Content Manager
decides *which content is shared to which club* (Google-Drive-style permissions), and can mint
**sub-roles** with fine-grained control — for example a "Content Access Granter" who may only
press Publish on individual content and pick the target app (only Bridge Bird exists today, but
the control is a dropdown).

The important finding up front: **most of this machinery already exists and works.** The
capability model, the role builder, the per-content-type narrowing, and server-side enforcement
are all live. What is genuinely missing is *data*: there is no way to express "this object is
shared with that club", and no way to express "this object publishes to that app".

---

## 1. What already exists (reuse, do not rebuild)

### Capability catalogue and enforcement — real and enforced
- `Components/laic-learning-platform/docs/learning-platform-access-catalogue.v1.json` — 23 atomic
  capabilities in 9 groups, 7 resource types, 14 UI surfaces. Loaded by
  `src/lib/accessControlCatalogue.ts:6`.
- The catalogue is **editable in-app** — `src/app/components/screens/PlatformAccessCatalogue.tsx`
  (tabs: Capability Sets / Capabilities / UI surfaces / Resource types / Sample roles / Export
  JSON / Schema). New capabilities are a data edit, not a deploy.
- Server-side enforcement: `TheNexusPlatform/backend-ts/src/routes/platform.ts:2199`
  `_requireLearningCap(eff, capId, objectType)` checks the capability **and** its content-type
  scope, and is applied per route (`:2125`, `:2254`, `:2259`, `:2260`, `:2278`, `:2287`).
- Effective capabilities are computed in `_learningEffective` (`platform.ts:2394-2456`) and
  clamped to the org's provisioning ceiling — including for admins (`:2437`).

### Role builders — two of them, both working
- **Nexus program roles** (this is the page in the first screenshot):
  `TheNexusPlatform/platform_logic/src/nexus/people/RolesAndGroups.tsx`, driven by
  `people/adapters.ts:87` `programRgAdapter`. Platform areas (`learning`, `bridge`, `clubapp`)
  render a 3-way **No / Partial / Full** picker (`RolesAndGroups.tsx:163-177`); Partial reveals
  that platform's Access-Catalogue capability chips (`:415`, `CapGroup :194`).
- **Content Studio roles**: `Components/laic-learning-platform/src/app/components/screens/AdminPeopleRoles.tsx`
  — capability chips grouped by set (`:219-264`) plus **per-content-type narrowing** via
  `TypeScopePanel` (`:54-120`, `:251-261`) across the 13 object types.

### Per-content-type scoping — already end to end
`TypeScopePanel` → `type_scopes` → `POST/PATCH /learning/roles` (`platform.ts:2341`) → pruned in
`_learningPermsWithCaps` (`:2346`) → enforced by `_requireLearningCap` (`:2208-2212`).
**Caveat:** it no-ops unless the role is `fineGrained`, i.e. `perms.capabilities` is non-empty
(`platform.ts:2204`). Any sub-role we mint must carry explicit capabilities or all scoping is
silently ignored.

### Tab unlocking — already exactly the requested mechanism
`TheNexusPlatform/platform_logic/src/nexus/layout/AppShell.tsx:103` `confinedProgramNav` renders a
program tab **iff** `perms[areaKey]` is set on the viewer's role, gated by `programs.features[key]`
(`platform_logic/src/types/platform.ts:22`). Granting `learning` already unlocks a Content Studio
tab today.

### Capabilities are already reachable client-side
`POST /programs/:id/roles` stores them **inside the perms blob** —
`offerings.ts:980` `finalPerms = { ...perms, capabilities: validCaps }`. So
`useProgramAccess(programId).perms.capabilities` (`platform_logic/src/nexus/access.ts:23`) already
carries the role's fine-grained grants. No new transport is needed for the new tab.

### Delegated role creation — one existing precedent
Every role-creation route is admin-gated *except* org roles, which use a **capability** gate:
`platform.ts:4380` `_requireOrgCap(user, orgId, "org.roles.manage")`. That is the pattern to copy.
`clampCapsToProvisioning` (`offerings.ts:977-982`) is the existing ceiling-clamp to copy alongside it.

---

## 2. The four real gaps

| # | Gap | Evidence |
|---|-----|----------|
| 1 | **No content → club sharing.** `learning_objects.program_id` is the only scoping column. `_programScope()` resolves visibility as `program_id in (program, club) or program_id is null`. | `backend-ts/src/db/orgGraphRepo.ts:2692-2709` |
| 2 | **No app target on content.** No `app_id` / audience column anywhere. Bridge Bird is not a DB record — it is a hardcoded Expo client pinned to a literal program id. | `platforms/learning/0001_learning_schema.sql:14-33`; `Applications/bridge-coach-app/lib/config.ts:105` |
| 3 | **The Audience UI is a prototype.** `AdminPublishingGovernance.tsx` writes to local `useState` and calls no backend; it is also blank in `nexusMode` (`:131`). | `AdminPublishingGovernance.tsx:139-142` |
| 4 | **No Content Library tab** narrower than the whole Content Studio, and role creation is admin-only for learning roles (`platform.ts:2501` `_learningAdmin`). | — |

Two clarifications that matter for the design:
- A **club is a partner program** — a `programs` row whose `metadata_json` carries
  `is_partner` + `connected_program_id` (`backend-ts/src/db/tenantRepo.ts:36-56`, `:165-208`).
  None of this is in SQL columns; it is JSON. Clubs are listed on the program's Partners tab
  (`platform_logic/src/nexus/routes/program.tsx:1286-1520`).
- `learning_objects.scope` (default `'bridge'`) **gates nothing today** — no query, reader, or
  filter reads it. Do not overload it; it is dead metadata with three inconsistent writers.

---

## 3. Design

### 3a. The Content Manager role

Created on **Nexus → Program → People → Roles** (`RolesAndGroups.tsx`), which is where roles grant
program areas and therefore where tabs get unlocked.

The admin sets **Content Studio = Partial** and ticks the new **Content Library** capability set.
No new `ProgramFeatureKey` is introduced — `learning` already exists, and a second key for the same
platform would have to be kept in step by hand across seven files.

### 3b. The Content Library program tab

Add to `confinedProgramNav` (`AppShell.tsx:103`) an entry rendered when the role's capabilities
include the new `learning.library.console`:

```
if (caps.includes("learning.library.console"))
  items.push({ to: `${base}/learning/library`, label: "Content Library", icon: FolderTree })
```

Gate on an **explicit positive capability**, never on the absence of other capabilities — a
negation-driven nav breaks the moment a capability is added to the catalogue.

`confinedProgramNav` currently receives only `perms`; pass `perms.capabilities` through from
`useProgramAccess` (already available, see §1). The route mounts the Content Studio confined to
the library surfaces, the same way the existing Content Studio tab mounts it confined by role.

### 3c. Club sharing — additive grant model

**Chosen semantics: additive.** A club sees content it authored, plus the parent program's, plus
anything explicitly granted to it. Adding the first share to an object never removes it from anyone
who can see it today. (Restrictive Drive semantics were rejected: the first share on an object
would silently revoke it from every club currently reading it.)

New migration `backend-ts/migrations/platforms/learning/0006_club_shares.sql`:

```sql
create table if not exists learning_object_shares (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  object_id        text not null references learning_objects(id) on delete cascade,
  club_program_id  uuid not null,               -- the partner program
  level            text not null default 'read', -- read | reuse
  granted_by       text,
  granted_at       timestamptz not null default now()
);
create unique index if not exists learning_object_share_uniq
  on learning_object_shares (object_id, club_program_id);
create index if not exists idx_learning_object_shares_club
  on learning_object_shares (club_program_id);
```

Change `_programScope()` (`orgGraphRepo.ts:2692`) from a plain `in (...)` to add an `exists` arm:

```sql
and ( program_id in (:ids)
      or program_id is null                      -- legacy, unchanged
      or exists (select 1 from learning_object_shares s
                  where s.object_id = learning_objects.id
                    and s.club_program_id = any(:clubIds)) )
```

`_programScope` is used by four callers (`listLearningObjects`, `listLearningObjectsMeta`, and their
non-collection fallbacks) — changing it once covers every read path. Keep the existing
`_isUndefinedColumn` fallback pattern so a deploy landing before the migration still serves the list.

New endpoints in `routes/platform.ts`, beside the existing share route (`:2306`):
- `GET  /learning/objects/:id/shares` → requires `learning.library.share_view`
- `PUT  /learning/objects/:id/shares` (body: `{ club_program_ids: string[] }`) → requires
  `learning.library.share_club`, gated through `_requireLearningCap` so type scopes apply

Club list for the picker comes from `tenantRepo.ts:211` `listPartnersForProgram(programId)`, already
exposed as `GET /programs/:program_id/partners` (`platform.ts:2781`).

**Do not reuse `PUT /learning/objects/:id/share`** (`platform.ts:2306`) — that is a boolean
anonymous public link (`shared_at`, `0002_public_share.sql`), a different concept that happens to
share a word.

### 3d. App-target publishing

New migration `0007_object_app_targets.sql`:

```sql
create table if not exists learning_object_app_targets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  object_id       text not null references learning_objects(id) on delete cascade,
  app_key         text not null,          -- 'clubapp' today
  published_at    timestamptz,
  published_by    text
);
create unique index if not exists learning_object_app_target_uniq
  on learning_object_app_targets (object_id, app_key);
```

**Dropdown source:** a small constant registry co-located with `PROGRAM_FEATURES` in
`platform_logic/src/types/platform.ts`:

```ts
export const CONTENT_APP_TARGETS = [{ key: "clubapp", label: "Bridge Bird" }];
```

Deliberately **not** `registered_apps` (`migrations/0005_offerings_apps_hook.sql:13`): that table is
offering-scoped, Bridge Bird has no row in it, and the client is hardcoded to a literal program id.
Leave a comment naming `registered_apps` as the migration target once Bridge Bird is a real record.

Publishing with a target extends `POST /learning/objects/publish` (`platform.ts:2230`) with an
optional `app_keys: string[]`, gated by the new `learning.publish.app_target`. The existing
`learning.publish.release` check (`:2259`) still governs whether they may publish at all.

### 3e. Delegated sub-roles

Change `_learningAdmin` (`platform.ts:2501-2508`) from "level === admin OR club structural tier" to
also admit a caller holding the new `learning.roles.delegate`, mirroring
`_requireOrgCap(user, orgId, "org.roles.manage")` at `platform.ts:4380`.

**Ceiling clamp is mandatory.** A delegated creator must never grant a capability they do not hold.
Intersect the requested capability set with the creator's own effective set from `_learningEffective`
before persisting, exactly as `clampCapsToProvisioning` does at `offerings.ts:977-982`. Without this,
`learning.roles.delegate` is a privilege-escalation primitive.

Sub-roles land in the existing `learning_roles` table (`migrations/0028_learning_roles.sql`), which is
a **flat list** — `POST /learning/roles` accepts no `parent_group_id`. If sub-roles need to nest under
"Content Manager" visually, that is a separate change to the learning role schema; the flat list is
sufficient for the described use.

The worked example — **Content Access Granter** — is then a learning role holding exactly
`learning.publish.release` + `learning.publish.app_target`, optionally type-scoped to e.g. `quiz` and
`tutorial_v2`.

---

## 4. Capability inventory — every action in the Content Library

### Existing capabilities that already cover a library action

| Library action (file:line) | Capability |
|---|---|
| Browse the library, open an object | `learning.object.read` |
| Open the editor (`ObjectLibrary.tsx:676`) | `learning.object.edit` |
| Create content | `learning.object.create` |
| Remove from folder / delete object (`:733`) | `learning.object.delete` |
| Create / rename / nest a collection (`:813`, `commitRename`) | `learning.repository.organize` |
| Add or remove an object from collections (`:619`) | `learning.repository.organize` |
| Save as a new version (`:685`) | `learning.publish.version` |
| Version history + restore (`:700`, `:717`) | `learning.publish.version` |
| Publish / unpublish | `learning.publish.release` |
| Public anonymous link (`copyObjectUrl :646`) | `learning.publish.audience` |
| Student preview / reader (`openReader :667`) | `learning.runtime.use` |
| Reuse library content in a course | `learning.composition.create` / `.edit` |
| Source pools, markup, extraction | `learning.source.manage` / `.extract` |
| Review, comment, approve, resolve | the five `learning.review.*` |
| Assignments, cohorts, progress | `learning.assignment.create`, `.cohort.configure`, `.progress.view` |
| Author analytics | `learning.analytics.view` |

### New capabilities to add to the catalogue

Add a new group **`library_governance`** ("Content Library") plus:

| Capability | Grants |
|---|---|
| `learning.library.console` | See the Content Library as its own program-level tab |
| `learning.library.share_view` | See which clubs an object is shared with |
| `learning.library.share_club` | Grant / revoke an object to a club |
| `learning.publish.app_target` | Choose which app an object publishes to |
| `learning.roles.delegate` | Create and edit sub-roles, clamped to own ceiling |
| `learning.library.export` | Export the library snapshot JSON |

`learning.library.export` closes a real hole, not a hypothetical one: `exportLibrarySnapshot`
(`src/lib/librarySnapshotSeed.ts:130`) is pure client-side, has **no capability check of any kind**,
and downloads every object and folder in the library. Anyone who can reach the button
(`ObjectLibrary.tsx:821`) gets the whole library today.

Mark `share_club`, `share_view`, and `publish.app_target` with `supportsResourceConstraints` so they
appear in `TypeScopePanel` (`accessControlCatalogue.ts:191`) and can be narrowed by content type.

---

## 5. A pre-existing hole this feature will expose

Per-action capability checks are **essentially absent in the Content Studio UI**. Capabilities are
consumed in exactly three places — the sidebar nav (`Sidebar.tsx:126`), a read-only banner that
disables nothing (`Layout.tsx:13-21`), and one screen lockout (`PlatformAccessCatalogue.tsx:547`).
`canEditScreen` (`learningAreas.ts:205`) is exported and never called. Publish and Delete buttons are
not gated client-side; the real gate is the server (`_requireLearningCap`), whose own comment at
`platform.ts:2152` calls per-action enforcement "the next pass."

That is survivable today because most roles are coarse. It is not survivable for a Content Access
Granter, whose entire definition is "may press exactly one button" — they would see every button and
collect 403s. **The share picker and the publish/app-target controls must be capability-gated
client-side as part of this work**, and the existing Publish/Delete buttons should be gated in the
same pass.

Related: `LEARNING_MANIFEST.accessTree` and its `objectScope` flag (`src/lib/learningAreas.ts`) are a
**parallel v2 draft that is largely unused** — the cascade helpers have no call sites, and
`objectScope` has no consumer. Build on the flat capability model (`accessPolicy.ts` →
`POST /learning/roles`), which is the live enforced path, and do not extend the tree.

---

## 6. Files to change

**Backend** (`TheNexusPlatform/backend-ts/`)
- `migrations/platforms/learning/0006_club_shares.sql` — new
- `migrations/platforms/learning/0007_object_app_targets.sql` — new
- `src/db/orgGraphRepo.ts:2692` — `_programScope` gains the shares `exists` arm
- `src/routes/platform.ts` — share GET/PUT endpoints; `app_keys` on publish (`:2230`);
  `_learningAdmin` (`:2501`) admits `learning.roles.delegate`; ceiling clamp on `POST /learning/roles` (`:2541`)

**Content Studio** (`Components/laic-learning-platform/`)
- `docs/learning-platform-access-catalogue.v1.json` — the six new capabilities + new group
- `src/app/components/screens/ObjectLibrary.tsx` — the share picker entry point, capability gating
- new share-picker component (clubs from `listPartnersForProgram`)
- `src/app/components/screens/AdminPeopleRoles.tsx` — reachable for delegated creators
- `src/app/components/screens/AdminPublishingGovernance.tsx` — replace the local-state audience
  prototype, or delete it in favour of the real picker

**Nexus console** (`TheNexusPlatform/platform_logic/`)
- `src/types/platform.ts` — `CONTENT_APP_TARGETS`
- `src/nexus/layout/AppShell.tsx:103` — Content Library entry in `confinedProgramNav`
- `src/nexus/access.ts:23` — surface `perms.capabilities` to nav consumers

**Optional, cheap, high value**
- `src/app/App.tsx:1092` `startRolePreview` is fully built and **has no caller**. Wiring a "Test as
  role" button into `AdminPeopleRoles.tsx` gives the Content Manager a way to verify a sub-role
  before assigning it.

---

## 7. Verification

1. **Migrations** — apply, then confirm the pre-migration fallback still serves the library
   (the `_isUndefinedColumn` path in `listLearningObjects`).
2. **Additive guarantee (the critical regression test)** — snapshot what a club sees via
   `GET /learning/objects?program_id=<club>&meta=1`; add a share on an unrelated object; re-fetch and
   assert the original set is a strict subset of the new one. Nothing may disappear.
3. **Sharing** — as a Content Manager, share object X with club A only. Assert A sees X; sibling club
   B does not; the parent program is unaffected.
4. **Ceiling clamp** — as a Content Manager holding only `publish.release`, attempt to create a
   sub-role granting `object.delete`. Assert the capability is dropped, not 500'd, and the role saves
   without it.
5. **Type scope** — give Content Access Granter `publish.release` scoped to `quiz`. Assert publishing
   a quiz succeeds and publishing a `tutorial_v2` returns 403 "limited to specific content types".
   Confirm the role is `fineGrained` (non-empty `perms.capabilities`) or the scope silently no-ops.
6. **Tab unlock** — create the role in Nexus, assign a test user, impersonate (`testAsRole`,
   `ProgramTeam.tsx:223`), assert the Content Library tab appears and no other program tab does.
7. **App target** — publish with `app_keys: ["clubapp"]`; confirm the row lands and Bridge Bird's
   Learn tab (`Applications/bridge-coach-app/app/(tabs)/learn/index.tsx:115`) still renders, since it
   filters on `published_at`/`status`, not on app target.

---

## 8. Open questions

1. **Does an app target filter reads, or is it metadata?** The schema above records it. If Bridge
   Bird should *stop* showing content not targeted at it, that is a second read-predicate change with
   real regression risk — and it is subtractive, unlike the share model. Recommend recording it first
   and enforcing in a later pass.
2. **Should a club be able to re-share content granted to it?** The `level` column (`read` | `reuse`)
   reserves the distinction; the design does not currently let a club re-grant.
3. **Sub-role nesting.** `learning_roles` is flat. Confirm a flat list under Content Manager is
   acceptable before adding a parent column.


---

## 9. What changed during the build

Four things the design did not anticipate, each found by following the wiring to its end.

**1. The new tab needed a route.** `confinedProgramNav` gaining an entry is only half
the tab: `/o/:orgId/p/:programId/learning/library` did not exist, so the item would
have dead-ended. The Studio already honours `?screen=<id>` and validates it against the
viewer's own access (`App.tsx`, `wanted`/`allowed`), so the route renders
`<LearningLaunch screen="cd-library" />` and the launch URL carries the screen through.
A preference, never a way in — an unauthorised screen falls back to wherever that person
would have landed.

**2. A customized catalogue would never have seen the new capabilities.**
`getCatalogue` (`accessCatalogue/store.ts`) returns a stored document verbatim, and the
Studio's Access Catalog tab writes one on every save. Any deployment that had ever
pressed Save had its capability list frozen at that moment: the six new ids would be
absent, the role builder would not offer them, and `validGrantsAcross` would drop them
from anything that asked anyway — a feature that ships, does nothing, and says nothing
about why. `_withShippedAdditions` now folds in ids the stored document has no entry
for. **Add-only, stored entries always win**, so a renamed label or an org's own
capability is never touched. Known cost, deliberately taken: a capability an admin
*deliberately deleted* comes back. A resurrected capability is merely grantable and can
be ignored; a missing one cannot be switched on. Covered by `tests/catalogueAdditions.test.ts`.

**3. Delegation leaked through three routes the design only half-closed.** Clamping
capabilities on role *creation* is not the whole escalation surface:
- `PUT /learning/assign` — a delegate could assign an *existing* stronger role, to
  themselves. Now gated by `_assertRoleWithinCeiling`.
- `PATCH /learning/roles/:id` — `perms` carries the legacy area grants, which
  `_clampToCeiling` never sees, so editing someone else's stronger role had to be
  refused at the door rather than trimmed on the way in.
- `DELETE /learning/roles/:id` — destructive rather than escalating, closed for consistency.

A role with **no** capabilities is refused rather than guessed at: its power comes from
the level path, not from a set the ceiling can compare against.

**4. The read predicate needed a missing-table fallback, not just a missing-column one.**
The existing tolerance caught 42703 (undefined column). A deploy landing ahead of 0006
raises 42P01 (undefined *table*), which the old handler would have let through as a 500 —
a blank library. `_withLearningReadFallbacks` degrades once per flag and then throws,
so a third failure is still a real error rather than a quietly narrower answer.

### Verified against a live Postgres

Both migrations replay cleanly (idempotent under the ledger-less runner). With a parent
program, two clubs, and a legacy unpinned object seeded, sharing Club B's object with
Club A gave Club A exactly one more row and left Club B untouched. The additive
guarantee was checked as an assertion rather than by eye — every club's post-share view
against its pre-share view, `LOST_ROWS = 0`. Reconcile, replay-as-no-op, narrowing, the
app-target upsert, and cascade-on-delete all behave as specified.

Backend: typecheck clean, 104 passing (99 pre-existing + 5 new), 36 failures identical to
the pre-change baseline (they need a Postgres with role-setting privileges). Content
Studio: builds, 68 typecheck errors identical to baseline, none in touched files.


---

## 10. What the security review changed

The delegation design was reviewed adversarially after it was built. Two findings I had
already closed while wiring; six were real and are fixed. The pattern in all of them is
the same: **the ceiling was comparing the wrong thing.**

**Fewer capabilities is not less power.** `_requireLearningCap` opens with
`if (!eff.fineGrained) return;` — every fine-grained gate is a no-op for a caller whose
capabilities came from their launch *level* rather than from a role. That accommodation
is what keeps ordinary club members working. It also means a capability-less role is not
a weak role, it is an **ungated** one. So a delegate could `PATCH` their own role to
`capabilities: []`, pass the clamp trivially (∅ is within every ceiling), and land in a
path where `object.delete` and `publish.release` are not checked at all. Three doors led
there and all three are now shut: an empty capability list, an omitted one, and a bare
`perms` write that replaces the blob by omission. `_assertNotDisarming` names the reason.

**Unassigning is not the safe direction.** `PUT /learning/assign` with `role_id: null`
drops someone to their launch level — the same ungated path. A delegate removing a role,
including their own, was therefore an escalation dressed as a revocation. Structural
admins may still do it; delegates may not.

**A type scope is part of a grant.** A Content Manager holding `publish.release` limited
to quizzes still *reports* `publish.release`, so an id-only ceiling would mint a sub-role
holding it for every content type — then assign it to themselves. `_clampScopesToCeiling`
now intersects, and falls back to the creator's own list when the intersection is empty
rather than to `{}`, because absent means **every** type downstream.

**The catalogue is the definition of the permission system.** `PUT /learning/catalogue`
is a *global* document, and `_learningAdmin` had widened to admit delegates. Rewriting
`sampleRoleTemplates["learning-content-developer"]` grants capabilities to every level-`edit`
caller on the deployment — which is every partner club member. Catalogue writes now
require `_learningStructuralAdmin`; the ceiling would be decorative if the person bounded
by it could redefine the bounds.

**Role mutations were not scoped to a program.** `getLearningRole`/`update`/`delete`
filter on the role id alone, under `asPrivileged`. Pre-existing, but this change newly
admitted club admins and delegates to those routes, so `_assertRoleWithinCeiling` now
checks the role's program for *every* caller — 404, not 403, since whether a role exists
in another org is not the caller's business.

**A new surface should not inherit an old compatibility hatch.** The `fineGrained` escape
exists so publishing did not break for existing club members. Per-club sharing has no
incumbents to protect, and inheriting the hatch meant any ordinary club member could hand
the parent's library to sibling clubs — the exact exposure the feature governs, ungated on
day one. The three new routes use `_requireLearningCapStrict`.

### Two honesty fixes

- `setLearningObjectAppTargets` returned `{ok: true}` on an empty set and deleted nothing,
  contradicting its own doc comment. Unticking Bridge Bird reported success and the modal
  reopened with it still ticked. It now reconciles like the shares do.
- `listObjectShares` answered `[]` on any failed response, 403 included. Since save writes
  the *whole* set, a swallowed error read as "revoke every grant" and then did it. It
  throws now, and the modal disables Save until the current grants have actually been read.

Pinned by `tests/learningDelegation.test.ts` (11 cases) and `tests/catalogueAdditions.test.ts`
(5). The review also confirmed several things were already sound: the correlated
`learning_objects.id` reference is unambiguous in all three embedding queries, the `exists`
arm cannot leak across orgs (the FK plus the outer `organization_id` filter close it), the
fallback ladder terminates, and every `sql.join` interpolation is a bound parameter.

---

## 11. Folded into the existing grants table

The branch had moved on before this landed. `Quan` already carried **Track C** — content
ownership and per-object sharing — which introduced:

- `learning_objects.scope_level` (`'user' | 'program'`) — a personal "just for me" tier
- `learning_object_grants (object_id, subject_type, subject_id, level)` with
  `subject_type in ('profile', 'role')`
- `_personalScope(viewer)`, a second predicate layered under `_programScope`

Both migration numbers I had used were taken, and we had each rewritten the same read
path. The design changed in response, and the result is better than what it replaced.

**One table, three subject types.** `learning_object_shares` is gone. A club is now a
third `subject_type` on their `learning_object_grants`. Two tables would have meant two
visibility predicates that must agree forever and would have had to be edited together
every time the rules moved.

**But two predicates, deliberately — because they answer different questions.**

| | question | where it lives |
|---|---|---|
| `_personalScope` | *whose* content is this? | consulted only for `scope_level = 'user'` rows |
| `_programScope` club arm | *which programs'* content is in scope? | widens the program predicate itself |

That split is not cosmetic. A club grant exists precisely to reach **across** programs —
club B's object, program-scoped, made visible to club A — so it cannot live in the
personal tier, which only ever consults grants for rows already marked personal.

The composition was tested, because it is the interesting part: a **club grant does not
defeat the personal tier.** Club-granting an object whose `scope_level` is `'user'` leaves
it hidden from everyone but its owner, since the two gates are `and`-ed. Someone's private
draft cannot be exposed by a club share.

Other consequences of the fold-in:

- My migrations renumbered to **0008** (club grants) and **0009** (app targets).
- 0008 widens their `check (subject_type in ('profile','role'))` by **finding the
  constraint by definition rather than by name** — 0007 declares it inline, so the name is
  whatever Postgres generated, and a hard-coded guess would silently no-op and leave every
  club insert failing.
- Their `listLearningObjectGrants` now filters to `('profile','role')`. It backs the
  invite-a-colleague UI, and a club row returned there would render as a person.
- My `_withLearningReadFallbacks` and `_isUndefinedTable` are deleted — their
  `_missingPersonalTier` / `_isUndefinedRelation` already cover the same ground, and one
  table backing both arms means one fallback covers both.
- `granted_by` is a `uuid` column, so the route passes the acting profile id, not the
  email the older learning writes carry.

Verified on a live Postgres: their 0006/0007 then my 0008/0009, replayed twice, clean. The
merged predicate gives Club A exactly one more object and leaves Club B untouched, with the
personal tier still holding. Their test baseline on the same env is 36 failed / 99 passed;
with this work it is 36 failed / 115 passed — identical failures, plus the 16 new tests.
