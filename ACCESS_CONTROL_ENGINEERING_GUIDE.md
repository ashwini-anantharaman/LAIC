# Access Control — Engineering Guide

**Who this is for:** engineers joining the team who will read, extend, or debug the
permission system across Nexus, the Content Studio, the Bridge Platform, and the Bridge Bird
mobile app.

**What this document is:** a description of what the code *actually does today*, with file
and line references so you can verify every claim. Where the shipped system diverges from the
design documents (`TheNexusPlatform/ACCESS_CATALOGUE_DESIGN.md`,
`NEXUS_UPDATES_AND_ACCESS_ENFORCEMENT.md`), this document describes the code and says so
explicitly. Those design docs describe intent; several parts were built differently.

For the operational view — how an administrator grants and revokes access — read
`ACCESS_CONTROL_ADMIN_GUIDE.md` first. It is short and it establishes the vocabulary.

Paths are relative to the repo root unless stated.

---

## Contents

**Part I — Orientation**
1. [The system in sixty seconds](#1-the-system-in-sixty-seconds)
2. [The five surfaces and how they connect](#2-the-five-surfaces-and-how-they-connect)
3. [Vocabulary](#3-vocabulary)

**Part II — The authority pipeline**
4. [Providers and catalogues](#4-providers-and-catalogues)
5. [Where access data actually lives](#5-where-access-data-actually-lives)
6. [`resolvePlatformAccess` — identity and scope](#6-resolveplatformaccess--identity-and-scope)
7. [The grant ladder](#7-the-grant-ladder)
8. [The provisioning ceiling](#8-the-provisioning-ceiling)
9. [`capabilitiesFor` and `requireCapability`](#9-capabilitiesfor-and-requirecapability)
10. [Launch tokens and session handoff](#10-launch-tokens-and-session-handoff)

**Part III — Enforcement, surface by surface**
11. [Nexus backend](#11-nexus-backend)
12. [Bridge Platform](#12-bridge-platform)
13. [Content Studio](#13-content-studio)
14. [Bridge Bird mobile app](#14-bridge-bird-mobile-app)
15. [Console](#15-console)

**Part IV — Working on it**
16. [Invariants — the rules that are easy to break](#16-invariants--the-rules-that-are-easy-to-break)
17. [How to make common changes](#17-how-to-make-common-changes)
18. [Database and migrations](#18-database-and-migrations)
19. [Local development and testing](#19-local-development-and-testing)
20. [Known gaps, ranked](#20-known-gaps-ranked)
21. [File index](#21-file-index)

---

# Part I — Orientation

## 1. The system in sixty seconds

A **capability** is a string. `app.challenge.create`. `learning.publish.release`.
`page.library`. That string is the join key for the whole system: a **catalogue** declares
it, a **role** selects it, and the code checks whether the caller's resolved set contains it.

Three layers decide whether a caller holds a capability:

```
   PROVISIONING (the ceiling)   what the org gave the program.  Beats everything.
            ∩
   STRUCTURAL TIER              owner/administrator → all grantable caps.
            ∪
   ROLE GRANTS                  what this person's role selected.
```

Nexus is the single authority. It owns identity, roles, catalogues and provisioning, and it
answers three context endpoints — one per platform — that hand a resolved capability list to
whoever asked. Every other surface is a consumer.

**The two facts that explain most of the code's shape:**

1. **Absent is not denial.** An empty capability list means "no restriction recorded", not
   "forbidden". Denial travels through a dedicated channel (`features[key] === false`). This
   is stated at length in `TheNexusPlatform/backend-ts/src/accessCatalogue/provisioning.ts:12-29`
   and it has already caused one production bug.
2. **Failures must not read as revocations.** A database hiccup, a catalogue read error, or a
   404 on a program lookup all resolve to *unrestricted*, not *denied*. See
   `provisioning.ts:97-114` and `:136-145`.

## 2. The five surfaces and how they connect

```
┌──────────────────────────────────────────────────────────────────────────┐
│  NEXUS BACKEND         TheNexusPlatform/backend-ts                        │
│  ─────────────────────────────────────────────────────────────────────    │
│  identity · memberships · roles · catalogues · provisioning · audit       │
│                                                                           │
│  GET /api/platform/bridge/context      → BridgeContext                    │
│  GET /api/platform/learning/context    → LearningContext                  │
│  GET /api/platform/club-app/context    → AppContext                       │
│  GET /api/platform/me/capabilities     → provider-scoped capability set   │
│  POST /api/platform/auth/launch-exchange                                  │
└──────────────────────────────────────────────────────────────────────────┘
        ▲                    ▲                    ▲                 ▲
        │ bearer             │ bearer             │ bearer          │ launch
        │                    │                    │                 │ token
┌───────┴────────┐  ┌────────┴─────────┐  ┌───────┴───────┐  ┌──────┴──────┐
│ CONSOLE        │  │ BRIDGE PLATFORM  │  │ CONTENT       │  │ BRIDGE BIRD │
│ platform_logic │  │ Applications/    │  │ STUDIO        │  │ APP         │
│ (Vite SPA)     │  │  BridgePlatform  │  │ Components/   │  │ Applications│
│                │  │  apps/bridge-web │  │  laic-        │  │  /bridge-   │
│ authors        │  │  (Next.js)       │  │  learning-    │  │  coach-app  │
│ provisioning   │  │                  │  │  platform     │  │  (Expo)     │
│ + roles        │  │ enforces on      │  │  (Vite SPA)   │  │             │
│                │  │ roles/perms/caps │  │               │  │ gates UI on │
│                │  │                  │  │ UI-only gates │  │ app.* caps  │
└────────────────┘  └──────────────────┘  └───────────────┘  └─────────────┘
```

The mobile app also **embeds** the other two: it mints a launch token, exchanges it, and
loads the Bridge Platform or Content Studio in a webview. That is why launch handoff (§10) is
load-bearing rather than incidental.

## 3. Vocabulary

| Term | Definition | Declared at |
|---|---|---|
| **Provider** | The owner of one catalogue. Seven of them. | `accessCatalogue/types.ts:95-107` |
| **Capability** | Atomic permission string. | catalogue documents |
| **Surface** | A nav item or screen, unlocked by `requiredAnyCapabilities`. | catalogue documents |
| **Reserved capability** | In the inventory but never offered to a role builder; held only by structural tiers. | `Capability.reserved` |
| **Grant** | `{ providerId, capabilityIds[] }` stored against a role. | |
| **Structural tier** | owner/administrator at org or program level; platform_admin at Nexus level. | `accessCatalogue/enforce.ts:29-42` |
| **Envelope / ceiling / provisioning** | `feature_access[key].capabilities` — the maximum a program's roles may grant. | `provisioning.ts` |
| **Altitude** | Where a role is *defined*: Nexus, Org, or Program. | |
| **Partner club** | A program with `metadata_json.is_partner` and `connected_program_id`. | `db/tenantRepo.ts:47-48` |

**Two axes people conflate.** *Altitude* is where a role is defined. *Provider* is who owns
the capabilities it grants. A Program-altitude role can grant `program-console` **and**
`learning` **and** `bridge` **and** `club-app` capabilities simultaneously — see
`routes/offerings.ts:956-961`.

---

# Part II — The authority pipeline

## 4. Providers and catalogues

Seven providers, declared once as a const tuple:

```ts
// TheNexusPlatform/backend-ts/src/accessCatalogue/types.ts:95-107
export const PROVIDER_IDS = [
  "nexus-console", "org-console", "program-console",
  "learning", "bridge", "library", "club-app",
] as const;
```

| providerId | Kind | `provider.id` **inside the document** | Capabilities | Namespace |
|---|---|---|---|---|
| `nexus-console` | console | `nexus-console` | 9 | `nexus.*` |
| `org-console` | console | `org-console` | 13 | `org.*` |
| `program-console` | console | `program-console` | 16 | `program.*` |
| `learning` | platform | **`learning-platform`** | 23 | `learning.*` |
| `bridge` | platform | **`bridge-platform`** | 40 | `bridge.*`, `kb.*` |
| `library` | framework | `library` | 9 | `library.*` |
| `club-app` | application | `club-app` | 26 | `app.*` |

> **The `provider.id` mismatch on `learning` and `bridge` is load-bearing, not a bug.**
> `PUT /catalogues/:provider_id` asserts `doc.provider.id === id` (`routes/platform.ts:4024`),
> so those two documents can only be written through their own dedicated endpoints, which check
> `"learning-platform"` (`platform.ts:2525`) and `"bridge-platform"` (`platform.ts:1652`).
> Do not "fix" the mismatch — it is what keeps the generic catalogue endpoint from
> overwriting a platform's own document.

**Storage and instance scoping.** Catalogues are stored in the `platform_settings` key-value
table under `access_catalogue:<providerId>[:<instanceId>]` (`store.ts:24-25`) — *not* in a
dedicated `access_catalogues` table as the design doc proposed. `nexus-console`, `learning`,
`bridge`, `library` and `club-app` are global; `org-console` is keyed by org id;
`program-console` by program id (`enforce.ts:61-66`). A missing stored override falls back to
the shipped default in `accessCatalogue/defaults/` (`store.ts:33-40`).

**Reading a catalogue** is `getCatalogue(providerId, instanceId?)`. The three pure helpers
that operate on a document live in `resolver.ts`:

```ts
// accessCatalogue/resolver.ts:51-58
export function resolveCapabilities(doc, grantedIds, opts = {}): Set<string> {
  if (opts.structuralTier) return new Set(doc.capabilities.map((c) => c.id)); // ALL, incl. reserved
  return new Set(validateGrants(doc, grantedIds));                            // reserved dropped
}
```

with `grantableCapabilities` (`:11-16`, filters `!c.reserved`) and `validateGrants` (`:20-29`,
intersects the request with the inventory).

**The `club-app` capability list**, since you will read it most often:

```
app.club.view                       app.challenge.view
app.club.members.view               app.challenge.create
app.chat.view                       app.challenge.edit
app.chat.post                       app.challenge.delete
app.chat.post_image                 app.challenge.leaderboard.view
app.chat.pin                        app.deal.view
app.chat.moderate                   app.deal.create
app.club.header.set                 app.deal.edit
app.club.header.remove              app.deal.discuss
app.coaching.view          ← the "is this person a coach" pivot
app.coaching.learners.view          app.coaching.reviews.view
app.coaching.assignments.view       app.coaching.library.view
app.coaching.assignments.create
app.play.view                       app.learn.view
```

`app.coaching.view` is the single semantic pivot for coach-ness — see `platform.ts:1077` and
`platform.ts:1854-1861`.

## 5. Where access data actually lives

**This section will save you an afternoon.** Several things you would expect to be columns
are not.

| Concept | Where it lives | Not a column |
|---|---|---|
| `features` (on/off per platform) | `programs.metadata_json.features` | ✅ correct, no column |
| `feature_access` (the Partial envelope) | `programs.metadata_json.feature_access` | ✅ `grep feature_access migrations/` → **zero hits** |
| `platforms_open` | `programs.metadata_json.platforms_open` | ✅ |
| `is_partner`, `connected_program_id`, `slug` | `programs.metadata_json` | ✅ no FK on the parent link |
| Org-level envelope | `organizations.settings.capabilities.featureAccess` | ✅ |
| Catalogue documents | `platform_settings` k/v | ✅ no `access_catalogues` table |
| Club-app roles | `platform_settings` key `club_app_roles:<programId>` | ✅ |
| Bridge custom roles | `platform_settings` key `bridge_roles:<programId>` | ✅ |
| Program/org/nexus roles | `program_roles` table, `perms` jsonb | table exists |
| Fine capabilities on a role | `program_roles.perms.capabilities` | inside the jsonb |

Read/write helpers: `db/tenantRepo.ts:43` (read `feature_access` out of `metadata_json`),
`:203`, `:245` (write). Supabase path at `platformDb.ts:448-457`.

**The real tables that matter:**

| Table | Purpose | Notable columns |
|---|---|---|
| `organizations` | tenant | `settings jsonb` (holds the org envelope) |
| `programs` | program / partner club | `org_id`, `metadata_json jsonb` |
| `org_memberships` | who is in what | `org_id`, `profile_id`, `role`, `program_id` (nullable = org-level), `status` |
| `profiles` | people, **org-scoped** | `organization_id`, `auth_user_id`, `email` |
| `program_roles` | custom roles at any altitude | `organization_id` + `program_id` **both nullable** — both null = Nexus role, org set = org role, both set = program role |
| `program_role_assignments` | role holders, **email-keyed** | works before the account exists |
| `platform_role_assignments` | pre-built platform roles | `unique (program_id, platform, email)` |
| `learning_roles` / `_assignments` | Content Studio roles | `perms` includes `typeScopes` |
| `app_launch_tokens` | single-use handoff tickets | `token_hash`, `used_at`, `expires_at` |
| `program_organization_affiliations` | outside-org grants | `metadata_json.access.capabilities` |

**Membership roles.** The CHECK constraint has been rewritten four times. The final live
value set is `('owner','administrator','instructor','learner')` —
`migrations/0027_learner_membership.sql:8-10`.

> **Bug to be aware of:** `0026_scoped_roles.sql:19-21` adds `'member'` for org-level plain
> members, and `0027_learner_membership.sql` — which sorts *after* it and is replayed on every
> run — drops it again. Nothing restores it. An org-level `'member'` insert violates the check
> on a freshly migrated database. See §18 for why replay order decides this.

> **`instructor` does not mean teacher.** Every club enroll path writes `instructor` as the
> low-privilege base value (`platform.ts:1808-1817`). Treating it as coach-ness put every
> member of B2F3 into the coach view. Coach-ness is `app.coaching.view` or a `bridge_coach`
> platform role — never membership. `bridge-role.ts:43-53` in the mobile app carries the same
> warning.

## 6. `resolvePlatformAccess` — identity and scope

`TheNexusPlatform/backend-ts/src/platformAccess.ts:196-363`. This is the function to
understand first; everything platform-facing goes through it.

```ts
export async function resolvePlatformAccess(
  user: PlatformUser,
  area: ProgramFeatureKey,          // "learning" | "bridge" | "clubapp" | ...
  programId?: string | null,
): Promise<ResolvedPlatformAccess>
```

Returns (`:32-66`):

```ts
{
  profileId,                 // org-scoped profiles.id — the canonical nexusUserId
  orgId, programId,          // programId = the DATA scope
  programName,
  level,                     // "view" | "comment" | "edit" | "admin"
  platformRole, roleName,
  partnerClub?, partnerProgramId?, partnerProgramName?,
  programRoleCapabilities,   // string[] | null
}
```

### The partner-club branch — the single most important detail

`platformAccess.ts:260-290`. When the resolved program is a partner club:

```
   programId        = the CONNECTED PARENT program   ← data scope
   partnerProgramId = the CLUB itself                ← ownership scope
   level            = "edit"                         ← HARDCODED for every club member
```

Consequences you must internalise:

- **The idiom for "which program owns this thing" is `access.partnerProgramId ?? access.programId`.**
  Using `programId` alone files a club's work under the parent, where every club sees it.
  This is exactly the challenge-leak class of bug.
- **The feature must be enabled on both the club and the parent** (`:268`, `:271-272`).
- **`level` is `"edit"` for everyone in a club**, including its administrators. A club admin
  can therefore never reach `level === "admin"`, which is why `_clubStructuralTier`
  (`platform.ts:2478-2487`) exists — club-admin authority is judged on *membership*, not level.
- **`programRoleCapabilities` here comes from the club's feature_access envelope**, not from a
  role. It is the one place provisioning doubles as a grant.

There is exactly **one hop** — `partner.connected_program_id → connected program`. Partner-of-
partner is not resolved. Do not assume a recursive walk.

### Terminal errors (`:358-362`)

`404 "Program not found"` → `403 "This feature is not enabled for the program"` →
`403 "Your role does not grant access to this platform"`. A `platform_admin` is refused
outright at `:202-204` — Nexus operators cannot enter an organization's platforms.

## 7. The grant ladder

`_grantLevel` — `platformAccess.ts:371-467`. Evaluated in this exact order:

| # | Condition | Result |
|---|---|---|
| 1 | `platformsLocked = isPlatformArea && program.platforms_open === false` | computed first |
| 2 | program-scoped `owner`/`administrator` | `admin`, **unless locked → null** |
| 3 | org-level `owner`/`administrator` (`!m.program_id`) | `admin` iff `getOrgCapabilities(orgId).adminsEnterPrograms !== false`. **Bypasses the per-program lock.** |
| 4 | anyone else, `platformsLocked` | `null` |
| 5 | no DB / no email | `null` |
| 6 | `platform_role_assignments` row matching `cfg.prebuilt` | `{ level: cfg.level[assigned], platformRole: assigned }` |
| 7 | bridge only: assigned id resolves to a **custom** bridge role | `{ level: "edit", platformRole: assigned }` |
| 8 | program role `perms[area]`: pre-built key / `administrator` / `partial` / `view\|comment\|edit` | corresponding level, carrying `perms.capabilities` |
| 9 | learning fallbacks: a `learning_roles` row; **or a `bridge_coach` assignment grants learning as `coach`** | `edit` or `view` |
| 10 | else | `null` |

Rule 9's second clause is easy to miss and explains "why does this bridge coach have Content
Studio access?" — because they do, by design.

### Pre-built role tables

```
BRIDGE_PREBUILT_ROLES   bridge_program_admin, bridge_org_admin, bridge_club_admin,
                        bridge_coach, bridge_reviewer, bridge_fellow,
                        bridge_learner, bridge_guest        (platformAccess.ts:72-81)
BRIDGE_ROLE_LEVEL       *_admin → admin; coach|fellow → edit;
                        reviewer → comment; learner|guest → view      (:84-93)
LEARNING_PREBUILT_ROLES administrator, content-developer, course-reviewer,
                        object-reviewer, coach, student               (:113-120)
PLATFORM_ROLES          bridge{...}, club-app{ ALL EMPTY — no pre-built roles by design },
                        learning{...}                                 (:145-169)
```

`bridge_club_member` is emitted at `/bridge/context` (`platform.ts:1157`) but is **not** in
`BRIDGE_PREBUILT_ROLES` — it is an outbound-only label. Do not try to assign it.

## 8. The provisioning ceiling

`TheNexusPlatform/backend-ts/src/accessCatalogue/provisioning.ts` (145 lines). Read the whole
file; it is short and it is the conceptual heart of the system. Its header states the rule:

> What an ORG provisioned for a program is the CEILING on what that program's roles can
> grant. Roles distribute authority within the ceiling; they cannot raise it.

### The two signals

```
features[key] === false                  → HARD DENIAL. No capability of that platform survives.
feature_access[key].capabilities         → the "Partial" envelope. Present and non-empty = "only these".
                                           ABSENT = no restriction recorded.
```

```ts
// provisioning.ts:45-49 — null means unrestricted, never []
function envelope(entry: CapsEntry): string[] | null {
  const caps = entry?.capabilities;
  return caps && caps.length ? caps : null;
}
```

`[]` is deliberately coerced to "unrestricted" because `[]` is truthy in JS and one stray
writer storing an empty array would silently revoke a whole club. The API cannot store one
anyway — `_sanitizeFeatureAccess` (`platform.ts:2901-2912`) drops a key whose validated list
is empty. So **Full and Off both arrive with the key missing**, and are distinguished by
`features[key]`.

### The three-state encoding, end to end

| UI setting | `features[key]` | `feature_access[key]` |
|---|---|---|
| No access | `false` | absent |
| Partial | `true` | `{ capabilities: [...] }` |
| Full access | `true` | absent |

Console side: `platform_logic/src/nexus/access/FeatureAccess.tsx:59-60` derives the level,
`:68-77` sets it (Partial seeds **every** grantable capability on, so the admin trims down),
`:84-95` auto-transitions the level as individual capabilities are toggled.

### The clamp

```ts
// provisioning.ts:66-78 — program ∩ org; either being absent restricts nothing
const allowedFor = (key: string): Set<string> | null => {
  const prog = envelope(featureAccess[key]);
  const org  = envelope(orgAccess[key]);
  if (prog && org) return new Set(prog.filter((c) => org.includes(c)));
  if (prog) return new Set(prog);
  if (org)  return new Set(org);
  return null;
};
```

```ts
// provisioning.ts:84-94
return capabilities.filter((id) => {
  for (const key of Object.keys(FEATURE_ACCESS_PROVIDER)) {
    if (platformCapSets[key].has(id)) {
      if (enabled[key] === false) return false;          // disabled platform grants nothing
      const allowed = platformAllowed[key];
      return allowed ? allowed.has(id) : true;
    }
  }
  return true;                                            // not a platform capability → untouched
});
```

Notes that matter:

- Membership is decided against `grantableCapabilities(...)`, so **reserved ids are not in
  `platformCapSets` and fall through to `return true` — they are never clamped.**
- Console/org capability ids pass through untouched.
- An **empty intersection** (two non-empty, disjoint envelopes) yields an empty Set, which
  *is* total denial. That is the only place an empty set means denial, and it can only arise
  from two non-empty envelopes.

### Failure-tolerance, by design

```ts
// provisioning.ts:106-113 — a program that cannot be loaded imposes NO restriction
if (!program) return capabilities;
```

```ts
// provisioning.ts:136-145 — unknown program → no ceiling
if (!program) return { enabled: true, capabilities: null };
```

"A transient database hiccup must not read as 'the org provisioned nothing'." Preserve this
property in anything you add.

### Where the clamp is applied

| Site | File |
|---|---|
| club-app access resolution | `appRoles.ts:195-204` — `appAccessUnclamped` is module-private **by design**; there is no unclamped export |
| learning effective set | `platform.ts:2445-2448`, clamping against `partnerProgramId ?? programId`, **deliberately outside the try/catch** (`:2437-2444`) |
| `/club-app/context` ceiling | `platform.ts:1824-1828`, with `.catch(() => ({enabled:true, capabilities:null}))` |
| `/bridge/context` ceiling | `platform.ts:1047` |
| role authoring | `routes/offerings.ts:975-982` — a role literally cannot be saved above the ceiling |

> **Known divergence.** `appProvisioning` (`provisioning.ts:136-145`) reads **only the
> program's** envelope; it does not intersect the org's, unlike `clampCapsToProvisioning`.
> An org-level restriction on `clubapp` therefore does not reach the mobile app's ceiling.
> Documented for administrators in the admin guide §6. Fixing it means threading
> `getOrgCapabilities` into `appProvisioning`; it is a small change with a wide blast radius,
> so it wants a deliberate decision rather than a drive-by.

## 9. `capabilitiesFor` and `requireCapability`

`accessCatalogue/enforce.ts`.

```ts
// enforce.ts:69-73
export async function capabilitiesFor(user, scope): Promise<Set<string>> {
  // structural tier → every capability in the catalogue (incl. reserved)
  // otherwise → validated grants from the role store
}

// enforce.ts:75-85
export async function requireCapability(user, scope, capability): Promise<void> {
  const caps = await capabilitiesFor(user, scope);
  if (caps.size === 0) return;                    // ← THE ESCAPE HATCH
  if (!caps.has(capability)) throw new HttpError(403, `Missing capability: ${capability}`);
}
```

**`if (caps.size === 0) return;` is the single most important line in the file.** An account
with no fine-grained grants is a legacy coarse-only account, and is governed by the coarse
guard that ran before this call — not locked out. The design doc's pseudocode
(`NEXUS_UPDATES_AND_ACCESS_ENFORCEMENT.md:132-138`) 403s unconditionally; the implementation
does not. **Never call `requireCapability` as your only guard.** It is always the *second*
gate, layered after a coarse check.

The same contract is hand-rolled with an explicit coarse fallback at `offerings.ts:1275-1282`
(club header), `:1313-1320` (chat clear), and expressed as `eff.fineGrained` in
`_requireLearningCap` (`platform.ts:2199-2213`).

**Structural tier tests exist in three near-identical implementations** — `enforce.ts:29-42`,
`_clubAppActor` (`platform.ts:1758-1786`), `_clubStructuralTier` (`platform.ts:2478-2487`).
They are not quite interchangeable. Read the one you are near before assuming.

**Role → capability resolution happens at five sites.** Know which one governs your change:

| # | Site | Governs |
|---|---|---|
| 1 | `resolver.ts:51-58` | the pure kernel |
| 2 | `enforce.ts:69-73` `capabilitiesFor` | console + generic scopes |
| 3 | `appRoles.ts:132-186` `appAccessUnclamped` | the club-app ladder |
| 4 | `bridgeRoles.ts:117-135` | bridge levels + custom roles |
| 5 | `platform.ts:2394-2456` `_learningEffective` | Content Studio |

The club-app ladder (#3) has a step worth knowing: `areaLevel === "administrator"` grants the
whole catalogue while keeping the role's own name (`appRoles.ts:158-160`). That is the B2F3
Mentor fix — the console's role builder stores `{clubapp: "administrator", capabilities: []}`,
and without this step the empty array would have read as "nothing".

**Known gap:** `instanceFor` returns `null` for `club-app` (`enforce.ts:62-66`), so
per-program club-app catalogue overrides are not consulted by `capabilitiesFor`.

## 10. Launch tokens and session handoff

**The token carries identity and nothing else.**

```ts
// db/schema.ts:338-346
app_launch_tokens: { id, token_hash, registered_app_id, user_id, expires_at, used_at, created_at }
```

No roles, no capabilities, no org, no program. It is a bearer pointer to a person.

- **TTL: 60 seconds**, hardcoded everywhere (`platformDb.ts:1797`, `tenantRepo.ts:767`,
  `orgGraphRepo.ts:1939`). No caller passes a custom TTL.
- **Single use.** `consumeLaunchToken` rejects a used or expired row and atomically stamps
  `used_at` (`platformDb.ts:1821-1839`).
- **Only the hash is stored.** The raw token exists only in the mint response.
- **The stored identity is the org-scoped `profiles.id`**, not the auth id
  (`tenantRepo.ts:770-772`).

**Minting** — three endpoints, all in `routes/offerings.ts`:

| Endpoint | Line | Guards |
|---|---|---|
| `GET /apps/:app_id/launch-context` | 437 | org member + module entitlement |
| `POST /programs/:id/learning-platform/launch` | 1921 | org member or learner, `features.learning`, `checkModuleAccess(org,"learning")` |
| `POST /programs/:id/bridge-platform/launch` | 1974 | org member or learner, `features.bridge` (no org module gate, deliberately) |

**Exchange** — `POST /auth/launch-exchange` (`platform.ts:612-615`), no session required.
`exchangeLaunchToken` (`auth.ts:368-391`) consumes the token, then mints a real session via an
admin-generated magic link. Design note at `auth.ts:336-342`: *"Deliberately simple — no
OAuth/PKCE: the token was already tied to a user_id at issuance."*

**All authorization happens after the exchange**, at the `/context` call. The token grants
nothing.

**Cookie handling on the Bridge side** — `apps/bridge-web/app/nexus/launch/route.ts`:
`httpOnly`, `secure` in production, `sameSite: "none"` + `partitioned: true` (CHIPS) when
launched embedded, `"lax"` otherwise (`:79-87`). `?next` is accepted only if it
`startsWith("/") && !startsWith("//")` (`:64-66`).

**A consumed token cannot be reused**, so any webview reload after the exchange lands with no
token. The mobile app mints fresh per mount for exactly this reason
(`lib/launch-cache.ts:54-73` consumes its cache entry before validating it).

---

# Part III — Enforcement, surface by surface

## 11. Nexus backend

**This is the only place enforcement is authoritative.** Everything else is UX.

### The three context endpoints

| Endpoint | Line | Resolution |
|---|---|---|
| `GET /bridge/context?program_id=` | `platform.ts:953` | `resolvePlatformAccess(user,"bridge")`; capability computation wrapped in try/catch → empty set on failure (`:969-987`) |
| `GET /learning/context?program_id=` | `platform.ts:2005` | `resolvePlatformAccess(...,"learning")` **plus** `db.checkModuleAccess(orgId,"learning")` → 403 |
| `GET /club-app/context?program_id=` | `platform.ts:1788` | `_clubAppActor` — **deliberately not** `resolvePlatformAccess` (`:1751-1758`): a club's roles/members/chat belong to the club, and a club may legitimately have `bridge` off |

`/bridge/context` emits extension fields the Bridge Platform reads:
`nexus_club_program_id`, `nexus_app_capabilities`, `nexus_app_enabled`,
`nexus_app_provisioned_capabilities` (`platform.ts:1129-1133`).

### `GET /me/capabilities?provider=&org=&program=`

`platform.ts:3989`. The platform-agnostic resolver endpoint the design doc specifies — though
with a different signature than
`NEXUS_UPDATES_AND_ACCESS_ENFORCEMENT.md:164-171` proposed. Any authenticated caller; 400
unless `provider` is a valid `ProviderId`.

### Fine-grained enforcement call sites

Outside `platform.ts`: `offerings.ts:199` (`program.offerings.create`), `:1276`/`:1281` (club
header set/remove), `:1314-1319` (chat moderate), `:1345`/`:1346` (chat post / post image —
**separate grants**), `:1355` (chat pin).

Learning, in `platform.ts`: `:2127`/`:2256` (`object.edit`/`create`), `:2259`
(`publish.release`), `:2260` (`publish.audience`), `:2278` (publish route), `:2287`
(`object.delete`).

### Type scopes

`_requireLearningCap` (`platform.ts:2199-2213`) additionally checks `eff.typeScopes[capId]`
against the target's type; an absent or empty list means every type. **This is the only
resource-constrained check in the system**, and it exists only for Content Studio.

### RLS

Real, but defence-in-depth rather than the primary gate.

- The model: resolve the caller from a request-bound GUC, not `auth.uid()`
  (`migrations/0007_rls_context.sql:1-13`), and `SET LOCAL ROLE nexus_app` per request
  (`db/tenantDoor.ts:100-101`).
- `nexus_is_org_member_strict` (`0021:27-36`) has no platform-role bypass;
  `0021_people_isolation.sql` moved people tables onto it and dropped the legacy permissive
  policy that would otherwise OR the operator back in (`:49-51`).
- Each platform pack's `9000_nexus_hardening.sql` runs last and revokes `nexus_app`/`public`
  from its tables in favour of a dedicated service role.
- The service-role key is still configured (`config.ts:66`) and that path **bypasses RLS** —
  which is precisely why route guards are the primary enforcement.

## 12. Bridge Platform

`Applications/BridgePlatform/apps/bridge-web`. Next 15 App Router, **no `middleware.ts`** —
all enforcement is in layouts, pages, server actions and route handlers.

### Three distinct authority vocabularies

This is the thing to internalise about this codebase. They are not interchangeable:

| Vocabulary | Checked by | Reads |
|---|---|---|
| **roles** | `canUse(context, key)` — `lib/access.ts:62-64` | `context.roles` only |
| **permissions** | `canEditCatalogue`, `requireAdminContext`, `requirePermission` | `context.permissions` |
| **capabilities** | `hasAnyCapability`, the library component | `context.capabilities` |

```ts
// lib/access.ts:62-64
export async function canUse(context: NexusBridgeContext, key: string): Promise<boolean> {
  return canAccess(await getCatalogue(), key, context.roles);
}
```

### Unknown keys fail OPEN

```ts
// packages/bridge-access/src/index.ts:474-483
const isKnown = FEATURE_BY_KEY.has(key) || Boolean(catalogue?.rules[key]);
if (!isKnown) return true;          // a typo must not brick a page
```

**A typo in a capability key silently disables the gate.** When adding a gate, verify the key
exists in the registry (`packages/bridge-access/src/index.ts:63-432`, 43 features).

Likewise the catalogue read is **fail-open**: a store throw logs and serves
`defaultCatalogue()` (`access.ts:47-52`).

### `AccessError` renders as 404, never 403

```ts
// lib/api.ts:28-35
if (e instanceof UnauthenticatedError) return json({ error: "unauthenticated" }, 401);
if (e instanceof AccessError)          return json({ error: "Not found" },      404);
return json({ error: message }, 400);
```

**The message is swallowed.** `"Only the person who created a challenge can delete it"` never
reaches the client. The 401/404 split is deliberate and was a bug fix (`api.ts:12-19`):
rendering an expired token as 404 turned hour-old sessions into permanent "Not found" boards,
and the app's bearer client only refreshes-and-retries on 401.

`requireFeature` uses Next's `notFound()` rather than throwing, because an `AccessError`
thrown from a server component escapes as a 500 (`access.ts:66-71`).

### The club second gate

`canCreateChallenge` (`access.ts:81-148`) is the pattern for club-aware checks. Order:

1. `canUse(context, "challenge.create")` — platform catalogue. False ⇒ deny.
2. Not a club caller (`nexus_club_program_id` absent) ⇒ **allow**.
3. `withinAppProvisioning(context, "app.challenge.create")` — the org ceiling. False ⇒ deny.
4. `appCaps.length === 0` ⇒ **silence ≠ denial**: fall back to `roles.includes("bridge_coach")`.
5. Else `appCaps.includes("app.challenge.create")`.

### Club scoping — the challenge-leak fix

```ts
// lib/challenges.ts:89-91
export function challengeOwnerScope(context): string | null {
  return nexusClubProgramId(context) ?? nexusProgramId(context);
}
```

The club id **never comes from the `x-program-id` header directly** (`challenges.ts:81-84`):
Nexus emits `nexus_club_program_id` only after `resolvePlatformAccess` verified membership, so
the header cannot be used to plant a challenge in someone else's club.
`requireChallengeOwnerScope` (`:102-110`) **throws** when no scope resolves, because a null
owner is a read-side wildcard.

```ts
// packages/bridge-challenges/src/types.ts:109-123
export function challengeVisibleInScope(challenge, scope) {
  if (challenge.scopeLevel === "user") return !scope;   // private tables never on a club list
  if (!scope) return true;
  const owner = challenge.nexusProgramId;
  return !owner || owner === scope;                     // legacy null = fail-open wildcard
}
```

**`listChallengesForUser(userId, scope?)` takes scope positionally and it is part of the
`cache()` memo key** (`lib/challenges.ts:120-123`) — reading the context inside would memoize
one club's answer and serve it to the next caller. If you add a scoped cached read, follow
this pattern.

Sessions, plays, assignments and library all carry the same two-field scope:
`{ programOrganizationId, nexusProgramId }`.

### Authority narrower than any capability

Worth cataloguing, because these are invisible from the capability list alone:

| Action | Authority |
|---|---|
| Delete a challenge | **creator only** (`[challengeId]/route.ts:64-66`); missing challenge ⇒ 200 idempotent |
| Archive a challenge | creator **or** moderator |
| Respond to an invite | you must own the invite row |
| Create an assignment | `isBridgeCoach` |
| Start an assignment | the assigned learner only |
| Edit an assignment | **creatorship, never reviewership** (`view.ts:157`) |
| Delete / replay / send a play; discard a session | creator only |
| Comment on a review | learner or coach only — **admins excluded** |
| Learner progress | `isBridgeCoach` **and** on your roster |
| `challenges/people` | `canUse("page.challenges")` **and** `canCreateChallenge` — narrower than the page |

### The coach AI routes

`ben-read`, `ben-tell`, `play-hint`, `play-hints`, `play-why`, `takeaway-line`, `event-qa` take
**only a sessionId**; the seat is derived server-side by matching
`record.seats[*].nexusUserId === context.nexusUserId` (`play-hint/route.ts:37-55`). Accepting a
hand from the browser would let anyone ask BEN to read a hand they cannot see. Preserve this
shape.

## 13. Content Studio

`Components/laic-learning-platform`. Read this section before touching it.

> **Every capability gate in the Studio is cosmetic.** They decide which sidebar rows are
> drawn and which boot `?screen=` is honoured. `navigate(screenId)` from any code path reaches
> `ScreenRouter` (`Layout.tsx:76`) unguarded. The safety net is that **Nexus rejects the
> resulting write.**

Exactly three client-side checks exist:

1. `App.tsx:539` — `canAccessScreen(caps, wanted)` for the boot `?screen=` param.
   **`isAdmin` short-circuits it entirely.**
2. `Sidebar.tsx:126-128` — which nav rows exist. Outside `nexusMode` it falls back to a static
   `NAV[role]` table, ignoring capabilities completely.
3. `Layout.tsx:13-14` + `learningAreas.ts:214-220` — an amber "View only" banner that
   **disables nothing**.

Not checked client-side at all: `object.create`, `object.edit`, `publish.release`,
`publish.version`, `object.delete`, `object.read`.

### Launch failure does not fall back to a demo user

`App.tsx:565-579`: if the boot arrived **with** a `launch_token` and the exchange or context
fetch failed, the app shows a launch-failed screen and stops. Only a visit with **no** token
reaches the demo restore (`:580-592`). Preserve this — a launched session silently becoming
`riya` is worse than an error, because everything afterwards is wrong in ways that look like
bugs elsewhere.

`LoginPortal.tsx:23-24` still prefills `1@gmail.com` / `123456` and offers one-click persona
buttons that call `login(user.id)` with no password. That is client-only state; a demo login
yields no Nexus token, so `supabaseEnabled()` is false and `publishObject` throws
(`supabase.ts:204`). It is not an authentication bypass into real data — but it should not be
in a production bundle.

### `embed=1` vs `ui=mobile`

| Mode | Effect |
|---|---|
| `embed=1` | `Layout.tsx:187-195` early-returns **only** `<main>` + `ScreenRouter`. No sidebar, no topbar, no banners. Also applies the app's cream/ink skin. |
| `ui=mobile` | Keeps **all** chrome; swaps the 224px sidebar for a drawer. |

The mobile app's `+` uses `embed=1` with `screen=club-compose`
(`Applications/bridge-coach-app/app/studio.tsx`). `club-compose` is deliberately absent from
the nav catalogue (`Layout.tsx:94-97`) — it is reached from the app only, and a sidebar entry
would be a second way in with different rules.

### The club compose flow

`src/lib/clubComposeBridge.ts` is a module-level singleton, not context: the compose screen
registers a publisher on mount and clears it on unmount; the real creators call
`composePublisher()` and, if non-null, hand over the saved object id instead of running their
own folder dialog.

**Club scoping is not done by this screen at all.** The row goes through `publishObject`
(`supabase.ts:196-216`) → `POST /api/platform/learning/objects/publish` with the bearer token
and the stored `program_id`; **Nexus decides the club.** `nexusClubName` is display copy only.

### ⚠️ The unauthenticated service-role routes

`server/index.mjs` holds `NEXUS_SUPABASE_SERVICE_ROLE_KEY` (`:1110-1126`) and sends it as both
`apikey` and `Authorization: Bearer` on every PostgREST call. **Service role bypasses RLS by
definition.**

Four routes, **none authenticated** — `handler` (`:4212`) never reads
`req.headers.authorization`; there is no middleware and no token verification. Scoping is
`organization_id = eq.${LEARNING_ORG_ID}` — an environment constant, not the caller. CORS is
`*` with `GET,POST,PATCH,PUT,DELETE,OPTIONS` (`:52-56`).

| Route | Line | Effect |
|---|---|---|
| `GET /api/learning/objects` | 4304 | dumps every row in the org, drafts included |
| `POST /api/learning/publish` | 4348 | upsert; caller chooses `owner_id`, `program_id`, `status`, `version_number` |
| `POST /api/learning/unpublish` | 4319 | unpublishes any id in the org |
| `DELETE /api/learning/objects/:id` | 4335 | hard delete of any row in the org |

**The SPA no longer calls them.** `src/lib/supabase.ts:181-243` routes all four through Nexus
with the session bearer, and its header comment documents exactly this hole. The client
wrappers in `src/lib/api.ts:451-480` are dead code with no importers. **The server routes were
never removed**, and they are publicly reachable on the API deployment.

**Remediation, in order:** delete the four handlers; then rotate
`NEXUS_SUPABASE_SERVICE_ROLE_KEY` out of that deployment. Deleting without rotating leaves a
live key in an environment that no longer needs it; rotating without deleting breaks nothing
but leaves the shape. Do both. This is the highest-priority item in §20.

### Type scopes are authored but not enforced

`accessPolicy.ts:101-157` models `TypeScopeMap`, `AdminPeopleRoles.tsx` authors it, and it
round-trips to Nexus as `type_scopes`. **Nothing in the Studio consults it at runtime** — the
`/learning/context` response exposes only `capabilities: string[]`, so the scopes never reach
the client. A role scoped to "flashcards only" can drive the tutorial creator; whether the
write is refused depends entirely on `_requireLearningCap` (`platform.ts:2199-2213`), which
does enforce it server-side.

## 14. Bridge Bird mobile app

`Applications/bridge-coach-app`. Client-side gating only — every gate here is UX, and the
server is the gate.

### The capability check

```ts
// lib/bridge-role.ts:231-242
export function can(context, capability, fallback = false): boolean {
  if (!context) return fallback;
  if (!withinProvisioning(context, capability)) return false;   // the ceiling, FIRST
  if (isCoach(context)) return true;                            // structural bypass
  const caps = capabilitiesOf(context);
  if (caps.size === 0) return fallback;                         // silence ≠ denial
  return caps.has(capability);
}
```

The ordering mirrors the server's, and the `fallback` parameter is the client's version of the
"legacy coarse account" escape hatch. `withinProvisioning` (`:206-213`) applies only to `app.*`
ids; `app_enabled === false` denies; an empty `provisioned_capabilities` is **unrestricted**.

The ceiling travels to the client **as its own fact** (`nexus_app_enabled`,
`nexus_app_provisioned_capabilities`) precisely because `can()` lets structural admins through
before consulting capabilities. Two questions kept apart: *did the org give this club the
feature* vs *does this person's role grant it*. See `provisioning.ts:116-135`.

### Coach-ness

`isCoach` (`bridge-role.ts:250-276`), in strict order: a bare `BridgeContext` → roles;
membership role ∈ `{owner, administrator}` — **`instructor`/`teacher` deliberately excluded**;
only when there is *no* membership, `profiles.role` ∈ `{org_admin, platform_admin}`; finally
`is_admin || roles.includes("bridge_coach") || roles.includes("bridge_program_admin")`.
`accessLevel` is explicitly not trusted (`:278-285`).

Coach-ness is **per club** — `useIsCoach()` asks `getRoleContext(token, clubId ?? undefined)`.

### Caching discipline — the `settle` pattern

```ts
// lib/bridge-role.ts:107-114
const answered = e instanceof NexusError && e.status >= 400 && e.status < 500;
```

A 4xx is an **answer** (403 = "no bridge grant", by design); a 0 or 5xx is a hiccup. Only an
answered result is cached (`:159`) — a network blip must not pin the learner view for the
whole session. Cache keys are composite: `` `${token}::${programId ?? ""}` ``.

### Club scoping

A "club" is a partner program: `isClubMembership(m) = !!m.program_id && m.program_category === "partner"`
(`bridge-role.ts:398-400`). `useSelectedClubId()` threads into `getAppContext`, `takeLaunch`,
`bridgeRequest`'s `x-program-id`, `getLearningObjects`, `refreshSummary`, `useIsCoach`.

**Selection is session-only and never persisted** (`club-context.tsx:11-13`).

### Two catalogues, deliberately

`useCan(...)` answers `app.*` (club-app catalogue). `canAuthorLearning(ctx)`
(`lib/learning.ts:155-160`) answers the Content Studio catalogue — `learning.object.create` or
`learning.composition.create`, with **no** fallback-to-old-behaviour, because the app never
offered authoring before.

### Screen → capability map

| Screen | Capability | Fallback |
|---|---|---|
| Club: Chat button | `app.chat.view` | `true` |
| Club: `+` → Challenge | `app.challenge.create` | `true` |
| Club: Challenges button | `app.challenge.view` | `true` |
| Club: Members pill | `app.club.members.view` | `true` |
| Club: `+` → content | `canAuthorLearning(...)` | `false` |
| Club challenges: New | `app.challenge.create` | `useIsCoach()` |
| Club challenges: leaderboard | `app.challenge.leaderboard.view` | `true` |
| Club chat: composer / image / pin | `app.chat.post` / `.post_image` / `.pin` | `true` |
| Practice deals: create / discuss | `app.deal.create` / `.discuss` | `useIsCoach()` / `true` |
| Menu → Other → Learners / Assignments / Reviews / Library | `app.coaching.*.view` | `useIsCoach()` |
| Menu → club banner set / remove | `app.club.header.set` / `.remove` | `useIsCoach()` |
| Menu → clear chat | `app.chat.moderate` | `useIsCoach()` |

### ⚠️ A live gating defect

`components/menu-sheet.tsx:35,152` calls `can(context, ...)` where `context = useRoleContext()`
— the **un-club-scoped** context. `getRoleContext` always sets `app: null`
(`bridge-role.ts:155`), so `capabilitiesOf(context).size === 0` **always**,
`withinProvisioning` short-circuits true, and `can()` returns the fallback — `coach` — for all
nine capabilities in that sheet.

**Net effect:** the entire Coaching + Club-management capability catalogue in the menu
currently degrades to a plain `isCoach` boolean, and the fine-grained ids are never consulted.

**The fix** is to use the club-scoped context as `useCan` does via `useClubScopedContext`
(`use-can.ts:68-100`) — note that hook is currently **not exported**. Export it, or add a
`useCanMany` helper. This is a UX-only defect (the server still enforces), which is why it has
survived, but it makes the club-app role system look broken to anyone testing it.

### Things that fail silently

Non-exhaustive; the pattern is `.catch(() => [])` and it is used deliberately in places and
carelessly in others.

| Location | Swallowed |
|---|---|
| `auth-context.tsx:83-84` | any refresh error → `null` |
| `auth-context.tsx:102` | the whole sign-in cache prime |
| `club-context.tsx:86` | role-context failure → `clubs = []`, indistinguishable from "no clubs" |
| `learning.ts:132-137` | learning context failure → `null` **and cached**, so `canAuthorLearning` stays false with no message |
| `app/(tabs)/club.tsx:504` | the club's authored content silently empties |
| `challenges.ts:266/313/361/406` | `x-program-id` **omitted** when programId is null — contrast `bridge-api.ts:65-69`, which refuses to travel without one |

`clearLearningContext()` (`learning.ts:142`) exists but is **not called from `signOut`**. It
is keyed by `token::club` so it cannot be served to another user, but it is a leak of the
previous session's answer in memory. Worth fixing while you are nearby.

## 15. Console

`TheNexusPlatform/platform_logic` is the **live** console (`src/main.tsx:2` renders
`NexusApp`). `TheNexusPlatform/src` is a different app entirely — the owl/LAIC learner
prototype — not a stale copy of the console. Do not "reconcile" them.

Key files:

| File | Purpose |
|---|---|
| `src/nexus/access/FeatureAccess.tsx` | the Full/Partial/No-access control (§8) |
| `src/nexus/routes/program.tsx:1284` | `ProgramPartners` — the club list |
| `src/nexus/routes/Programs.tsx:1097` | `EditFeaturesDialog` |
| `src/nexus/people/RolesAndGroups.tsx` | the modern role builder |
| `src/nexus/people/adapters.ts` | per-altitude adapters; `:131-143` clamps the builder to the provisioned subset |
| `src/nexus/access/AccessCatalogue.tsx` | operator catalogue editor |
| `src/nexus/access/InstanceAccessCatalogue.tsx` | org- and program-scoped editors |

A **legacy role builder** still lives at `ProgramTeam.tsx:1325-1460` — area/level only, saves
**without** `capabilities`. If ticked capabilities are not persisting, that is usually why.

---

# Part IV — Working on it

## 16. Invariants — the rules that are easy to break

Treat these as tests you run in your head before opening a PR.

1. **Absent is not denial.** An empty capability list is unrestricted. Never write
   `if (!caps.length) deny()`.
2. **A failure is not a revocation.** Unreachable program, catalogue read error, network
   blip → unrestricted, not denied. `provisioning.ts:106-113`.
3. **An empty envelope is never stored.** `_sanitizeFeatureAccess` drops it. Don't add a
   writer that bypasses this.
4. **Ownership is `partnerProgramId ?? programId`.** Using `programId` alone for a club files
   work under the parent. This is the leak.
5. **`requireCapability` is never the only guard.** It returns early on an empty set. Layer it
   after a coarse check.
6. **`instructor` is not a coach.** Coach-ness is `app.coaching.view` / `bridge_coach`.
7. **A club admin never has `level === "admin"`.** Use `_clubStructuralTier`.
8. **The client's `can()` hides buttons; it is not a gate.** Every mutating endpoint must
   check server-side.
9. **Unknown bridge capability keys fail open.** Verify a new key is in the registry.
10. **Scoped reads must take scope as an argument**, not read it from context, if they are
    memoized. `challenges.ts:120-123`.
11. **The migration runner has no ledger.** Every `.sql` must be idempotent and end-state.
12. **Never expose an unclamped access resolver.** `appAccessUnclamped` is private on purpose.

## 17. How to make common changes

### Add a capability to a catalogue

1. Add it to the shipped default in `backend-ts/src/accessCatalogue/defaults/<provider>.json`
   (or `.ts` for the consoles), with `id`, `label`, `group`.
2. Add it to a `groups[].capabilityIds` entry, or it will not appear in any picker.
3. If it should never be grantable to a role, set `reserved`.
4. If it unlocks a screen, add or update the `uiSurfaces[]` entry's
   `requiredAnyCapabilities`.
5. Deploy the backend. **A stored override wins over the default**, so if an operator has
   edited that catalogue, the new capability will not appear until the override is updated or
   reset (`DELETE /catalogues/:id`).
6. Only now can an administrator tick it.

### Gate a new mutating endpoint (Nexus)

```ts
// 1. coarse first
const access = await resolvePlatformAccess(user, "clubapp", programId);
// 2. then fine
await requireCapability(user, { providerId: "club-app", programId }, "app.thing.do");
```

Never step 2 alone.

### Gate a screen in the mobile app

```tsx
const canDo = useCan("app.thing.do", /* fallback */ true);
```

Choose the fallback deliberately: `true` preserves behaviour for legacy coarse accounts
(right for something the app always offered); `false` is right for a genuinely new surface.
`canAuthorLearning` uses `false` for exactly that reason.

### Gate a page in the Bridge Platform

```ts
const context = await requireContext();
await requireFeature(context, "page.thing");   // notFound() on failure
```

Add `"page.thing"` to `packages/bridge-access/src/index.ts` **first**, or the gate silently
passes (§12).

### Add a provider

1. Extend `PROVIDER_IDS` (`types.ts:95-107`).
2. Add a default document to `defaults/` and wire it into `defaults/index.ts:12-25`.
3. Decide instance scoping in `enforce.ts:61-66` and `store.ts`.
4. If it should be bindable by a program role, add it to `_programRoleCatalogues`
   (`offerings.ts:956-961`) — **this list is a named constant because a missing provider
   silently dropped capabilities on save.**
5. If it needs a Full/Partial/Off control, add the key to `FEATURE_ACCESS_PROVIDER` in
   **both** `provisioning.ts:37-41` and `platform.ts:2894-2898`, and to
   `platform_logic/src/types/platform.ts:82-85`.

### Attribute orphaned content to a club

There is no UI. Hand the administrator a statement; credentials are not available locally
(§19). The shape, for learning objects:

```sql
update learning_objects set program_id = '<club program id>'
 where id = '<object id>' and program_id is null;
```

and for challenges, per `0029_challenge_scope.sql`:

```sql
update bridge_challenges
   set nexus_program_id = '<club program id>', scope_level = 'program'
 where nexus_program_id is null;
```

**Always constrain the `where`.** A blanket update attributes every orphan to one club.

## 18. Database and migrations

### Two trees, two runners, one ledger between them

| Tree | Runner | Ledger? |
|---|---|---|
| `TheNexusPlatform/backend-ts/migrations/` | `scripts/runMigrations.ts` | **No** |
| `Applications/BridgePlatform/db/migrations/` | `db/apply.mjs` (`pnpm db:apply`) | **Yes** — `bridge_migrations` |

### The Nexus runner replays everything, every time

```ts
// backend-ts/scripts/runMigrations.ts:62-75
for (const sqlPath of SQL_FILES) {
  await sql.unsafe(readFileSync(sqlPath, "utf-8"));
}
```

No ledger table, no applied/pending query, no skip list. Core files first (lexical), then each
platform pack (lexical). **Every file must be idempotent and must describe an end state**, not
a step in a history.

Two consequences:

- **"Pending" is not a meaningful state here.** A file committed to `migrations/` is *armed* —
  the next person to run `npm run migrate` for an unrelated reason applies it.
- **Lexical order decides collisions.** `0027_groups_vs_roles.sql` sorts before
  `0027_learner_membership.sql`, which is why the org-membership `'member'` value added by
  `0026` is lost (§5).

### `0005_client_read_and_realtime.sql` — armed but gated off

`migrations/platforms/learning/0005` would grant `select on learning_objects to authenticated`
and add a client-read RLS policy. **It is inert behind a runtime gate:**

```sql
if coalesce(current_setting('learning.enable_client_read', true), 'off')
     not in ('on','true','1') then
  raise notice '0005 skipped: ...'; return;
end if;
```

The gate exists *because* the runner has no ledger — a comment saying "not applied yet" cannot
stop a replay; a gate can.

**Why it stays off** (`0005:59-71`): the policy has **no `program_id` term**. It is org-wide,
from when one org meant one library. Content is now club-scoped, and the mobile app *prefers*
this direct Supabase path, falling back to the API only when it returns nothing
(`bridge-coach-app/lib/learning.ts:63-64`), filtering on `organization_id` alone
(`lib/learning-live.ts:108-117`). Turning it on would let the wider path front-run the
correctly-scoped one, and every signed-in member of the org would read every club's content.

There is also a structural limit worth understanding (`0005:73-79`): **RLS can see which clubs
a person belongs to, never which club they are currently looking at.** So this path can be
club-*bounded* but never club-*correct*. Enabling it properly needs a `program_id` arm in the
policy **and** a program filter on the app's query and realtime subscription.

To arm it deliberately: `alter database <db> set learning.enable_client_read = 'on';` then
migrate. Disabling later requires manually dropping the policy and grant.

Ordering note (`0005:80-87`): `9000` runs after and does `revoke all ... from public`. PUBLIC
is a distinct pseudo-role, so the `authenticated` grant survives. **If `9000` is ever changed
to revoke from `authenticated` too, this grant dies silently on the next migrate and the
client app goes empty with no error anywhere.**

### Bridge challenge tables are missing from the Nexus tree

`bridge_challenges`, `bridge_challenge_boards`, `bridge_challenge_invites` and
`bridge_challenge_plays` exist **only** in `Applications/BridgePlatform/db/migrations/0027_challenges.sql`.
A fresh environment built by `runMigrations.ts` gets `bridge_assignments`,
`bridge_play_submissions`, `bridge_library_collections` and `bridge_assignment_briefs` — but no
challenge tables at all. The club-scoping fix (`0029_challenge_scope.sql`) likewise lives only
in the Bridge tree, applied by a different runner with a different ledger.

`0029` performs **no backfill**, deliberately: *"NULL means UNSCOPED — visible to anyone
invited, wherever they are. The read path treats NULL as a wildcard, so the write path must
never produce one by accident."*

### Other schema hazards

- Number collisions: two `0027`s, two `0028`s, two `0029`s in the core chain.
- Numbering gap: `0041` and `0042` do not exist.
- One-off apply scripts (`scripts/apply0028Only.ts`, `applyBridge0019.ts`…) exist precisely
  because there is no ledger.
- `TheNexusPlatform/backend/supabase/*.sql` is the deprecated Python backend's tree. Not run.
  `0021`'s comment notes it left a stale non-strict policy behind.

## 19. Local development and testing

### Database credentials are not available locally

By design. The hosting provider's environment variables are write-only, so `vercel env pull`
returns empty values for every project. **Every migration, backfill and diagnostic query is
handed to an administrator to run in the database console.** Do not offer to apply them
yourself, and do not build tooling that assumes a local connection string.

Without `DATABASE_URL`/`SUPABASE_DB_URL`, `runMigrations.ts` exits 1 and the backend falls back
to local JSON storage — which is a usable dev mode, not a broken one.

### Store backends

Both the Bridge Platform and the Nexus backend select a store at runtime: Postgres when
configured, JSON files under `<cwd>/<dataDir()>` otherwise. The access catalogue, audit log and
challenge stores all follow this pattern. Local development runs on the JSON path.

### Typechecking

```bash
cd Applications/bridge-coach-app          && npx tsc --noEmit -p .   # expect 0
cd Components/laic-learning-platform      && ./node_modules/.bin/tsc --noEmit -p .
```

> The Content Studio holds at a **non-zero baseline of pre-existing errors**. Compare the
> count against the baseline; do not expect zero. A sudden *drop* is the tell that `tsc`
> bailed early on a syntax error — that has happened and it is confusing, because fewer errors
> looks like progress.

### Testing a permission change end to end

1. Set the provisioning in the console.
2. Set the role in **People → Roles & Groups** (not the legacy dialog).
3. Force-close and reopen the mobile app — capabilities are cached per session and refreshed
   on foreground (`use-can.ts:110-123`, mounted once at `app/(tabs)/_layout.tsx:53`).
4. Verify the negative case too: turn the capability **off** and confirm the surface
   disappears. A gate that never denies is indistinguishable from no gate — and given §12's
   fail-open behaviour on unknown keys, that is a real possibility.

### Deploy roots

Each project deploys from its own directory, not the repo root. The backend serves a
gitignored prebuilt bundle and **must** be rebuilt before deploying, or source changes
silently 404. Vite SPAs must be deployed with `--prod` or production environment variables are
not inlined — a symptom that presents as "couldn't reach the server" because the base URL
becomes `""` and fetches hit the SPA's own origin, returning HTML that `res.json()` chokes on.
Verify a deploy by grepping the served bundle for the expected hostname rather than trusting
the deploy log.

## 20. Known gaps, ranked

| # | Gap | Where | Severity |
|---|---|---|---|
| 1 | Four unauthenticated service-role routes can read, publish, unpublish and delete any learning object in the org | `laic-learning-platform/server/index.mjs:4304-4357` | **Critical.** Delete the handlers, then rotate the key. |
| 2 | Content Studio capability gates are entirely cosmetic | §13 | High — mitigated by Nexus-side enforcement, but any new Studio-side write path inherits no protection |
| 3 | `menu-sheet.tsx` uses the un-club-scoped context, collapsing nine capabilities to `isCoach` | `bridge-coach-app/components/menu-sheet.tsx:35,152` | Medium (UX only) |
| 4 | Bridge challenge tables absent from the Nexus migration tree | §18 | Medium — a fresh environment has no challenges |
| 5 | `org_memberships.role = 'member'` is unusable; `0027` drops what `0026` added | `migrations/0026`, `0027_learner_membership.sql` | Medium |
| 6 | `appProvisioning` ignores the org envelope | `provisioning.ts:136-145` | Medium |
| 7 | Unknown bridge capability keys fail open | `bridge-access/src/index.ts:479-480` | Medium — a typo disables a gate silently |
| 8 | Type scopes are authored and stored but enforced only in `_requireLearningCap` | §13 | Low-medium |
| 9 | `LoginPortal` ships prefilled demo credentials and no-password persona buttons | `LoginPortal.tsx:23-24,138` | Low (no real-data access) but should not ship |
| 10 | `instanceFor` returns null for `club-app`, so per-program overrides are ignored | `enforce.ts:62-66` | Low |
| 11 | `clearLearningContext()` never called on sign-out | `bridge-coach-app/lib/learning.ts:142` | Low |
| 12 | `getMyCoaches` and `getProgramCoaches` share a cache key | `bridge-web/lib/nexus.ts:185-248` | Low |
| 13 | Challenge audit verbs are cast through, not in the `AuditAction` union | `challenges/route.ts:161` and three others | Low |

## 21. File index

### Nexus backend — `TheNexusPlatform/backend-ts/src/`

| Path | What |
|---|---|
| `accessCatalogue/types.ts` | `PROVIDER_IDS`, document types |
| `accessCatalogue/store.ts` | catalogue read/write, default fallback |
| `accessCatalogue/resolver.ts` | the pure kernel: `resolveCapabilities`, `validateGrants` |
| `accessCatalogue/enforce.ts` | `capabilitiesFor`, `requireCapability`, `isStructuralTier` |
| **`accessCatalogue/provisioning.ts`** | **the ceiling — read this first** |
| `accessCatalogue/appRoles.ts` | club-app roles + `appAccessFor` |
| `accessCatalogue/bridgeRoles.ts` | bridge custom roles + level mapping |
| `accessCatalogue/defaults/` | the seven shipped catalogues |
| **`platformAccess.ts`** | **`resolvePlatformAccess`, `_grantLevel`, role tables** |
| `routes/platform.ts` | contexts, catalogues, roles, provisioning writes |
| `routes/offerings.ts` | launch minting, program roles, club chat enforcement |
| `db/tenantRepo.ts` | `metadata_json` read/write, launch tokens |
| `db/tenantDoor.ts` | per-request RLS GUC binding |
| `migrations/` | core chain; `platforms/{bridge,learning}/` packs |

### Bridge Platform — `Applications/BridgePlatform/`

| Path | What |
|---|---|
| `apps/bridge-web/lib/access.ts` | `canUse`, `requireFeature`, `canCreateChallenge` |
| `apps/bridge-web/lib/nexus.ts` | context resolution, both auth paths |
| `apps/bridge-web/lib/api.ts` | `AccessError`, `apiError`, `requireContext` |
| `apps/bridge-web/lib/challenges.ts` | club scoping |
| `apps/bridge-web/app/nexus/launch/route.ts` | launch handoff + cookies |
| `packages/bridge-access/src/index.ts` | the 43-feature registry |
| `packages/bridge-challenges/src/types.ts` | `challengeVisibleInScope` |
| `packages/bridge-audit/src/index.ts` | audit records |
| `db/migrations/` | the Bridge tree (has a ledger) |

### Content Studio — `Components/laic-learning-platform/`

| Path | What |
|---|---|
| `src/lib/roleAccess.ts` | `canAccessScreen`, nav catalogue |
| `src/lib/accessPolicy.ts` | type scopes, grants |
| `src/app/App.tsx` | boot, launch exchange, `nexusMode` |
| `src/app/components/Layout.tsx` | `ScreenRouter`, `embed=1` |
| `src/lib/supabase.ts` | all four writes routed through Nexus |
| **`server/index.mjs`** | **the unauthenticated service-role routes (§20 #1)** |

### Mobile app — `Applications/bridge-coach-app/`

| Path | What |
|---|---|
| **`lib/bridge-role.ts`** | **`can()`, `isCoach`, caching discipline** |
| `lib/use-can.ts` | `useCan`, `useClubScopedContext` |
| `lib/club-context.tsx` | club selection |
| `lib/learning.ts` | `canAuthorLearning`, club-scoped reads |
| `lib/launch-cache.ts` | single-use launch handling |
| `lib/nexus.ts` | the Nexus client, 401 retry |
| `lib/config.ts` | environment resolution |
| `docs/club-access-catalogue.md` | the club-app catalogue, explained |

### Console — `TheNexusPlatform/platform_logic/src/nexus/`

| Path | What |
|---|---|
| `access/FeatureAccess.tsx` | Full/Partial/No access |
| `people/RolesAndGroups.tsx` | the modern role builder |
| `people/adapters.ts` | per-altitude adapters, provisioning clamp |
| `routes/program.tsx` | `ProgramPartners` |

### Design documents (intent, not implementation)

- `TheNexusPlatform/ACCESS_CATALOGUE_DESIGN.md`
- `TheNexusPlatform/NEXUS_UPDATES_AND_ACCESS_ENFORCEMENT.md`

Both predate the shipped system in places. Notable divergences: catalogues live in
`platform_settings`, not a dedicated table; console capability ids are dotted, not snake_case;
`/me/capabilities` shipped with a different signature; and `requireCapability` has an
empty-set escape hatch the spec does not mention.

---

## Appendix — a first week

**Day 1.** Read `ACCESS_CONTROL_ADMIN_GUIDE.md`, then `provisioning.ts` (145 lines), then
`platformAccess.ts:196-363`. Those three give you the whole model.

**Day 2.** Trace one capability end to end. `app.challenge.create` is the best one: it touches
the console picker, the ceiling, the club-app role ladder, the mobile gate, and the Bridge
Platform's `canCreateChallenge` second gate.

**Day 3.** Read §16 (invariants) and §20 (gaps). Pick a Low from the gap table and fix it —
#11 or #12 are self-contained and will teach you the caching model.

**Before your first PR touching access:** re-read §16. Every entry there is a bug that has
actually happened.
