# Club & Coaching Access Catalogue — spec and plan

> Replacing the app's hardcoded coach/learner split with catalogue-driven custom
> roles, using the system already described in
> `TheNexusPlatform/ACCESS_CATALOGUE_DESIGN.md`. Written as the working reference
> for a multi-session task; each phase is independently shippable.

Status: **the app's own catalogue provider + console wiring are built** — `club-app`, with role
storage, role CRUD, a context endpoint and a members endpoint. The app gates on
it, and the console's role builder now offers "Bridge Bird App" as its own
section with 8 collapsible groups and 26 toggles, provisionable No/Partial/Full.

Remaining: server enforcement (`requireCapability` on the club mutations), and
the roster's role labels + filter carousel/checkboxes.

**How a role actually reaches the app** — one role per person, as the owner
specified:

```
Console → Program/Partner → People → Roles
   author a role ("Strange Mentor"), tick app capabilities in the
   "Bridge Bird App" section                     → program_roles.perms.capabilities
   assign it to a person                         → program_role_assignments
        ↓
GET /api/platform/club-app/context?program_id=…
   resolvePlatformAccess → programRoleCapabilities, roleName
   appAccessFor() filters those ids to the club-app catalogue
        ↓
App: RoleContext.app = { role_name, capabilities }
   useCan("app.challenge.create") → the + appears or does not
```

A club administrator is a structural tier and holds everything without a role.

**Correction, 2026-08-09.** An earlier pass put these capabilities inside
`bridge.json`. That was wrong: that document is the Bridge PLATFORM's — desktop
knowledge, CPs, sandboxes, tables. The mobile app is a different application and
needed its OWN provider, the way `library` is its own document. bridge.json is
reverted; everything below now lives in `defaults/club-app.json` under ids
prefixed `app.`

---

## 1. What the platform already gives us

The machinery is not missing — it is built and running. Reading the code rather
than the design doc:

| Piece | Where | State |
|---|---|---|
| Catalogue document shape | `backend-ts/src/accessCatalogue/types.ts` | built |
| Per-provider catalogues (incl. `bridge`) | `accessCatalogue/defaults/*.json` | built |
| Resolver (`grantableCapabilities`, `validateGrants`, `surfacesForCapabilities`) | `accessCatalogue/resolver.ts` | built |
| Request-time enforcement (`capabilitiesFor`, `requireCapability`) | `accessCatalogue/enforce.ts` | built |
| Custom bridge roles: create/update/delete, capability-bound | `accessCatalogue/bridgeRoles.ts` | built |
| Role → capability resolution at launch | `routes/platform.ts` → `/bridge/context` | built |
| Console catalogue editor + No/Partial/Full provisioning | `platform_logic/src/nexus/access/` | built |

**`/bridge/context` already returns `capabilities: string[]` and `role_name`.**
It resolves them in this priority order (platform.ts:914–934):

1. admin → every grantable capability
2. an assigned custom bridge role → that role's capabilities
3. a "partial" program-role grant → its bridge-filtered capabilities
4. otherwise → the launch level's sample-role capabilities

So a custom role called "Strange Mentor" with a hand-picked capability set is
**already expressible today**, and the server already computes what it grants.

---

## 2. The two real gaps

**Gap 1 — the app throws the capabilities away.** `lib/nexus.ts`'s `BridgeContext`
type declares `accessLevel`, `roles`, `is_admin`, `program_name`, `role_name` —
but **not `capabilities`**. The field arrives over the wire on every launch and is
dropped at the type boundary. Everything downstream then has to infer permission
from a role string, which is why `isCoach` exists.

**Gap 2 — the bridge catalogue describes the bridge PLATFORM, not this app.** Its
40 capabilities cover knowledge, CPs, sandboxes, deals, tables, analysis and KBs —
the desktop bridge platform's surfaces. **Nothing in it describes a club**: no
chat, no challenges, no practice deals, no club header, no roster, no coaching
menu. There is no capability a role could hold that would mean "may post in the
club chat", because the inventory never listed it.

That is the honest answer to "where did the gaps in our original logic go
missing": we built club features directly against a binary `isCoach()` derived
from the Nexus membership role, and never declared them as gateable components.
`isCoach` is not wrong — it is a **structural tier check** (owner/administrator),
which the catalogue design keeps. What is missing is the finer layer *underneath*
it.

---

## 3. Component inventory (what should be gateable)

Derived from the app's actual surfaces, not invented. Verbs follow the
catalogue's existing `provider.noun.verb` convention.

### Group `club_chat` — the club conversation
| Capability | Gates |
|---|---|
| `bridge.club.chat.view` | the Chat button on Club, and reading the thread |
| `bridge.club.chat.post` | the composer — read-only members have view without post |
| `bridge.club.chat.post_image` | the ⊕ attach button (separate: images are a bigger trust grant than text) |
| `bridge.club.chat.pin` | long-press → Pin, and unpinning from the pin sheet |
| `bridge.club.chat.moderate` | removing someone else's message — **not built yet**, declared so the slot exists |

### Group `club_challenges`
| Capability | Gates |
|---|---|
| `bridge.club.challenge.view` | the Challenges button and the carousel |
| `bridge.club.challenge.create` | the + beside "Challenges" |
| `bridge.club.challenge.edit` | editing an existing challenge (**not built** — today's + only creates) |
| `bridge.club.challenge.delete` | **not built** |
| `bridge.club.leaderboard.view` | the standings under a challenge. Separate because Quan's `challenges-v1-spec.md` already carries a standings-visibility setting |

### Group `club_deals` — practice deals
| Capability | Gates |
|---|---|
| `bridge.club.deal.view` | the Practice Deal button and the carousel |
| `bridge.club.deal.create` | the + beside "Practice Deals" |
| `bridge.club.deal.edit` | editing name/description of an existing deal (**not built**) |
| `bridge.club.deal.discuss` | posting in a deal's own Discussion thread |

### Group `club_management`
| Capability | Gates |
|---|---|
| `bridge.club.members.view` | the Members pill and the roster |
| `bridge.club.header.set` | Menu → Other → Club management → Set/Change header |
| `bridge.club.header.remove` | Remove header — **explicitly separate**, per owner request: setting and clearing the club's face are different levels of trust |

### Group `club_coaching` — the "Other" menu's Coaching section
| Capability | Gates |
|---|---|
| `bridge.club.coaching.view` | the "Other" row in the Menu drawer at all |
| `bridge.club.learners.view` | the Learners row + screen |
| `bridge.club.assignments.view` | the Assignments row + screen |
| `bridge.club.assignments.create` | authoring an assignment |
| `bridge.club.reviews.view` | the Reviews row + screen |
| `bridge.club.library.view` | the Library row + screen |

### Surfaces (what a capability set unlocks)
`kind: "component"` for in-screen controls, `"navigation"` for buttons that lead
somewhere, `"screen"` for pushed pages. Each names its `routeOrComponent` so the
app can look itself up:

`club.tab` · `club.button.chat` · `club.button.challenges` · `club.button.deal` ·
`club.button.feedback` · `club.members` · `club.chat.screen` ·
`club.chat.composer` · `club.chat.attach` · `club.challenges.screen` ·
`club.challenges.add` · `club.leaderboard` · `club.deals.screen` ·
`club.deals.add` · `club.deal.discussion` · `menu.other` · `menu.coaching` ·
`menu.club_management` · `menu.header_set` · `menu.header_remove`

### Sample roles (starters, never overwriting a customised role)
- **Club Member** — view everything, post in chat and deal discussions, no create
- **Club Mentor** — Member plus coaching views, challenge + deal create, pin
- **Club Manager** — Mentor plus club header set/remove and moderation

---

## 4. Reserved vs grantable

Nothing in this set is `reserved`. Reserved means "held only by a structural
tier and never offered in the role builder" — that fits `remove_admins` and
`manage_operators`, not club features. A club's owner/administrator already
bypasses via `isStructuralTier()`, so they hold all of these implicitly without
any being marked reserved.

---

## 5. Phases

**Phase 1 — inventory (BUILT).** Add the groups, capabilities, surfaces and
sample roles above to `defaults/bridge.json`. Nothing changes at runtime: the
catalogue is inventory, and no role grants them yet. This is what makes the rest
expressible.

**Phase 2 — the app reads capabilities.**
- Add `capabilities: string[]` to `BridgeContext` in `lib/nexus.ts` (it is already
  on the wire — this is a type-level change plus plumbing).
- `lib/bridge-role.ts` grows `can(capability)` beside `isCoach`. `isCoach` stays
  as the structural-tier check and the fallback for an empty capability set —
  exactly the backward-compatibility contract `enforce.ts` already uses ("empty
  set → don't gate, the coarse guard governs").
- Screens gate on `can(...)` instead of `coach`: the two `+` buttons, the chat
  composer, the attach button, the pin menu, the Other rows, Club management.

**Phase 3 — server enforcement.** Add `requireCapability(...)` to the club
mutation endpoints already written: `POST /chat`, `PATCH /chat/:id/pin`,
`PUT /header-image`. Hidden buttons are not security; these endpoints currently
check membership and staff role only.

**Phase 4 — console.** The bridge catalogue's new groups appear automatically in
the existing role builder and the No/Partial/Full provisioning control, since both
render from the catalogue. Verify the collapsible grouping reads well with ~20 new
capabilities, and that a partner program's Features dialog offers them.

**Phase 5 — the roster shows real roles.** Today the Club tab's rows say
Member/Mentor from `membership_role`. They should show the person's **highest
held role name** (`role_name` from context, or the assigned custom role). Then:
- the filter carousel gains the real role names beside All Users, and
- a filter button opens checkboxes of the roles present in this club.

This depends on an endpoint that returns each member's role name — today's
`/programs/:id/members` returns `membership_role` and `role_name` (the custom
program role) but not the resolved *bridge* role. Needs a decision (§6).

---

## 6. Owner decisions (settled 2026-08-09)

1. **Role name** — a person holds exactly ONE role on the Nexus partner page; that
   role's name is what shows beside them, and it is the label for whatever
   capabilities they carry. No precedence chain needed. `roleNameOf()` reads
   `role_name` from `/bridge/context`.
2. **No defaults** — nobody gets anything except what their club's role grants.
   Implemented with one transition guard, see §6a.
3. **Declare `edit`/`delete`** for challenges and deals even though unbuilt. Done.
4. **Provider** — kept in `bridge`. The app IS the bridge app, `/bridge/context`
   already carries these capabilities, and a separate `club` provider would need
   its own context endpoint, seeding and console wiring for nothing gained.

### 6a. The transition guard (important)

"Nobody gets anything by default" is the end state, but applying it literally
*today* would empty the app for everyone: Club 1's 8 members hold Nexus
membership roles and **no bridge role**, so their capability set is empty. The
four `member` accounts would lose the Club tab entirely the moment this shipped.

So `can(context, capability, fallback)` has three cases:

| Case | Result |
|---|---|
| Structural tier (club owner/administrator) | always allowed — they bypass server-side too |
| Holds a role → non-empty capability set | **exactly** what the role grants; the fallback is ignored |
| Holds no role → empty set | `fallback`, set per call site to the pre-roles behaviour |

This is the same convention the server already uses
(`accessCatalogue/enforce.ts`: "empty set → the coarse guard governs"), so app
and server agree. **Once a club assigns roles, case 2 takes over and the
fallback is never reached** — the end state arrives per-club, as roles are
authored, with no flag day.

## 7. Old open questions (answered above)

1. **Which role name shows beside a member?** A person can hold a Nexus membership
   role (`administrator`), a custom program role, AND a custom bridge role. §5
   assumes the bridge role wins, falling back to the membership role. Confirm.
2. **Do learners get chat by default?** Making `chat.post` a capability means a
   role without it is read-only. Today everyone in the club can post. The
   fallback in Phase 2 preserves that; the question is what the default *role*
   should grant once roles are authored.
3. **`edit`/`delete` for challenges and deals are declared but unbuilt.** Declare
   now (slot exists, catalogue is honest about intent) or omit until built? I
   declared them — the catalogue is an inventory of what *can* be controlled, and
   the design doc does the same with deferred resource types. Say if you'd rather
   they were omitted.
4. **Scope.** These are club capabilities living in the `bridge` provider
   catalogue. The alternative is a new `club` provider. I chose `bridge` because
   the app IS the bridge app, `/bridge/context` already carries its capabilities,
   and a new provider would need its own context endpoint, seeding and console
   wiring for no gain. Flag if you disagree — it is cheap now, expensive later.

---

## 8. Where things live

```
backend-ts/src/accessCatalogue/defaults/bridge.json   ← Phase 1 (this change)
backend-ts/src/routes/offerings.ts                    ← Phase 3 (requireCapability)
Applications/bridge-coach-app/lib/nexus.ts            ← Phase 2 (capabilities on the type)
Applications/bridge-coach-app/lib/bridge-role.ts      ← Phase 2 (can())
Applications/bridge-coach-app/app/(tabs)/club.tsx     ← Phase 2 + 5
Applications/bridge-coach-app/app/club-chat.tsx       ← Phase 2
Applications/bridge-coach-app/app/club-challenges.tsx ← Phase 2
Applications/bridge-coach-app/app/practice-deals.tsx  ← Phase 2
Applications/bridge-coach-app/components/menu-sheet.tsx ← Phase 2
```

A catalogue change ships with the API bundle (`npm run build:vercel` →
`vercel deploy --prod` → **move the `nexus-api-rust-six` alias**), because the
defaults are seeded from the bundle.
