# Central Access Catalogue — Design

> How to lift the Access Catalogue out of the Learning Platform into **one central,
> server-owned service** that every level (Nexus, Org, Program) and every app
> (Learning, Bridge, …) uses to define roles — as **finer control layered on top
> of** everything we've already built (Super Admin, Teams & Roles, Groups,
> Categories, hierarchy), impacting none of it.

Status: design / proposal. Nothing here changes behaviour until built; the plan is
deliberately **additive**.

---

## 1. The concept — catalogue vs. roles

The Access Catalogue is the **inventory of what can be permission-controlled**. It
says nothing about *who* gets what. That is the split the platform team's manual
draws, and we keep it:

| Access Catalogue (this doc) | People & Roles (already built) |
|---|---|
| What *can* be gated | Who *gets* those grants |
| Platform-owned inventory | Per-level role assignments |
| Domains → Modules → **Capabilities** + **Surfaces** + resource types + sample roles | Custom roles, assignments, groups |

A **capability** is an atomic verb the code checks (`create_offerings`, `manage_people`,
`publish`…). A **surface** is a nav item/screen, unlocked by `requiredCapabilities`.
A **role** is just a set of capability ids. The capability string is the *join key*:
the catalogue declares it, a role selects it, the code checks `can("…")` — pure set
membership.

---

## 2. Where we are today — two parallel worlds

**AshwiniNew (Learning Platform).** A full catalogue *editor* tab
(`PlatformAccessCatalogue.tsx`) + `accessControlCatalogue.ts`, but the catalogue is
stored in **`localStorage`** (per-browser, client-only) and lives inside the
learning app. Two catalogue JSONs are already checked in (learning + bridge) and the
document has a `provider: { kind, id }` field — so multi-catalogue was anticipated
but never centralized.

**QR-version (this branch).** A related-but-different model: a v2 "access manifest"
(an `accessTree` whose **view/edit** levels expand to capabilities), the shared
`RolesAndGroups` builder, and scoped roles (`program_roles`) at Nexus/Org/Program.
Our builder authors in coarse `view/edit` areas, not raw catalogue capabilities.
**Enforcement in both worlds is UI-only** (hidden buttons), not server-checked.

The task is to merge these into one server-owned catalogue and — the real prize —
wire capability checks into the server.

---

## 3. Target architecture — one service on the Nexus backend

The catalogue is platform-owned inventory, and the **Nexus backend is already the
identity + role authority** (it stores `program_roles`, resolves platform access,
serves `/context`). Every level and every app already talks to it. So it lives once,
there, and everything reads it.

```
                    ┌──────────────────────────────────────────────┐
                    │           Nexus backend (backend-ts)          │
                    │  access_catalogues table (one doc/provider)   │
                    │  GET/PUT /catalogues/:providerId  (+ schema)  │
                    │  resolver: capabilitiesFor(user, scope)       │
                    └──────────────────────────────────────────────┘
                        ▲            ▲             ▲            ▲
        ┌───────────────┘     ┌──────┘        ┌────┘      ┌────┘
   Console editor tab   Console role builder  Learning app  Bridge app
   (edit catalogues)    (RolesAndGroups)      People&Roles  People&Roles
```

- **Storage:** `access_catalogues(provider_id PK, document jsonb, version, updated_at)`,
  seeded from checked-in defaults on first run. One row per **provider**.
- **API:** `GET /catalogues` (list), `GET /catalogues/:id` (read — editor, builder,
  resolver), `PUT /catalogues/:id` (save — **operator-gated**; the platform owns the
  inventory), `GET /catalogues/schema`.
- **Consumers:** the console editor tab, the console role builder, and each app
  (Learning/Bridge) which **fetches its catalogue from the backend** instead of
  owning it. The learning app drops `localStorage`.

---

## 4. Levels vs. platforms vs. providers (the clarification)

Two axes are easy to conflate:

- **Altitudes** (where roles are *defined*): **Nexus, Org, Program**.
- **Providers** (who *owns capabilities*): the **Learning app**, the **Bridge app**,
  and the **Nexus / Org / Program consoles** themselves.

A role at an altitude grants capabilities from **one or more provider catalogues**.
A Program role can grant program-console capabilities **and** Learning capabilities
**and** Bridge capabilities. AshwiniNew's grant model already carries a
`platformInstanceId` per grant — that's the hook that makes cross-catalogue roles work.

"One central catalogue" therefore means: **one service hosting one document per
provider, all in the same schema, all driven by the same editor UI, the same role
builder, and the same resolver.**

---

## 5. The derived catalogues (from the actual code)

These are read out of the real nav (surfaces) and the real guarded mutation endpoints
(capabilities). Nothing invented. (Gates are intentionally omitted — out of scope.)

### Nexus (provider: `nexus-console`)

```
Organizations  surface:/orgs
  provision_orgs · edit_org_envelope · assign_org_admins
Operators      surface:/team        ── reserved: full operator ──
  manage_operators           (invite/remove operators, operator roles, nexus roles)
Settings       surface:/settings
  edit_platform_branding
Audit          surface:/audit
  view_platform_audit
```

### Org (provider: `org-console`)

```
Programs   surface:/programs
  create_programs · configure_programs · delete_programs · assign_program_admins
People     surface:/team  (Teams & Roles)
  manage_people · manage_roles · manage_groups
  ── reserved: Super Admin (owner) — not grantable to custom roles ──
  remove_admins · set_program_access_policy   ("admins can open programs")
Settings   surface:/settings
  edit_branding · manage_categories
Audit      surface:/audit
  view_audit
```

### Program (provider: `program-console`)

```
Offerings       surface:/offerings
  create_offerings · edit_offerings · publish_offerings · delete_offerings
App Shells      surface:/shells
  manage_app_shells
Registrations   surface:/registrations
  manage_registrations
People          surfaces:/team,/groups  (Teams & Roles + Participants & Groups)
  manage_people · manage_roles · manage_groups
Community       surface:/community
Partners        surface:/partners
  manage_partners
Settings        surface:/settings
  edit_branding
Platforms       surfaces:/learning,/bridge,/shells   ← hand-off seam
  open_learning · open_bridge · open_app_shells
```

- **Program admin = the bypass tier** (a program-scoped `administrator`/`owner`
  gets the whole program catalogue, structurally — never gated). Custom program roles
  get the finer capabilities.
- **Org-altitude program actions** (`delete program`, `configure features /
  platforms_open`, `assign program admins`) live in the **Org** catalogue and stay
  reserved there — the program catalogue only lists what a program *role* can grant.
- **`open_learning` is a seam**: it grants entry; inside the app, the **Learning
  catalogue** governs the finer capabilities.

### Learning / Bridge (providers: `learning`, `bridge`)

Owned by those apps' teams — the existing AshwiniNew learning catalogue and the
bridge catalogue, now served centrally instead of from `localStorage`.

---

## 6. Reserved (tier) capabilities — how Super Admin fits with zero change

The one new concept the catalogue needs. Each capability carries a marker:

- **Grantable** → a custom role may hold it (`manage_people`, `configure_programs`…).
- **Reserved: `owner`** (Org) / **Reserved: `full-operator`** (Nexus) → it exists in
  the inventory (so the resolver *knows* it's gated) but the **role builder never
  offers it**; it is held only by the structural tier.

`remove_admins`, `set_program_access_policy`, `manage_operators` are reserved. This
**is** the owner-only / full-operator-only guards we already wrote — the catalogue
just *documents* them in one place. Owner / admin / program admin / full operator keep
bypassing the whole check exactly as today. **Super Admin is unaffected.**

---

## 7. Resource types (the scoping axis) — declared, deferred

Type-restriction exists for the Learning Platform because it has typed objects (drill,
lesson…). The consoles don't have rich typed resources — most console capabilities are
org-wide / platform-wide and unscoped. The natural (optional) scoping targets:

- **Org:** `program`, `category` — e.g. a role that can `manage_people` **only in these
  programs / this category** (the "program manages its own people" idea, tied to
  Categories).
- **Nexus:** `organization` — a confined operator scoped to specific orgs.

Recommendation: **declare these resource types in the catalogue, defer enforcement**
(same call the platform team made for learning object types). The slot exists; nothing
depends on it for v1; it's the clean path to per-program / per-category scoping later.

---

## 8. How roles are authored — the one real decision

There are two authoring models, and they must be reconciled:

- **Catalogue-native** (AshwiniNew, the manual): role = raw capability ids. Granular,
  expressive, matches the inventory directly.
- **Ours** (`RolesAndGroups`): role = `{area: view|edit}`. Simpler, but lossy — the
  capability-permission doc itself flags "view/edit is a v1 simplification; some
  capabilities are orthogonal to it."

**Recommendation:** make the **catalogue the single source** of capabilities +
surfaces + groups, and author roles by **selecting capabilities within groups**
(catalogue-native). Keep a `view/edit` convenience only where a group cleanly splits
that way. This is the more honest model and matches the platform team's format;
picking wrong here means a rebuild, so it's called out explicitly.

The compact stored form stays small: a role is `{ providerId, capabilityIds[],
resourceConstraints? }[]` — opaque to Nexus, meaningful to the resolver.

---

## 9. End-to-end flow (plain language)

1. **Provision** → each provider's catalogue is seeded server-side from its default.
2. **Curate** → a platform operator edits a catalogue in the shared tab; it persists
   on the server, visible to everyone (no more per-browser `localStorage`).
3. **Build a role** (any People tab) → the builder pulls the applicable catalogue(s)
   and shows their capabilities/surfaces grouped; the admin ticks what the role grants.
4. **Assign** → a person gets the role (existing `program_roles` + assignment plumbing).
5. **Run** → the app asks the backend for context; the resolver expands
   role → capabilities from the **central catalogue** and returns (a) which surfaces to
   show, (b) the capability set. The app hides UI it can't use **and** each action API
   calls `can()` and refuses if the capability is absent.

One catalogue drives the editor, the builder, **and** enforcement.

---

## 10. Server enforcement — the real prize (today's gap)

Both worlds currently enforce in the UI only (hidden buttons ≠ security). The central
service makes real enforcement a bounded task. The resolver:

```
capabilitiesFor(user, scope):
    if user is a structural tier for this scope (owner/admin/program-admin/operator):
        return ALL grantable capabilities        # bypass
    role = lookupRoleAssignment(scope, user)      # from the DB
    caps = new Set()
    for grant in role.grants:
        catalogue = getCatalogue(grant.providerId) # central, server-side
        caps.addAll(grant.capabilityIds ∩ catalogue.capabilities)   # validate against the inventory
    return caps
```

Then every mutating endpoint: `if (!caps.has("create_offerings")) return 403`. Because
the resolver runs on the server against the DB-stored role + the imported catalogue, a
forged client call gains nothing. Reserved capabilities are never in a custom role's
grants, so only the structural tier ever holds them.

---

## 11. "Anywhere there's People" — what each tab reads

| People tab | Catalogue(s) its role builder reads |
|---|---|
| **Nexus** → People | `nexus-console` |
| **Org** → People | `org-console` |
| **Program** → People | `program-console` **+** `learning` **+** `bridge` (enabled platforms) |
| **Learning app** → People & Roles | `learning` |
| **Bridge app** → People & Roles | `bridge` |

Every People surface uses the **same** shared role builder, fed by the relevant
provider catalogue(s) from the **same** central service.

---

## 12. How it maps onto what we built (non-breaking)

- `RolesAndGroups` → renders from a catalogue's groups instead of hardcoded
  `ScopedArea` lists. Same panel, same drag/hierarchy, same "display as group".
- `program_roles` / `learning_roles` → the role-assignment store (role → grants).
- `capabilitiesFor` → the server resolver, now reading the central catalogue.
- The per-level adapters (`nexus/org/program RgAdapter`) → each points at its
  provider catalogue(s).
- Structural tiers (Super Admin/owner, admin, program admin, full operator), Groups
  hierarchy, role-as-group, program platform lock, Categories → **all unchanged**;
  they're either capabilities the catalogue lists or structural policy it describes
  but doesn't own.

The migration per altitude is simply: replace today's ~4 coarse areas with the derived
catalogue capabilities; keep the resolver mapping role → capabilities; keep the tiers
bypassing.

---

## 13. Where it lives in code

```
backend-ts/src/accessCatalogue/
  schema.ts        CapabilityCatalogueDocument type + JSON schema (shared)
  defaults/        nexus-console.json · org-console.json · program-console.json
                   learning.json · bridge.json      (seed inventory)
  store.ts         access_catalogues table read/write + seeding
  resolver.ts      capabilitiesFor(user, scope)
backend-ts/src/routes/catalogue.ts     GET /catalogues[/:id|/schema], PUT /catalogues/:id
backend-ts/migrations/00xx_access_catalogues.sql

platform_logic/src/nexus/access/
  CatalogueEditor.tsx   (ported from AshwiniNew PlatformAccessCatalogue, provider-selectable)
  catalogueClient.ts    GET/PUT wrappers
  (RolesAndGroups.tsx    reads catalogue instead of hardcoded areas)

Learning / Bridge apps: fetch their catalogue from the Nexus backend via the existing
launch/context auth; drop localStorage ownership.
```

---

## 14. Problems & edge cases (honest)

1. **Two role models must be reconciled** (§8) — the biggest decision; wrong choice = rebuild.
2. **Enforcement is still UI-only** — the central service *enables* server checks, but
   every action API must actually call `can()`. Until then a role is cosmetic. This is
   the true remaining work (§10).
3. **Validate roles against the catalogue on write** — the manual says "don't invent ids
   outside the catalogue," but the backend stores roles as opaque blobs today.
   Centralizing lets the server reject unknown ids; do it or drift creeps in.
4. **Ownership** — the platform owns the inventory; programs only *bind* roles. Catalogue
   edits stay operator-gated; role-building is per-level.
5. **`localStorage` → server is a behaviour change** — everyone shares one catalogue
   (good), but needs auth + concurrent-edit handling (version check, not last-write-wins).
6. **Versioning / drift** — renaming/removing a capability breaks roles referencing it;
   `schemaVersion` / `catalogueVersion` exist, but one bad central edit now affects
   everyone. Needs a migration/validation story.
7. **Cross-catalogue roles** — a program role spans `program-console` + `learning` +
   `bridge`; the builder and resolver must load and merge multiple catalogues per role.
8. **Object/resource-type restriction** — declared but unbuilt; enforcing "edit only
   drills" (or "manage people in these programs") needs the resolver *and* the action
   API to check the target.
9. **Do the consoles need the full catalogue?** — Nexus/Org/Program console areas are
   small, stable, first-party. Full catalogue treatment is clean but heavier than
   leaving them as hardcoded areas; a deliberate call, not an assumption.
10. **Sample-role sync can clobber** — AshwiniNew upserts sample roles on save; treat
    them as *starters that never overwrite* a customized role.

---

## 15. Phased plan

**Phase 1 — Central service (backend).** `access_catalogues` table + migration; the
schema + the five seed catalogues; `GET/PUT /catalogues` (operator-gated); seeding on
boot. *Outcome: one server-owned catalogue per provider, readable by anyone, editable
by operators.*

**Phase 2 — Editor tab everywhere.** Port AshwiniNew's catalogue editor into the
console as a provider-selectable tab backed by the API (drop `localStorage`). *Outcome:
view/edit any provider's catalogue from one place.*

**Phase 3 — Catalogue-driven role builder.** `RolesAndGroups` reads the relevant
catalogue(s) and authors capability grants; store roles as `{ providerId, capabilityIds }[]`;
mark reserved capabilities so the builder hides them. Wire all five People tabs.
*Outcome: roles authored against the real inventory, at every level, unchanged tiers.*

**Phase 4 — Server enforcement (the prize).** `capabilitiesFor` resolver + validate
roles against the catalogue on write + add `can()` checks to mutating action endpoints,
altitude by altitude. *Outcome: a real permission system, not just hidden buttons.*

**Phase 5 — Learning/Bridge migration + resource scoping (deferred).** Point the apps'
People & Roles at the central catalogue; then, if wanted, build resource-type
constraints (object types, per-program/category scoping).

---

## Appendix — catalogue document shape (per provider)

```
schemaVersion, provider: { kind, id }, catalogueVersion
capabilities[]   { id, label, group, reserved?, resourceTypes?, supportsConstraints? }
uiSurfaces[]     { id, label, kind, group, requiredAnyCapabilities[] }
groups[]         { id, label, order, capabilityIds[], uiSurfaceIds[] }
resourceTypes[]  { id, label, constraintFields? }        (deferred)
sampleRoleTemplates[]  { id, name, grants[] }             (starters, never overwrite)
```
Role (stored per assignment, opaque to Nexus): `grants[] = { providerId, capabilityIds[], resourceConstraints? }`.
