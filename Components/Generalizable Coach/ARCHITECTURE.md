# Generalizable Coach — Architecture

`@laic/coach` is a **UI-agnostic, domain-agnostic adaptive coaching engine**. It watches a
learner take actions in some activity, decides whether and how to intervene, and emits short,
progressively-disclosed coaching suggestions. The only domain implemented today is **Bridge**
(bidding + card play), but the platform core never says the word "bridge" — everything
bridge-specific is isolated behind a small set of contracts so a second domain can be added
without touching the pipeline.

This document describes the code as it actually exists in `platform/`, `domains/`, and
`index.ts`.

---

## 1. The three-zone rule

The whole design rests on a strict separation into three zones. Dependencies point **inward**:
Zone 3 depends on Zone 2 depends on Zone 1. Zone 1 never imports Zone 3.

```
platform/                 # ZONE 1 — domain-agnostic platform core
  types/                  #   ZONE 2 — domain contracts (the interfaces every domain implements)
  learner-model/          #   who the learner is; skills practiced; mistakes made
  knowledge/              #   generic retriever (by concept / by hint level)
  coach-runtime/          #   intervention policy + the AdaptiveCoachRuntime pipeline
  llm/                    #   PromptBuilder, LLMClient (OpenAI/Anthropic), ResponseGenerator
  session/                #   session lifecycle + append-only event/interaction log
  embed/                  #   createCoachSession facade + embedding ports + offline LLM
  api/                    #   optional REST API (for a standalone mobile client)
domains/
  bridge/                 # ZONE 3 — the ONLY place bridge logic lives
    plugin/               #   DomainPlugin, skill/concept taxonomy, event/state types
    evaluator/            #   bidding evaluator, hand parser, RouterEvaluator
    cardplay/             #   card-play evaluators, principle engine, DDS oracle
    knowledge/            #   hand-authored knowledge chunks (JSON) + loader
    coaching/             #   composition root (wires platform + bridge together)
    DealGenerator.ts      #   practice deal generator
```

- **Zone 1 (platform):** the coaching machinery. Knows about *learners*, *events*, *evaluations*,
  *hint levels*, and *knowledge chunks* — never about suits, bids, or tricks.
- **Zone 2 (contracts):** the interfaces in `platform/types/` that both zones agree on:
  `ActivityEvent`, `EvaluatorContract` → `EvaluationResult`, `DomainPlugin`, `CommonCoachPackage`,
  `AdaptiveCoachResponse`, `KnowledgePackage`.
- **Zone 3 (bridge):** implements those contracts for one domain. To add "chess" or "poker" you
  write a new `domains/<x>/` with an evaluator, a knowledge package, and a composition root —
  and Zone 1 is reused verbatim.

---

## 2. The central pipeline — `AdaptiveCoachRuntime`

`platform/coach-runtime/AdaptiveCoachRuntime.ts` is the heart. Every learner action flows through
`processEvent(event, gameState)`, which dispatches on `event.eventType`:

- `deal_started` → clears the decision-point state, returns `silent`.
- `hint_requested` → escalates the hint at the *current* decision point (`handleHintRequest`).
- anything else (e.g. `bid_made`, `card_played`) → the full coaching loop (`handleAction`).

The full loop for an action:

```
ActivityEvent + gameState
  1. evaluator.evaluate(state, action)            → EvaluationResult (correctness, concepts, skills, severity)
  2. learnerStore.getCommonCoachPackage(...)      → learner context + coaching policy
     learnerStore.getProfile(...).recentMistakes  → repetition signal
  3. interventionEngine.decide(...)               → InterventionDecision (respond? which hint level?)
  4. knowledgeRetriever.retrieveForHint(...)      → chunks sized to the hint level (progressive disclosure)
  5. responseGenerator.generate(...)              → AdaptiveCoachResponse (LLM writes the text; silent skips the LLM)
  6. learnerStore.updateSkillState(...)           → fold the result into mastery + mistake log
     learnerStore.tagLastMistakeEvent(...)        → make the mistake traceable to this event
  → store this decision point so later hint_requested events escalate against it
```

Key design points:

- **The runtime is generic.** It is constructed with a bag of dependencies
  (`AdaptiveCoachRuntimeDeps`): an `EvaluatorContract`, a `KnowledgeRetriever`, an
  `InterventionPolicyEngine`, a `ResponseGenerator`, a `LearnerStore`, and an optional
  `SessionLogger`. None of these are bridge-typed — they are all `<any, any>` at the boundary or
  platform interfaces.
- **Per-session decision-point state.** `decisionState: Map<sessionId, DecisionPointState>` remembers
  the last evaluated action, its evaluation, the coach package, and the current hint level, so a
  learner tapping "hint" repeatedly escalates 1 → 2 → 3 → 4 against the *same* decision instead of
  re-evaluating.
- **`probe(event, gameState)` — read-only Q&A.** Evaluates a *hypothetical* action and generates an
  explanation-level response **without** touching the learner model or the hint state. This is what
  powers "What should I do?" / "What about X?" interactions so that asking questions never pollutes
  mastery tracking.

---

## 3. Zone 2 contracts (the seams)

### `ActivityEvent<TAction>` (`types/events.ts`)
The domain-agnostic envelope: `eventId`, `domainId`, `eventType`, `timestamp`, `sessionId`,
`actorId`, and a domain-specific `action` payload. The platform core reads only the envelope; the
`action` is opaque to it and meaningful only to the domain's evaluator.

### `EvaluatorContract<TState, TAction>` → `EvaluationResult` (`types/evaluation.ts`)
The domain's judge. `evaluate(state, action)` returns a **machine-readable** verdict — never
learner-facing prose:
- `correctness`: `correct | acceptable | suboptimal | incorrect`
- `severity`: `minor | moderate | major | critical`
- `confidence` (0–1), optional `bestAction` / `alternativeActions`
- `conceptIds` and `skillIds` — the taxonomy anchors that drive knowledge retrieval and mastery
- `explanation` — a machine reason, for logging (the LLM writes the human text downstream)

This split is deliberate: **the evaluator decides truth; the LLM decides phrasing.** They can be
tested and swapped independently.

### `DomainPlugin` (`types/plugin.ts`)
The registration surface for a domain: `domainId`, `conceptCategories`, `eventTypes`, `ruleTypes`,
and `getEvaluator()`.

### `CommonCoachPackage` + `CoachingPolicy` (`types/coach.ts`)
The universal learner-context bundle any coach consumes: the learner's skill level and
preferences (`feedbackStyle`, `explanationDepth`, `interruptionTolerance`), a `learningState`
(current goal, mastered/weak skills, recent mistakes), and a `CoachingPolicy`
(`maxHintLevel`, `allowDirectAnswer`, `allowRealTimeInterruption`, `saveForPostmortemWhenPossible`).

### `AdaptiveCoachResponse` (`types/coach.ts`)
What comes out: a `CoachResponseType`
(`silent | nudge | hint | explanation | warning | question | postmortem_note`), an optional
`HintLevel` (1–4), a short `message` (mobile-sized), and `metadata` linking back to the concepts,
skills, and source chunks.

---

## 4. Platform core components (Zone 1)

### InterventionPolicyEngine (`coach-runtime/InterventionPolicyEngine.ts`)
The **decision brain** — pure, deterministic, no LLM. Given the evaluation, the coaching policy,
and recent mistakes, it decides `shouldRespond` and the `hintLevel`. Rules, in order:
1. **Explicit hint request** → always respond, escalate level (0→1, else +1, clamped to `maxHintLevel`).
2. **Correct** → silent (logged for postmortem praise).
3. **Acceptable + minor** → silent (don't interrupt a minor variation).
4. **Suboptimal** → gentle nudge (level 1), or level-2 hint if the *same concept* was recently missed.
5. **Incorrect** → level scales with severity (`critical`/`major` → 2, or 3 if repeated;
   `moderate` → 1; else a nudge).
6. **Postmortem override** → if policy says `saveForPostmortemWhenPossible` and the issue isn't
   critical, convert a would-be interruption into a saved `postmortem_note`.

The "repeated concept" signal (any of this evaluation's `conceptIds` appearing in the last 5
mistakes) is what makes the coach escalate on things you keep getting wrong.

### LearnerStore (`learner-model/LearnerStore.ts`)
In-memory (Map-backed) learner model — the interface is stable enough to swap for a real
datastore. Per learner, per domain it tracks `SkillState` (exposure/correct/mistake counts) and a
capped `recentMistakes` log (20 max, most-recent-first). Two jobs:
- `updateSkillState(...)` folds an `EvaluationResult` into counters and recomputes **mastery** on a
  monotonic ladder: `not_started → introduced (1+) → practicing (3+) → proficient (>70% over 10+)
  → mastered (>90% over 20+)`.
- `getCommonCoachPackage(...)` assembles the `CommonCoachPackage` (mastered skills, weak skills =
  practiced but <60% accuracy, recent mistake concepts) for the runtime and prompt builder.

### KnowledgeRetriever (`knowledge/KnowledgeRetriever.ts`)
Domain-agnostic retrieval over a `KnowledgePackage` of tagged chunks. `retrieve()` scores chunks by
`conceptId` overlap (with optional difficulty/chunkType filters). `retrieveForHint()` implements
**progressive disclosure** — the same concept surfaces more material as the hint level climbs:
- L1 → `hint_template` only · L2 → `rule` · L3 → `rule + example` · L4 → `rule + example + explanation`.

`allChunks()` exposes the whole corpus for the free-text chat retrieval layer.

### LLM layer (`llm/`)
- **PromptBuilder** turns the coach package + evaluation + retrieved chunks + decision into a
  `BuiltPrompt` (a `PromptStrategy` — swappable).
- **ResponseGenerator** is the gate: for silent/postmortem decisions it **never calls the LLM**
  (returns `silent` / a `postmortem_note` with metadata). Otherwise it builds the prompt, calls the
  injected `LLMLike`, and wraps the text in an `AdaptiveCoachResponse`.
- **LLMClient** is a provider-aware client for **OpenAI or Anthropic** (defaults: `gpt-4o-mini` /
  `claude-sonnet-5`, `max_tokens: 300` for mobile). Provider precedence: explicit option →
  `LLM_PROVIDER` env → inferred from which key is set. It is **browser-safe** (guards `process.env`,
  fails soft to a fallback string so a flaky network never blocks the loop) and reports a diagnostic
  `error` + `fromModel` flag so callers can tell real model text from fallback.

### SessionEngine (`session/`)
Session lifecycle plus an **append-only log** of events and coach interactions (the `SessionLogger`
hook the runtime calls). Made **isomorphic** (Web Crypto `randomUUID`, no `node:crypto`) so the
whole package bundles for the browser.

---

## 5. The embedding layer — how any UI plugs in (`platform/embed/`)

This is what makes the coach "generalizable" at the **host** boundary, not just the domain boundary.

### `createCoachSession(opts)` — the one-call facade (`embed/CoachSession.ts`)
The primary public entry point. It owns a learner profile + a session, wraps the runtime, and
exposes a tiny event-driven surface. It is **framework-agnostic** (no React/DOM) and **offline by
default**: with no `llm` injected it uses `HeuristicLLM`, so it never touches the network.

Options: `learnerId`, optional `llm` (inject a real client for model text), `oracle` (defaults to
the in-process `LocalDoubleDummyOracle`; pass `null` to disable), feedback/explanation prefs, and
`emitSilent` (emit "✓ looks sound" turns too, not just mistakes).

Surface:
- `attach(source)` — subscribe a host `EventSource`; returns a detach fn.
- `on(listener)` — receive `CoachSuggestion`s; returns an unsubscribe fn.
- `observe(event, state)` — feed one already-translated event; get the suggestion.
- `probe(event, state)` — read-only "what should I do / what about X" answer.
- `chat(question, ctx)` — free-form model-answered question (grounded in retrieved chunks;
  needs a real `llm`).
- `requestHint()` — escalate a hint at the current decision point.
- `history()` / `clear()` — the in-memory suggestion log.

### Ports (`embed/ports.ts`)
- **`EventSource`** — the host maps its *native* event model into the generic `ActivityEvent`
  envelope and calls the handler. **This adapter is the only host-specific code.**
- **`CoachSuggestion` / `SuggestionListener`** — one coaching turn out (response + triggering event
  + a monotonic `seq` the UI keys on).

### HeuristicLLM + `withOfflineFallback` (`embed/HeuristicLLM.ts`)
A deterministic, offline text generator that phrases nudges/hints without any model. Crucially, the
**intervention decision and hint level are the real pipeline** even offline — only the *wording* is
canned. `withOfflineFallback(llm)` wraps a real client so it degrades to heuristic phrasing when a
call fails.

### Chat retrieval (`embed/chat.ts`)
`scoreChunks()` does **keyword scoring** over the corpus (deliberately no embeddings while the
corpus is small and curated) and `buildChatPrompt()` grounds the model answer in the top chunks +
activity context. The seam is the `scoreChunks` call site — upgrade to hybrid tag+embedding
retrieval when the corpus grows.

---

## 6. The Bridge domain (Zone 3)

### Composition root — `buildBridgeCoach()` (`coaching/buildBridgeCoach.ts`)
**The only place bridge wiring meets the platform.** It news up a `LearnerStore`, a
`KnowledgeRetriever` over the combined bidding + card-play knowledge, an `InterventionPolicyEngine`,
an LLM (`LLMClient` by default, injectable), a `ResponseGenerator`, and a `SessionEngine`, then
assembles an `AdaptiveCoachRuntime` whose evaluator is a **`RouterEvaluator`**.

### RouterEvaluator (`evaluator/RouterEvaluator.ts`)
Lets one generic runtime coach three different activities by dispatching on the action shape:
- action has a `bid` → **BridgeEvaluator** (bidding).
- action has a `card` **with** a `scenarioId` → **CardPlayEvaluator** (curated drill).
- action has a `card` **without** a scenarioId → **LiveCardPlayEvaluator** (arbitrary live play).

### Card play — the hybrid evaluator (`cardplay/`)
Correctness and explanation are separated:
- **`DoubleDummyOracle` (port, `oracle.ts`)** is the *authoritative* correctness source: given the
  full deal and the played card, it returns tricks-if-played vs. best-available, the optimal cards,
  and `tricksLost`. Returning `undefined` means "can't judge this position" → fall back to
  principles. It's a port so a heavy WASM solver can be dropped in behind a stable interface.
- **`LocalDoubleDummyOracle` (`dds/`)** is the wired-by-default implementation: a hand-rolled,
  unit-tested alpha-beta double-dummy solver (`dds/solver.ts`). It only solves **end-game positions**
  (≤5 cards/hand by default) to stay responsive on the browser main thread; earlier plays defer to
  principles.
- **Principle engine (`principles.ts`)** is the deterministic fallback that *names the tactic*
  (third-hand-high, second-hand-low, win cheaply, don't overtake partner) and is the safe answer
  when the oracle abstains.

The design: **the oracle judges correctness; principles + knowledge + LLM explain the why.**

### Knowledge (`knowledge/`)
Hand-authored JSON chunks tagged with `conceptIds`, `difficulty`, and `chunkType` — a Beginner-1
bidding package and a card-play package (declarer play, defense, planning), merged by
`loadPackage.ts` so the coach teaches both. Chunk types map directly onto the retriever's
progressive-disclosure levels.

### Plugin & deal generator
`plugin/BridgePlugin.ts` declares the domain's concept/skill/event taxonomy (the `DomainPlugin`
contract); `DealGenerator.ts` produces practice deals.

---

## 7. End-to-end data flow

```
Host UI (BridgeBot / bridgebot-new / mobile client)
   │  translate native game event → ActivityEvent    ← the ONLY host-specific adapter
   ▼
EventSource.subscribe ──► CoachSession.observe(event, gameState)
   ▼
AdaptiveCoachRuntime.processEvent
   ├─ RouterEvaluator.evaluate ─► BridgeEvaluator | CardPlayEvaluator | LiveCardPlayEvaluator(+Oracle)
   ├─ LearnerStore.getCommonCoachPackage / recentMistakes
   ├─ InterventionPolicyEngine.decide            (respond? hint level? postmortem?)
   ├─ KnowledgeRetriever.retrieveForHint         (progressive disclosure)
   ├─ ResponseGenerator.generate ─► LLMClient | HeuristicLLM   (silent ⇒ no LLM call)
   └─ LearnerStore.updateSkillState              (mastery ladder + mistake log)
   ▼
CoachSuggestion ──► SuggestionListener ──► Host UI renders the nudge/hint/✓
```

---

## 8. Why this is "generalizable" — the two independent axes

1. **Domain-agnostic (vertical seam).** The platform pipeline is reused verbatim for any activity.
   A new domain supplies only: an `EvaluatorContract`, a `KnowledgePackage`, a `DomainPlugin`, and a
   composition root. The runtime, learner model, intervention policy, knowledge retriever, and LLM
   layer never change. The evaluator/LLM split (truth vs. phrasing) is what keeps domain logic out of
   the prose layer.

2. **UI-agnostic (horizontal seam).** The `embed/` layer decouples the coach from any front-end. A
   host implements one adapter (native events → `ActivityEvent`) and renders `CoachSuggestion`s. The
   coach runs in-process, offline by default, in Node or the browser. Today it is embedded in
   `bridgebot/` and `bridgebot-new/` via `@laic/coach`; a standalone REST client is also supported by
   `platform/api/`.

Both seams are enforced by the same discipline: **dependencies point inward, contracts live in
Zone 2, and the platform core never names a domain or a UI framework.**
