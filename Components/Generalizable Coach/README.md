# LAIC / Bridge AI Buddy — Phase 1: The Coaching Loop

The core adaptive coaching loop: a learner makes a bridge bidding decision →
the system evaluates it → retrieves relevant knowledge → the coach responds
with an appropriately leveled hint.

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
