# Coach Integration Plan v1

**Status:** planning only — nothing implemented. Written 2026-08-02 against the
code as it stands, to be consulted (and corrected) while implementing.

Owner's five requirements, restated:

1. The coach reads the learner's **level and current content** from the learning platform.
2. The coach **listens to table events** and makes suitable suggestions.
3. The coach has **access to the knowledge base** of the thing it coaches.
4. The coach is **configurable** — beginner / intermediate / advanced / socratic, etc.
5. The coach is a **packaged component**, usable across platforms, with its own **access catalogue**.

---

## 0. The short version

Four of the five are mostly *wiring*, not building. The engine already has the
seams: a `KnowledgeSource` port with an offline and an HTTP adapter, an
`EventSource` port, a layered policy resolver with locked fields, and a
capability scope that structurally disables what a profile forbids.

Three things genuinely do not exist yet and are the real work:

- **A learner-context port.** `LearnerDomainProfile` is a shape with nothing
  filling it, and "what content are they looking at right now" is not modelled
  anywhere. (R1)
- **The return path (BR3).** The coach can be fed events today; there is no
  specified way for its output to get back into the table. The plan already
  calls this out as undefined.
- **Tenancy and auth.** No `orgId`/`programId` on anything, no auth on the coach
  service. This — not the catalogue — is what actually blocks "usable across
  platforms". (R5)

---

## 1. What exists today (verified)

| Piece | Where | State |
|---|---|---|
| Domain-agnostic runtime | `platform/coach-runtime`, `platform/adaptive` | assess → decide → respond → learn |
| Host ports | `platform/embed/ports.ts` | `EventSource` (host translates its events → `ActivityEvent`), `SuggestionListener` |
| Knowledge port | `platform/knowledge-source/KnowledgeSource.ts` | one `retrieve(query)`; adapters: `BundledKnowledgeSource` (in-process JSON), `PlatformKnowledgeSource` (HTTP `/retrieve`), `ScopedKnowledgeSource`, `MultiScopeKnowledgeSource` |
| Policy | `contracts/schemas/CoachingPolicy.schema.json`, `platform/config/resolvePolicy.ts` | 7 intervention modes, feedback styles incl. `socratic`, hint ladder, layered inheritance with **locked fields** |
| Capability scope | `contracts/schemas/CoachCapabilityScope.schema.json`, `platform/policy/capability.ts` | 15 booleans, **structurally enforced** — a disabled capability downgrades the response to silent |
| Learner model shape | `contracts/schemas/LearnerDomainProfile.schema.json` | `currentLevel`, `currentLearningGoal`, `masteredSkills`, `weakSkills`, `skillStates` |
| Service | `api/coachService.ts` (port 3100) | events ingest, observations, profiles, profile versions/preview, instances |
| Bridge domain | `domains/bridge/*` | evaluators, card-play oracle, hand-authored knowledge packages, `createCoachSession` |
| Cross-platform contracts | `Components/laic-learner-contracts/src/index.ts` | `PlatformContext`, `PlatformEventEnvelope`, `CommonLearnerDomainProfile` (`selfDeclaredLevel`/`assessedLevel`), `CommonProgressSignal` |
| Bridge↔coach seam | `Bridge_Platform_Implementation_Plan_v2.md` §10.6, **BR1–BR9** | specified; **BR3 explicitly undefined** |
| Access-catalogue precedent | `TheNexusPlatform/backend-ts/src/accessCatalogue/defaults/{bridge,learning,library}.json` | a component ships one provider document |

---

## 2. Requirement by requirement

### R1 — Level and current content from the learning platform

**Exists:** the shape (`LearnerDomainProfile`), and `CommonLearnerDomainProfile`
in the shared contracts with `selfDeclaredLevel` / `assessedLevel`.

**Missing:** anything that fills it. `LearnerStore` is local to the coach. There
is no `LearnerContextSource` port to mirror `KnowledgeSource`, and **"what they
are looking at right now" is not modelled at all** — no current-activity input.

**Do:** add one pull port, symmetrical with `KnowledgeSource`:

```ts
interface LearnerContextSource {
  profile(learnerId, domainId): Promise<LearnerDomainProfile | null>;
  currentFocus(learnerId): Promise<{ objectId; title; conceptIds; skillIds; startedAt } | null>;
}
```

with two adapters: an HTTP one against the learning platform, and a null/static
one so bridge-only hosts work without it.

**Constraint to hold (do not violate):** mastery lives with Owlwise/BKT; the
coach **reads** it. BR6 says the same for bridge signals — bridge progress must
reference the coach's own event log rather than a second skill record. So this
port is a **read-only projection with a cache and an explicit staleness
window**, never a sync. Two systems computing mastery will diverge, and then
nobody can say what the learner knows.

**Open question:** the learning platform is a Vite SPA; I found no `/retrieve`
or mastery endpoint in it. Which service actually owns BKT state today, and does
it have an HTTP surface? If not, R1 is blocked on that, not on the coach.

### R2 — Listen to table events

**Exists:** `EventSource` (host translates → `ActivityEvent`), and BR1/BR2
specify exactly what bridge must emit. The bridge session already records what
BR2 asks for, in a different shape: logic events carry `reason`, `rejected[]`,
`citedSettings`, `matchedRuleId` per call and card.

**Missing:**

- **BR3, the return path.** How a suggestion gets back into the table. This is
  the one seam the plan leaves open, and it is now half-answered: the table has
  a `CoachStrip` below the player's hand taking a flat list of notes. That
  component is the render target; BR3 becomes "how notes get to it".
- **The judgment mapping** (BR2): bridge's `aligned` / `reasonable_alternative`
  / `questionable` / `not_system_aligned` → the coach's `correct` / `acceptable`
  / `suboptimal` / `incorrect`. Must be written down once, not inferred twice.
- **A decision on where the coach runs** (see §3).

**Constraint:** delivery is async and **bridge must never block on the coach**
(§10.5). A coaching turn cannot sit in the path of committing a bid.

### R3 — Access to the knowledge base

**Exists:** the port, and for bridge a hand-authored corpus
(`domains/bridge/knowledge/beginner-1`, `card-play`).

**Missing:** the coach does not read the live bridge KB. Nothing in
`domains/bridge` imports `@bridge/kb` or touches a `CompiledKb`.

**Do:** a `KnowledgeSource` adapter over the compiled KB, reached through
`@laic/kb-core`'s scope envelope rather than the raw store, so the coach obeys
the same access rules as every other KB consumer.

**Design point worth arguing about:** these are two different kinds of
knowledge and should not be merged.

- The **bridge KB** says *what this table's system does* — "Open 1♠ with
  five-plus spades; 12–21 total points". Authoritative, citable, versioned.
- The **teaching chunks** say *how to explain it to a human* — worked examples,
  misconceptions, hint ladders.

Compose them (`MultiScopeKnowledgeSource` already exists for this) and keep
provenance on every chunk, so a coach note can cite the actual rule the robots
played by. That citation is the product's whole claim: "an open, cited rulebook
that can always tell you why."

### R4 — Configurable modes

**Largely done.** `CoachingPolicy` already carries `interventionMode`
(passive / on_demand / guided_tutor / live_coach / postmortem / guided_replay /
human_coach_assistant), `feedbackStyle` (gentle / direct / **socratic** /
minimal / mixed), `questioningStyle`, `maxHintLevel`, `allowDirectAnswer`. The
resolver collapses platform → profile → course → class → learner → session with
locked fields.

**Do not** add a `mode: "beginner" | "advanced"` enum. Beginner/intermediate/
advanced/socratic are **named `CoachingPolicyProfile` presets** that set the
existing fields. Otherwise there will be two vocabularies that disagree.

**Remaining work:** the four presets, a decision about who may override what
(locked fields — a coach should probably be able to lock "no direct answers" for
a class), and a UI to pick them. The ☰ menu on the table is the obvious place
for the learner-facing switch.

### R5 — Packaged component with an access catalogue

**Exists:** it is already a package (`@laic/coach`) with a domain registry, and
`CoachCapabilityScope` is an access catalogue in all but name — 15 capabilities,
structurally enforced.

**Do:** a `coach.json` provider document mapping each capability to a catalogue
capability id (`coach.hint.generate`, `coach.answer.direct`,
`coach.postmortem.generate`, …) so roles grant them the same way they grant
everything else. Map **1:1 onto the existing scope** — do not invent a second
vocabulary.

**Authored in the component, registered by the platform** — following the
library precedent, where the owner's correction was that the catalogue belongs
to the component rather than being configured from the consuming platform. So
the document ships from `Components/generalizable-coach/` and Nexus registers
it, the same way `library.json` is surfaced. (An earlier draft of this plan said
"ship it alongside `library.json` in backend-ts" — that is the wrong home.)

**The actual blocker is not the catalogue.** The coach service has no `orgId`,
no `programId`, no auth on any endpoint — I checked. Anyone who can reach port
3100 can read any learner's observations and mutate profiles. Before this is
"usable across platforms" it needs:

- `PlatformContext` (`appId`, `programId`, `domainId`, `organizationScopeId`) on
  every event, profile, and instance — the shared contracts already define it;
- auth on the service, and scoping of every read by that context;
- a persistence story for the learner model (today it is a local store).

---

## 3. The one decision to make first

**Where does the coach run for bridge?**

- **A. In-process** inside bridge-web (import `@laic/coach`, run the decision on
  the server that already has the session, the KB and the events).
  *For:* no network hop in the live path, no new auth surface, no tenancy work
  to start, session/KB/identity already in hand. *Against:* one copy per host;
  the learning platform would run its own.
- **B. Over HTTP** to the coach service (3100).
  *For:* one coach for all platforms; matches the "separate service" framing in
  the plan. *Against:* needs tenancy + auth + deployment before it can do
  anything at all, and puts a network hop in a live coaching path.

**Recommendation: A first, B when a second host needs it.** The port boundaries
(`EventSource`, `KnowledgeSource`, `LearnerContextSource`) are what make the
move cheap later — that is exactly what they are for. Building B first means
paying the tenancy/auth bill before there is a second consumer to justify it.

---

## 4. Build order

**Phase 0 — prove the import (spike, half a day).** Everything rests on it.
`link:` dep + `transpilePackages` + one server-side import of
`openCoachSession`, rendering a hardcoded suggestion in the strip.
Two known risks, both to be settled here, not later:
- the coach's relative imports carry `.js` extensions (NodeNext); webpack needs
  `resolve.extensionAlias` unless Next 16 already handles it. `@laic/learner-contracts`
  does not prove this — it is types-only.
- `link:` does not install the target's dependencies, and
  `Components/generalizable-coach/node_modules` will not exist on Vercel. Check
  whether the runtime path actually reaches `ajv` (likely only
  `contracts/validate.ts` does); if it does, add it to bridge-web's own deps.
*Fallbacks if the spike fails:* build `dist` in the deploy step; publish the
package; or fall back to the HTTP service.

**Phase 1 — write the seams down before any wiring.**
- **BR3 (return path):** `CoachNoteRecord` above → `CoachStrip`'s existing note
  shape. The render target already exists and is already phone-only.
- **BR2 (evaluation):** bridge is the evaluator, the coach never re-implements
  bridge rules. For robot actions the verdict is already recorded (logic events:
  `reason`, `rejected[]`, `citedSettings`, `matchedRuleId`). **For the learner's
  own actions there is no verdict today** — a human call records
  `reason: "human action"`. The evaluator for those is the KB decider run in
  *ask* mode (decide without committing) and compared with what the learner did.
  This is the single most important piece of new logic in the whole integration.
- The judgment → correctness mapping table, written once.
- **Deterministic only in the commit path. No LLM.** `HeuristicLLM` /
  `withOfflineFallback` exist for exactly this; LLM phrasing becomes an opt-in
  "explain more", never a blocker on committing a bid (§10.5).

**Phase 2 — adapters, all in `apps/bridge-web/lib/coach/`.** Host-specific code
lives host-side; the component stays clean.
| File | Job |
|---|---|
| `activityEvents.ts` | bridge event → `ActivityEvent` (BR1) |
| `evaluate.ts` | KB decider in ask mode → evaluation facts (BR2) |
| `knowledge.ts` | `KnowledgeSource` over the compiled KB via `@laic/kb-core`, composed with the teaching chunks |
| `policy.ts` | resolve the layer stack → `CoachingPolicy` |
| `notes.ts` | read/write `CoachNoteRecord` on the session; undo rule |
| `session.ts` | build the coach session, cached per compileId like the KB cache |

**Phase 3 — the run point.** In the same server path that commits an action,
after persistence: synchronous, deterministic, time-budgeted, failures logged
and swallowed. A coach that throws must never cost a learner their bid.

**Phase 4 — render.** The page maps stored notes → `CoachNote`. Mostly done.

**Phase 5 — the four presets + the ☰ switch** (§R4).

**Phase 6 — `coach.json` access catalogue**, mapped 1:1 from `CoachCapabilityScope`.

**Deferred:** `LearnerContextSource` HTTP adapter (blocked on a BKT service),
cross-session learner model persistence, LLM phrasing, postmortems, tenancy +
auth (only needed if the coach ever moves out of process).

### The thinnest useful slice
After you bid, the strip tells you whether the system agreed and why — the
learner's call evaluated against the KB decider, cited to the rule. No LLM, no
learner model, no new service, no learning-platform dependency.

---

## 3b. The component boundary — where each piece is allowed to live

The coach is a component, not a bridge feature. Verified 2026-08-02 that the
boundary currently holds: `platform/*` names bridge only in doc comments, never
as a dependency, and `domains/bridge/*` imports no `@bridge/*`, no Next, no
Postgres. **This integration must not be what breaks that.**

Three zones, and the import arrow only ever points one way (host → component):

| Zone | Knows about | Must never know |
|---|---|---|
| `platform/*` | coaching, learners, knowledge, policy — no domain | any game, any app |
| `domains/bridge/*` | bridge **as a game**: auctions, contracts, cards | session records, Nexus identity, Postgres, Next, `@bridge/*` |
| `apps/bridge-web/lib/coach/*` | **this application**: `bridge_kb_sessions`, the compiled KB store, Nexus context, note persistence | — (it may import the component) |

**The test when unsure:** *would this code still make sense if bridge were played
in a different app?* Yes → `domains/bridge`. If it names `bridge_kb_sessions`,
`nexusUserId`, or imports `@bridge/kb` → host.

Worked examples:
- *Judgment → correctness mapping* — game-level vocabulary, pure function →
  `domains/bridge`. But *producing* the verdicts (running the KB decider in ask
  mode) reads the compiled KB and the session → host.
- *Auction context → taxonomy skill* — imports `@bridge/taxonomy`, an app-tree
  package → host, until/unless the taxonomy itself moves.
- *`LearnerContextSource`* — a generic pull port, no domain in its shape →
  `platform/*`. The learning-platform adapter that implements it → wherever the
  host lives.
- *`CoachNoteRecord`* — a bridge-web storage shape, not a coach contract. The
  component emits `AdaptiveCoachResponse`; the host maps it to its own note and
  renders it. Do not let the strip's shape leak back into the component.

**Consequences of in-process worth stating plainly:**
- Each host runs its own copy. That is what a library is, and it is fine — the
  shared things are the code and the contracts, not a running instance.
- But it means **learner state is per host** until there is a shared store or
  the service. Bridge mastery in bridge-web will not be visible to the learning
  platform's copy. Acceptable while bridge is the only consumer; it is the thing
  that will eventually force the service, not "we should have a service".

**Component hygiene this integration should fix, because consumers pay for it:**
`better-sqlite3` (a native module) and `express` are hard `dependencies` of
`@laic/coach`. The core is careful — `platform/storage/sqlite.ts` says outright
that it must never enter the embed graph, and the root export does not reach it —
but every consumer still installs them. They belong in `optionalDependencies`,
or the service belongs in its own package.

## 4b. Mastery: what it actually is here, and what blocks it

**The model.** Per skill, per domain: a five-rung ladder
(`not_started → introduced → practicing → proficient → mastered`) computed by
`computeMastery` in `platform/learner-model/LearnerStore.ts` from three
counters — `exposureCount`, `correctCount`, `mistakeCount`. Thresholds: 3+
exposures → practicing; 10+ at >70% → proficient; 20+ at >90% → mastered.
**Progression is monotonic — it never regresses.**

**It is not BKT.** Bayesian Knowledge Tracing carries a probability of knowing
with learn/slip/guess parameters. This is a counter ladder. When Owlwise
arrives, the two are different *kinds* of quantity, not different estimates of
the same one — `MASTERY_SCORE` projects the rung onto the contract's 0–1 field,
and that projection is lossy. Worth knowing before anyone compares numbers.

**Who consumes it:** the policy resolver (level → hint depth, direct answers),
`detectWeakSkills` / `recommendNextSkill`, and the learner-facing "level".

**The handover switch already exists.** `LearnerStore.setExternalMasteryDomains([...])`
makes `updateSkillState` a no-op for a domain, exactly so the coach cannot
advance a second divergent record once a host owns it. Nothing needs building
for the eventual Owlwise handover except the read port.

**Two things block bridge mastery today, and neither is the coach's fault:**

1. **Nothing can key it.** Mastery is per `skillId`. `@bridge/taxonomy` defines
   the skills (`sk_opening_bid_selection`, `sk_response_selection`,
   `sk_declarer_planning`, …) with level bands — but **nothing imports it**, and
   compiled KB rules carry no `skillId`/`conceptId`. So an evaluated action
   cannot currently say which skill it exercised. This is BR7 ("shared
   concept/skill taxonomy") going unmet.
   *Cheapest fix:* map the engine's own `AuctionContext` (opening / response /
   rebid / overcall — which `matchContext` already computes) onto the taxonomy's
   bidding skills. The categories line up almost one-to-one, and it needs no
   re-authoring of the knowledge base. Attaching skill ids to rules is the
   better long-run answer, but it touches every item.
2. **Nothing persists it.** `LearnerStore` defaults to `InMemoryLearnerRepo`.
   In-process on serverless that means mastery lives for one request. A
   Postgres `LearnerRepo` is needed before cross-session mastery means anything.

**Consequence for sequencing:** mastery is not in the first slice, and that is a
finding rather than a preference — the ids to key it by do not exist yet.
Within-board coaching needs none of it.

**One product question to settle before it ships:** monotonic mastery means a
learner who masters a skill and then stops playing for six months is still
"mastered", and the coach will keep pitching at that level. Fine for a first
version; say so deliberately rather than discovering it later.

## 5. Decisions (owner, 2026-08-02)

1. **No mastery/BKT service exists yet.** So the coach OWNS the bridge-domain
   learner model for now — it already has the machinery (`LearnerStore`,
   `skillStates`, `detectWeakSkills`) and nothing else is computing it. The
   `LearnerContextSource` port still gets defined, so that when Owlwise arrives
   the coach becomes a reader and its own inference is switched off **by
   config, not by surgery**. Until then there is exactly one writer of bridge
   mastery, which is the property that matters.
   *Corollary:* R1 is not in the first slice. Within-board coaching needs no
   learner model at all.
2. **In-process.** Confirmed. Consumption follows the pattern already proven by
   `@laic/learner-contracts`: a `link:` dependency plus `transpilePackages`,
   importing `@laic/coach/source` so Next transpiles the TypeScript directly and
   no build step is needed.
3. **Coaching notes persist, on the session record, keyed to the action's
   `seq`.** Reasons: a note is evidence of what the learner was told, so review
   and postmortem both need it; recomputing at render is only defensible while
   the coach is deterministic, and stops being so the moment LLM phrasing
   arrives; the session is already jsonb and already read by the page, so notes
   cost no extra query and inherit org/program scoping for free.
   **Not as engine events** — the action/logic stream has a single writer and
   undo pairs by `seq`; foreign events risk both. A sibling array is enough:
   ```ts
   type CoachNoteRecord = {
     noteId: string; seq: number;         // the action this is about
     learnerId: string; profileId: string; policyVersion: string;
     kind: "hint" | "nudge" | "question" | "explanation";
     headline: string; detail?: string;
     citations?: { label: string; ruleId?: string }[];
     createdAt: string;
   };
   ```
   Undo rule: drop notes whose `seq >= droppedSeq`.
4. **Mode ownership: learner-chosen after subscribing — but far ahead.** For now
   a program default plus a table-level override in the ☰. Build the layer stack
   so a subscription/entitlement layer inserts later without touching call
   sites: platform default → program profile → *(future: subscription tier)* →
   learner preference → session override. `resolvePolicy` already supports
   exactly this.
