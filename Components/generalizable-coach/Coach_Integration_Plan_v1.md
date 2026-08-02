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

**Do:** ship `coach.json` alongside `library.json` / `bridge.json` / `learning.json`,
mapping each capability to a catalogue capability id (`coach.hint.generate`,
`coach.answer.direct`, `coach.postmortem.generate`, …) so roles grant them the
same way they grant everything else. Map **1:1 onto the existing scope** — do
not invent a second vocabulary.

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

## 4. Suggested order

1. **BR3 + judgment mapping.** Define the return path onto the existing
   `CoachStrip` note shape, and the verdict mapping. Nothing else can be
   verified end-to-end until output can reach the table.
2. **Bridge event adapter (BR1/BR2).** Translate logic events → `ActivityEvent`
   + evaluation facts. Async, non-blocking. First visible result: the coach
   explaining a call using the rule the robot actually fired.
3. **KB-backed `KnowledgeSource`** through `@laic/kb-core`, composed with the
   teaching chunks, provenance preserved.
4. **The four policy presets** + the ☰ switch.
5. **`coach.json` access catalogue**, mapped 1:1 from `CoachCapabilityScope`.
6. **`LearnerContextSource`** — after confirming which service owns BKT and
   whether it has an HTTP surface.
7. **Tenancy + auth**, when and if the coach moves out of process.

---

## 5. Open questions for the owner

1. **Which service owns mastery/BKT today, and can it be queried over HTTP?**
   R1 depends entirely on this and I could not find an endpoint.
2. **In-process or service?** (§3 — my recommendation is in-process first.)
3. **Should coaching notes persist with the board**, so a coach reviewing a
   learner's session later sees what the coach said at the time? That is a
   storage decision with a schema cost; worth settling before wiring.
4. **Who may change the mode** — learner, coach, program admin? Determines which
   policy fields get locked at which layer.
