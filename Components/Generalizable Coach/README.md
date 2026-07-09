# LAIC / Bridge AI Buddy — Phase 1: The Coaching Loop

The core adaptive coaching loop: a learner makes a bridge bidding decision →
the system evaluates it → retrieves relevant knowledge → the coach responds
with an appropriately leveled hint.

## LAIC Milestone 0 — contracts foundation & coach service

M0 (per `LAIC_Coach_Implementation_Plan.md` §4) establishes the schema-first
foundation every later milestone imports from. It is built inside this single
package rather than as five separate npm packages — the plan's own M0 risk note
says *"start as one integrated service; defer the service split until load
justifies it"* (Risk 5).

**Schema-first contracts (`contracts/`).** The eight core contracts —
`ActivityEvent`, `KnowledgeChunk`, `CoachProfile`, `CoachingPolicy`,
`KnowledgeScope`, `Recommendation`, `LearnerDomainProfile`, `CoachInstance` —
are defined once as JSON Schemas in `contracts/schemas/`, each carrying a
`schemaVersion`. TypeScript types are **generated** from them into
`contracts/generated/` (never hand-written), and one Ajv validator is built from
the same schemas, so compile-time types and runtime validation share a single
source of truth.

```bash
npm run contracts:gen   # regenerate types after editing a schema
npm test                # includes the type-drift gate (fails if generated types are stale)
```

**Coach service (`api/`).** The domain-neutral coach service (the "coach =
separate service" delivery model). In M0 it exposes the validated event-ingest
endpoint backed by the raw event log; later milestones add sessions/hints/etc.

```bash
npm run start:coach     # POST /api/coaching/events on COACH_PORT (default 3100)
npm run cli -- --domain bridge_gameplay --learner L1 --type bid_made --action '{"bid":"1NT"}'
```

| Endpoint | Purpose |
| --- | --- |
| `POST /api/coaching/events` | validate an `ActivityEvent` and persist it to the raw event log |
| `GET /api/coaching/events?sessionId=` | read back the raw log (CLI/tests) |
| `GET /health` | liveness + contracts version |

**Deferred by design (documented, not built in M0):** Postgres — the event log
runs in-memory behind `EventLogRepo` (a Postgres `activity_events` adapter drops
in without touching callers); Nexus auth — a no-op hook in the service marks
where entitlement checks attach; the 5-package monorepo split — see above.

M0 tests: `tests/contracts/schema-validation.test.ts`,
`tests/contracts/type-drift.test.ts` (CI gate), `tests/api/events-ingest.test.ts`.

## LAIC Milestone 1 — foundations

M1 (plan §5) stands up the two-layer skeleton: it can **hold a learner and
retrieve knowledge** through the proper contracts, *without coaching adaptively
yet*. Built against the M0 contracts, adapting the Phase-1 code at the boundary
(so the existing bridge suite stays green).

- **A1 — `KnowledgeChunk` required-tag rule** (`platform/knowledge-source/normalize.ts`):
  every chunk is normalized to carry `conceptIds`/`skillIds`/`chunkType` (safe
  default `explanation`) and `schemaVersion`; the Phase-1 `chunkId` is adapted
  onto the M0 `id` at the boundary.
- **A2 — `KnowledgeSource` port + `BundledKnowledgeSource`** (`platform/knowledge-source/`):
  the one retrieval interface the coach depends on, plus the offline in-process
  adapter (tag + keyword, optional cosine). Sample packages in
  `fixtures/knowledge/`.
- **A3 — cross-domain learner store + projection** (`platform/learner-model/LearnerStore.ts`):
  `getLearnerDomainProfile(learnerId, domainId)` projects the cross-domain store
  into the per-domain `LearnerDomainProfile` contract, **domain-isolated by
  construction**. `crossScopeAwareness` is off by default.
- **A4 — `openCoachSession`** (`platform/adaptive/openCoachSession.ts`): the
  architecture-level opener (§6.1) that builds the **Common Coach Package**
  (domain-filtered profile + resolved policy) and binds a `KnowledgeSource`. The
  pipeline inside is a stub in M1. (Distinct from the Phase-1 embed opener; they
  converge later.)

M1 tests (`tests/engine/`): `open-session`, `bundled-knowledge`,
`domain-isolation` (the critical isolation gate). The default `CoachingPolicy`
is a placeholder until the config resolver arrives in **M2**.

## LAIC Milestone 2 — the configurable coach

M2 (plan §6) makes design bet #4 real: **coach behavior comes from resolved
configuration, and coaches are created by config, not code.** Built on the M0
contracts (adds `CoachingPolicyProfile` + `CoachCapabilityScope`; the Studio is
API-only in this pass — no UI yet).

- **B1 — config resolver** (`platform/config/resolvePolicy.ts`): flattens
  platform default → `CoachingPolicyProfile` → course → class → learner → session
  into the flat `CoachingPolicy`, honoring `lockedFields`, stamping `provenance`.
- **B2 — policy-driven intervention** (`platform/policy/InterventionPolicyEngine.ts`):
  deterministic decision where `questioningStyle`/`feedbackStyle`/interruption
  tolerance/hint ceiling become behavior (socratic → question-form; direct →
  higher hint). The M0-aligned engine (the Phase-1 bridge engine still serves the
  bridge runtime).
- **B3 — capability scope** (`platform/policy/capability.ts`): a disabled
  capability is structurally unavailable — the decision downgrades to silent.
- **B4 — `chat()` window**: `openCoachSession` now carries a multi-turn
  conversation window + a config-driven `decide()`.
- **B5 — profile registry + Studio API** (`platform/studio/`, `api/`): clone a
  preset, tweak policy/scope, publish a version (clone lineage preserved), deploy
  an instance, preview behavior — all via HTTP:
  `GET/POST /api/coaching/profiles`, `POST /api/coaching/profiles/:id/versions`,
  `POST /api/coaching/profiles/:id/preview`, `POST /api/coaching/instances`.

Try it: `npm run m2:demo`. Tests: `tests/config/{resolver,policy-drives-behavior,
capability-scope}.test.ts`, `tests/api/studio-registry.test.ts`.

## Architecture — build for Bridge, architect at the seams

Three zones, strictly separated. The platform core never says "bridge."

```
platform/                 # Zone 1 — domain-agnostic platform core
  types/                  # Zone 2 — domain contracts (interfaces every domain implements)
  learner-model/          #   who the learner is, skills practiced, mistakes made
  knowledge/              #   generic retriever (by concept / hint level)
  coach-runtime/          #   intervention policy + the AdaptiveCoachRuntime pipeline
  llm/                    #   PromptBuilder, LLMClient (Anthropic), ResponseGenerator
  session/                #   session lifecycle + append-only event/interaction log
  api/                    #   REST API for the mobile client
domains/
  bridge/                 # Zone 3 — the ONLY place bridge-specific logic lives
    plugin/               #   DomainPlugin, skill/concept taxonomy, event types
    evaluator/            #   rule-based Beginner 1 bidding evaluator + hand parser
    knowledge/            #   hand-authored Beginner 1 knowledge chunks (JSON)
    coaching/             #   composition root (wires platform + bridge together)
    DealGenerator.ts      #   Beginner 1 practice deal generator
tests/
  phase1.e2e.test.ts      # end-to-end coaching loop across five scenarios
```

The data flow through `AdaptiveCoachRuntime.processEvent`:

```
ActivityEvent
  → evaluator.evaluate            (EvaluationResult: correctness, concepts, skills, severity)
  → learnerStore.getCommonCoachPackage   (learner context + coaching policy)
  → interventionEngine.decide     (respond? which hint level?)
  → knowledgeRetriever.retrieveForHint   (progressive disclosure by level)
  → responseGenerator.generate    (LLM → AdaptiveCoachResponse; silent skips the LLM)
  → learnerStore.updateSkillState (fold result into mastery + mistake log)
```

## Running

```bash
npm install
npm test          # 67 tests across all 12 steps
npm run typecheck # tsc --noEmit
npm start         # start the API on :3000 (set PORT to change)
```

### Demo UI

`npm start`, then open **http://localhost:3000** in a browser (or a phone on
your network). The mobile-first web UI is served from `public/` and talks to
the real REST API — same evaluator, intervention engine, and mastery tracking
the tests exercise. It shows the coach staying silent on good bids, escalating
hints level 1→4, and the learner's skill mastery climbing as you play. A live
"pipeline trace" strip lights up each stage (Evaluate → Decide → Retrieve →
Respond → Learn) on every action. Without `ANTHROPIC_API_KEY`, hint *text* is a
canned fallback but every hint *level* and decision is the real thing.

### LLM configuration

The `LLMClient` is provider-aware and speaks to **OpenAI** or **Anthropic**
(`max_tokens: 300` for mobile-friendly responses). It picks a provider in this
order: an explicit `provider` option → `LLM_PROVIDER` env → inferred (OpenAI if
`OPENAI_API_KEY` is set, else Anthropic).

```bash
# OpenAI
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini      # optional, this is the default
npm start

# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export ANTHROPIC_MODEL=claude-sonnet-5   # optional, this is the default
npm start

# Force a provider explicitly
export LLM_PROVIDER=openai
```

Without any key the coach returns a safe fallback message so the loop never
blocks. Tests inject a `MockLLM` that echoes the requested hint level, so no
network or key is needed for `npm test`.

## API endpoints (for the mobile client)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/learners` | create a learner profile |
| GET | `/api/learners/:learnerId` | fetch profile + skill states |
| POST | `/api/sessions` | start a session |
| POST | `/api/sessions/:id/events` | main endpoint — send a learner action, get a coach response |
| POST | `/api/sessions/:id/hint` | request/escalate a hint at the current decision point |
| POST | `/api/sessions/:id/end` | end the session, get the full log |
| GET | `/api/sessions/:id` | current session state |
| POST | `/api/deals/generate` | generate a Beginner 1 practice deal |

## Card play (real-time coaching during the play of the hand)

Beyond bidding, the coach gives real-time feedback on **card play**. The tactics
are sourced from *Watson's Classic Book on the Play of the Hand at Bridge*
(`domains/bridge/knowledge/card-play/*.json`): planning, finesses, hold-up,
ducking, entries, drawing trumps, ruffing in the short hand, opening leads,
second-hand-low, third-hand-high, covering honors, the Rule of Eleven, signals.

There is no live double-dummy engine. Instead, `domains/bridge/cardplay/` holds a
set of curated **partial table states** (scenarios), each annotated with the
tactically correct play. A `CardPlayEvaluator` grades the card the learner
clicks; a `RouterEvaluator` sends bidding actions to the bidding evaluator and
card plays to the card-play evaluator, so the *same* `AdaptiveCoachRuntime`
coaches both. Card-play skills feed the same mastery model.

In the UI, switch to the **Card play** tab: a bridge table renders dummy + your
hand + the current trick, you click a card, and the coach responds in real time
(silent when right, escalating hints when not). "Next situation" cycles the
scenarios. Card-play endpoints: `GET /api/cardplay/scenarios`,
`GET /api/cardplay/scenario/:id` (answer stripped), and the shared
`POST /api/sessions/:id/events` with `eventType: "card_played"`.

## Beginner 1 scope

Bidding rules covered (Standard American / SAYC-like):

- **Openings:** 1NT (15–17 balanced, no 5-card major), 1 of a major (12–21,
  5+ cards), 1 of a minor (12–21, no 5-card major), Pass (< 12).
- **Responses to 1-of-a-suit:** simple raise (6–9, 3+ support), limit raise
  (10–12, 4+ support), 1NT (6–10, no fit/new suit), new suit at the 1-level
  (6+, 4+ cards), Pass (< 6).

Every generated practice deal is verified against the evaluator, so the
`expectedBid` is always the evaluator's own recommendation.
