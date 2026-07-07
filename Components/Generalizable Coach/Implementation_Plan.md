# Phase 1 — The Coaching Loop: Steps for Claude Code

**Context for every step:** We are building an adaptive bridge coaching platform called LAIC / Bridge AI Buddy. The target is a mobile-first online application. Phase 1 delivers the core coaching loop: a learner makes a bridge bidding decision → the system evaluates it → retrieves relevant knowledge → the coach responds with an appropriately leveled hint.

**Architecture principle:** Build for Bridge, architect at the seams. All Bridge-specific logic goes behind domain-agnostic interfaces. The platform core (Zone 1) never says "bridge." Domain contracts (Zone 2) are interfaces any domain implements. Bridge implementation (Zone 3) is the only place Bridge-specific logic lives.

**Mobile consideration:** The coach runtime is backend and platform-agnostic. But all response schemas should assume mobile delivery: short messages, progressive disclosure (hint levels), minimal payload sizes. The UI layer (when built) will be mobile-first — bottom sheets and overlays, not sidebars.

---

## Step 1 — Project Scaffold and Domain Contracts

**What to build:** Initialize the project and define all the TypeScript interfaces/types that every other step depends on.

**Prompt for Claude Code:**

> Set up a TypeScript Node.js project with the following structure. Use a monorepo or simple folder layout — not a framework yet, just the type system and project config.
>
> Create this folder structure:
> ```
> LAIC/
> ├── platform/
> │   ├── types/          # Domain contracts (Zone 2)
> │   ├── coach-runtime/
> │   ├── learner-model/
> │   ├── session/
> │   ├── knowledge/
> │   ├── events/
> │   └── llm/
> ├── domains/
> │   └── bridge/
> │       ├── plugin/
> │       ├── evaluator/
> │       ├── knowledge/
> │       └── coaching/
> └── package.json
> ```
>
> In `platform/types/`, define these interfaces:
>
> **ActivityEvent\<TAction\>** — generic event envelope:
> - eventId: string
> - domainId: string (e.g., "bridge_gameplay")
> - eventType: string (e.g., "bid_made")
> - timestamp: string (ISO)
> - sessionId: string
> - actorId: string (learnerId)
> - action: TAction (domain-specific payload)
>
> **EvaluatorContract\<TState, TAction\>** — interface with one method:
> - evaluate(state: TState, action: TAction): Promise\<EvaluationResult\>
>
> **EvaluationResult:**
> - correctness: "correct" | "acceptable" | "suboptimal" | "incorrect"
> - confidence: number (0–1)
> - bestAction?: any
> - alternativeActions?: any[]
> - conceptIds: string[] (which concepts are involved)
> - skillIds: string[] (which skills are tested)
> - explanation?: string (machine-readable reason, not learner-facing)
> - severity: "minor" | "moderate" | "major" | "critical"
>
> **KnowledgePackage:**
> - packageId: string
> - domainId: string
> - version: string
> - chunks: KnowledgeChunk[]
>
> **KnowledgeChunk:**
> - chunkId: string
> - conceptIds: string[]
> - skillIds: string[]
> - difficulty: "beginner" | "intermediate" | "advanced"
> - chunkType: "rule" | "example" | "explanation" | "misconception" | "hint_template" | "drill_prompt"
> - content: string
> - metadata?: { sourceDocument?: string; bridgeSystem?: string; exampleHands?: string[] }
>
> **CommonCoachPackage:**
> - learner: { learnerId, skillLevel ("beginner"|"intermediate"|"advanced"), preferences: { feedbackStyle ("gentle"|"direct"|"socratic"|"minimal"), explanationDepth ("short"|"medium"|"deep"), interruptionTolerance ("low"|"medium"|"high") } }
> - learningState: { currentDomainId, currentExperienceId, currentActivityId, currentLearningGoal, masteredSkills: string[], weakSkills: string[], recentMistakes: string[], recentFeedbackSummary }
> - coachingPolicy: { maxHintLevel (1|2|3|4), allowDirectAnswer: boolean, allowRealTimeInterruption: boolean, saveForPostmortemWhenPossible: boolean }
>
> **AdaptiveCoachResponse:**
> - type: "silent" | "nudge" | "hint" | "explanation" | "warning" | "question" | "postmortem_note"
> - level?: 1 | 2 | 3 | 4
> - message?: string (keep short for mobile — under 200 chars for nudge/hint, under 500 for explanation)
> - metadata?: { relatedConceptIds?: string[], relatedSkillIds?: string[], sourceChunkIds?: string[], savedForPostmortem?: boolean }
>
> **DomainPlugin** — interface that each domain implements:
> - domainId: string
> - conceptCategories: string[]
> - eventTypes: string[]
> - ruleTypes: string[]
> - getEvaluator(): EvaluatorContract\<any, any\>
>
> Export everything from an index.ts barrel file. Make sure it all compiles.

**Depends on:** Nothing — this is the foundation.

**Done when:** `tsc --noEmit` passes. You can instantiate each type with mock data in a test file.

---

## Step 2 — Learner Model

**What to build:** The learner profile schema and a simple in-memory store. This tracks who the learner is, what skills they've practiced, and what mistakes they've made.

**Prompt for Claude Code:**

> In `platform/learner-model/`, build the learner model system.
>
> Define these types:
>
> **LearnerProfile:**
> - learnerId: string
> - name: string
> - createdAt: string
> - preferences: { feedbackStyle, explanationDepth } (same types as CommonCoachPackage)
> - domains: { [domainId: string]: DomainLearnerState }
>
> **DomainLearnerState:**
> - currentLevel: string (e.g., "beginner_1")
> - currentLearningGoal: string
> - skillStates: SkillState[]
> - recentMistakes: MistakeRecord[] (last 20)
> - sessionsCompleted: number
> - lastSessionAt: string
>
> **SkillState:**
> - skillId: string
> - mastery: "not_started" | "introduced" | "practicing" | "proficient" | "mastered"
> - exposureCount: number
> - correctCount: number
> - mistakeCount: number
> - lastPracticedAt: string
>
> **MistakeRecord:**
> - timestamp: string
> - conceptId: string
> - skillId: string
> - eventId: string
> - severity: string
>
> Build a **LearnerStore** class (in-memory for now, backed by a Map):
> - getProfile(learnerId): LearnerProfile | null
> - createProfile(learnerId, name, preferences): LearnerProfile
> - updateSkillState(learnerId, domainId, skillId, result: EvaluationResult): void
>   - Increments exposureCount. If correct, increment correctCount. If incorrect, increment mistakeCount and add to recentMistakes (capped at 20).
>   - Update mastery: not_started → introduced (first exposure), introduced → practicing (3+ exposures), practicing → proficient (>70% correct over 10+ exposures), proficient → mastered (>90% correct over 20+ exposures).
> - getCommonCoachPackage(learnerId, domainId): CommonCoachPackage
>   - Assembles the CommonCoachPackage from the current learner profile for the given domain.
>
> Write unit tests for the store and mastery progression logic.

**Depends on:** Step 1 (types).

**Done when:** Tests pass. A learner can be created, skill states update correctly after evaluations, and getCommonCoachPackage returns a valid package.

---

## Step 3 — Bridge Domain Plugin and Skill Taxonomy

**What to build:** The Bridge-specific plugin that implements the DomainPlugin interface, plus the Beginner 1 skill and concept constants.

**Prompt for Claude Code:**

> In `domains/bridge/plugin/`, create the Bridge Gameplay Plugin.
>
> Create a constants file with the Beginner 1 skill taxonomy:
>
> ```
> Concept IDs:
> - CONCEPT_OPENING_BID
> - CONCEPT_HCP (high card points)
> - CONCEPT_HAND_EVAL_BASIC
> - CONCEPT_HAND_BALANCED
> - CONCEPT_HAND_DISTRIBUTION
> - CONCEPT_RESPONSE_1LEVEL
> - CONCEPT_RAISE
> - CONCEPT_NT_RESPONSE
> - CONCEPT_OPENER_REBID
>
> Skill IDs:
> - SKILL_OPENING_1SUIT — Opening 1 of a suit (1♣, 1♦, 1♥, 1♠)
> - SKILL_RESPONSE_NT — Responding to 1♣/1♦ with 1NT/2NT/3NT
> - SKILL_RESPONSE_1M_NT — Responding to 1♥/1♠ with 1NT
> - SKILL_SIMPLE_RAISE — Simple raise (2M or 2m)
> - SKILL_LIMIT_RAISE — Limit raise (3M or 3m)
> - SKILL_NEW_SUIT_1LEVEL — New suit at the 1-level
> - SKILL_PASS_MINIMUM — Passing with minimum hands
> - SKILL_OPENER_REBID — Opener rebids
> - SKILL_HCP_COUNTING — Counting high-card points
> - SKILL_HAND_SHAPE — Recognizing balanced vs. unbalanced
> ```
>
> Create the plugin schema JSON:
> ```json
> {
>   "domainId": "bridge_gameplay",
>   "conceptCategories": ["hand_evaluation", "bidding"],
>   "eventTypes": ["deal_started", "bid_made", "hint_requested", "hand_completed"],
>   "ruleTypes": ["bidding_rule"],
>   "evaluator": { "type": "engine", "name": "BEN" }
> }
> ```
>
> Create bridge-specific event types:
> - **BridgeBidAction:** { bid: string, position: "N"|"E"|"S"|"W", hand: string (e.g., "S:KQ874 H:A3 D:K92 C:J54"), auctionSoFar: string[] }
> - **BridgeGameState:** { dealId: string, dealer: string, vulnerability: string, hands: { [position: string]: string }, auctionSoFar: string[], currentPhase: "bidding"|"play" }
>
> Implement the DomainPlugin interface for bridge, returning the domain metadata and eventually the evaluator.

**Depends on:** Step 1 (DomainPlugin interface).

**Done when:** The plugin compiles, exports all constants, and the schema JSON is valid.

---

## Step 4 — Bridge Evaluator

**What to build:** A rule-based bidding evaluator that implements EvaluatorContract<BridgeGameState, BridgeBidAction>. This judges whether the learner's bid is correct for Beginner 1 scenarios.

**Prompt for Claude Code:**

> In `domains/bridge/evaluator/`, implement a rule-based Bridge Evaluator that implements EvaluatorContract<BridgeGameState, BridgeBidAction>.
>
> The evaluator should handle these Beginner 1 opening bid rules (Standard American / SAYC-like):
>
> **Opening bids (no prior bids in the auction):**
> - 15–17 HCP, balanced hand (no 5-card major, no singleton, no void) → 1NT
> - 12–21 HCP, 5+ card major → 1 of that major (1♥ or 1♠, longest first, spades if equal length)
> - 12–21 HCP, no 5-card major → 1 of longest minor (1♦ or 1♣, 1♦ if equal 4-4, 1♣ if 3-3)
> - Under 12 HCP → Pass
>
> **Responses to partner's 1-of-a-suit opening:**
> - 6–9 HCP, 3+ card support → simple raise (2M or 2m)
> - 10–12 HCP, 4+ card support → limit raise (3M or 3m)
> - 6–10 HCP, no fit, no 4-card suit at 1-level → 1NT
> - 6+ HCP, 4+ cards in a new suit at 1-level → bid that suit
> - Under 6 HCP → Pass
>
> The evaluator needs a helper to parse a hand string into suits and count HCP (A=4, K=3, Q=2, J=1).
>
> The evaluate() method should:
> 1. Parse the hand, count HCP, determine shape
> 2. Determine the "correct" bid(s) based on the rules above
> 3. Compare the learner's bid against the correct bid(s)
> 4. Return an EvaluationResult with:
>    - correctness: "correct" if it matches the best bid, "acceptable" if it's a reasonable alternative, "suboptimal" if it's defensible but not standard, "incorrect" otherwise
>    - conceptIds and skillIds from the Beginner 1 taxonomy (Step 3)
>    - severity based on how far off the bid is
>    - explanation: a machine-readable reason (e.g., "Hand has 5-card major, should open 1S not 1NT")
>
> Write thorough unit tests covering:
> - Correct opening bids (1NT, 1M, 1m, Pass)
> - Correct responses (raise, NT, new suit, pass)
> - Common mistakes (opening 1NT with a 5-card major, opening with 10 HCP, responding at 2-level with 6 HCP)

**Depends on:** Step 1 (EvaluatorContract), Step 3 (bridge types and constants).

**Done when:** All unit tests pass. Given any Beginner 1 hand and bid, the evaluator returns a correct EvaluationResult with appropriate concept and skill tags.

---

## Step 5 — Knowledge Store and Beginner 1 Content

**What to build:** Hand-authored bridge knowledge chunks for Beginner 1, stored as JSON, and a knowledge retriever that finds relevant chunks by concept ID.

**Prompt for Claude Code:**

> In `domains/bridge/knowledge/beginner-1/`, create JSON files with hand-authored knowledge chunks following the KnowledgeChunk schema from Step 1.
>
> Create three files:
>
> **opening-bids.json** — 8–10 chunks covering:
> - Rule: Opening 1 of a major with 12–21 HCP and 5+ cards
> - Rule: Opening 1NT with 15–17 HCP balanced
> - Rule: Opening 1 of a minor with 12–21 HCP and no 5-card major
> - Rule: Passing with under 12 HCP
> - Misconception: "I should open 1NT because my hand is strong" (confusing HCP threshold with hand pattern)
> - Misconception: "I have 11 HCP so I should open" (below threshold)
> - Example: A hand with ♠KQ874 ♥A3 ♦K92 ♣J54 — correct opening is 1♠ not 1NT
> - Hint template: "Look at your longest suit. How many cards do you have in it?"
> - Hint template: "Count your high-card points. Is your hand in the opening range?"
>
> **simple-responses.json** — 8–10 chunks covering:
> - Rule: Simple raise with 6–9 HCP and 3+ support
> - Rule: Limit raise with 10–12 HCP and 4+ support
> - Rule: 1NT response with 6–10 HCP, no fit, no new suit at 1-level
> - Rule: New suit at 1-level with 6+ HCP and 4+ cards
> - Rule: Pass with under 6 HCP
> - Misconception: "I should always bid a new suit even with support"
> - Example hands for each response type
> - Hint templates for responses
>
> **hand-evaluation.json** — 5–8 chunks covering:
> - Rule: HCP counting (A=4, K=3, Q=2, J=1)
> - Explanation: Balanced vs. unbalanced hands
> - Explanation: When distribution matters more than points
> - Misconception: "Only HCP matter" (ignoring shape)
> - Example hands showing point counting
>
> Each chunk must have: chunkId, conceptIds (from Step 3 constants), skillIds, difficulty: "beginner", chunkType, content (the actual teaching text — keep concise, under 200 words per chunk, mobile-friendly).
>
> Create a **manifest.json** that wraps these into a KnowledgePackage:
> ```json
> { "packageId": "bridge_beginner_1_v1", "domainId": "bridge_gameplay", "version": "1.0.0", "chunks": [...all chunks...] }
> ```
>
> In `platform/knowledge/`, build a **KnowledgeRetriever** class:
> - constructor takes a KnowledgePackage (loaded from the JSON files)
> - retrieve(conceptIds: string[], difficulty?: string, chunkType?: string): KnowledgeChunk[]
>   - Returns chunks matching ANY of the given conceptIds
>   - Optionally filters by difficulty and chunkType
>   - Orders by relevance: chunks matching more conceptIds first
> - retrieveForHint(conceptIds: string[], hintLevel: 1|2|3|4): KnowledgeChunk[]
>   - Level 1: return hint_template chunks only
>   - Level 2: return rule chunks only
>   - Level 3: return rule + example chunks
>   - Level 4: return rule + example + explanation chunks
>
> Write tests verifying retrieval returns correct chunks for given concept IDs.

**Depends on:** Step 1 (KnowledgeChunk schema), Step 3 (concept/skill constants).

**Done when:** Knowledge JSON files load correctly. Retriever returns relevant chunks filtered by concept, difficulty, and hint level.

---

## Step 6 — Intervention Policy Engine

**What to build:** The engine that decides whether the coach should respond, and at what hint level. This sits between the evaluator result and the LLM response generator.

**Prompt for Claude Code:**

> In `platform/coach-runtime/`, build an **InterventionPolicyEngine**.
>
> It takes:
> - evaluationResult: EvaluationResult
> - coachingPolicy: CommonCoachPackage["coachingPolicy"]
> - recentMistakes: MistakeRecord[] (from learner model)
> - currentHintLevel: number (0 if no hint requested yet in this decision)
> - hintRequested: boolean (true if the learner tapped the hint button)
>
> It returns an **InterventionDecision:**
> - shouldRespond: boolean
> - responseType: AdaptiveCoachResponse["type"]
> - hintLevel: 1 | 2 | 3 | 4
> - reason: string (for logging, not learner-facing)
>
> Rules:
>
> 1. If hintRequested is true:
>    - If currentHintLevel == 0, set hintLevel = 1
>    - Else escalate: hintLevel = min(currentHintLevel + 1, coachingPolicy.maxHintLevel)
>    - responseType = "hint", shouldRespond = true
>
> 2. If correctness == "correct":
>    - shouldRespond = false, responseType = "silent"
>    - (Log for potential postmortem praise)
>
> 3. If correctness == "acceptable" and severity == "minor":
>    - shouldRespond = false (don't interrupt for minor acceptable variations)
>
> 4. If correctness == "suboptimal":
>    - Check if the same conceptId appears in recentMistakes (last 5)
>    - If repeated: responseType = "hint", hintLevel = 2
>    - If first time: responseType = "nudge", hintLevel = 1
>
> 5. If correctness == "incorrect":
>    - If severity == "critical" or "major":
>      - Check if repeated concept in recentMistakes
>      - If repeated: hintLevel = min(3, maxHintLevel)
>      - If first time: hintLevel = 2
>      - responseType = "hint"
>    - If severity == "moderate":
>      - responseType = "hint", hintLevel = 1
>    - If severity == "minor":
>      - responseType = "nudge", hintLevel = 1
>
> 6. Never exceed coachingPolicy.maxHintLevel.
> 7. If coachingPolicy.saveForPostmortemWhenPossible and severity != "critical":
>    - Set responseType = "postmortem_note", shouldRespond = false
>
> Write unit tests covering all branches: correct bid (silent), acceptable variation (silent), first-time suboptimal (nudge), repeated mistake (escalated hint), critical error (level 2–3), hint button escalation, maxHintLevel cap, postmortem save preference.

**Depends on:** Step 1 (types), Step 2 (MistakeRecord).

**Done when:** All policy branches are tested. The engine correctly escalates hints for repeated mistakes and respects maxHintLevel.

---

## Step 7 — LLM Response Generator

**What to build:** The component that takes the assembled context (evaluation, knowledge chunks, learner state, intervention decision) and calls an LLM to produce a learner-facing coaching message.

**Prompt for Claude Code:**

> In `platform/llm/`, build the LLM integration layer.
>
> Build a **PromptBuilder** class that assembles the LLM prompt from:
> - commonCoachPackage: CommonCoachPackage
> - evaluationResult: EvaluationResult
> - retrievedChunks: KnowledgeChunk[]
> - interventionDecision: InterventionDecision (from Step 6)
> - activityContext: any (the current game state — hand, auction, etc.)
>
> The prompt should follow this structure:
>
> ```
> System: You are an adaptive bridge coach for a mobile learning app.
> The learner is at {skillLevel} level. Their current goal is: {currentLearningGoal}.
> Coaching style: {feedbackStyle}. Explanation depth: {explanationDepth}.
>
> IMPORTANT: Keep responses concise for mobile display.
> - Nudge: 1–2 sentences max. Ask a guiding question.
> - Hint level 1: Ask a question that leads the learner toward the concept. Do NOT name the answer.
> - Hint level 2: Name the relevant concept or rule. Do NOT state the correct action.
> - Hint level 3: Suggest the direction without stating the exact bid/play. e.g., "Consider your major suits."
> - Hint level 4: Explain the correct action and why. This is the most the coach reveals.
> - Never start at level 4 unless the learner has explicitly requested maximum help.
>
> User: The learner made this bidding decision:
> Hand: {hand}
> Auction so far: {auction}
> Learner's bid: {learnerBid}
>
> Evaluation: {correctness}, the recommended bid is {bestAction}.
> Reason: {explanation}
> Related concepts: {conceptIds}
>
> Relevant teaching material:
> {retrieved chunks content, joined}
>
> Learner's recent mistakes: {recentMistakes summary}
>
> Generate a {responseType} at hint level {hintLevel}.
> ```
>
> Build an **LLMClient** class:
> - Uses the Anthropic API (Claude Sonnet) via fetch to https://api.anthropic.com/v1/messages
> - Method: generateCoachResponse(prompt: string): Promise<string>
> - Handles errors gracefully (returns a fallback message if the API fails)
> - Set max_tokens to 300 (keeps responses mobile-friendly)
>
> Build a **ResponseGenerator** class that ties it together:
> - Takes all the inputs, uses PromptBuilder to build the prompt, calls LLMClient, wraps the result in an AdaptiveCoachResponse object
> - If interventionDecision.shouldRespond is false, return { type: "silent" } without calling the LLM
>
> Write tests with mocked LLM responses verifying:
> - Silent decisions don't call the LLM
> - Prompt correctly includes all context
> - Response is wrapped in AdaptiveCoachResponse format
> - Hint level instructions match the decision

**Depends on:** Step 1 (types), Step 6 (InterventionDecision).

**Done when:** Given an evaluation result and intervention decision, the generator produces a well-formatted AdaptiveCoachResponse. Silent decisions skip the LLM call.

---

## Step 8 — Adaptive Coach Runtime Pipeline

**What to build:** The main orchestrator that wires everything together: receives an event, calls the evaluator, retrieves knowledge, decides intervention, generates response, updates the learner model.

**Prompt for Claude Code:**

> In `platform/coach-runtime/`, build the **AdaptiveCoachRuntime** class.
>
> This is the central pipeline. It receives an ActivityEvent and produces an AdaptiveCoachResponse.
>
> Constructor takes:
> - evaluator: EvaluatorContract (the bridge evaluator from Step 4)
> - knowledgeRetriever: KnowledgeRetriever (from Step 5)
> - interventionEngine: InterventionPolicyEngine (from Step 6)
> - responseGenerator: ResponseGenerator (from Step 7)
> - learnerStore: LearnerStore (from Step 2)
>
> Main method — **processEvent(event: ActivityEvent\<any\>, gameState: any): Promise\<AdaptiveCoachResponse\>**:
>
> 1. **Evaluate:** Call evaluator.evaluate(gameState, event.action) → EvaluationResult
>
> 2. **Get learner context:** Call learnerStore.getCommonCoachPackage(event.actorId, event.domainId) → CommonCoachPackage
>
> 3. **Retrieve knowledge:** Call knowledgeRetriever.retrieve(evaluationResult.conceptIds, "beginner") → KnowledgeChunk[]
>
> 4. **Decide intervention:** Call interventionEngine.decide(evaluationResult, commonCoachPackage.coachingPolicy, learnerProfile.recentMistakes, currentHintLevel, isHintRequest) → InterventionDecision
>
> 5. **Generate response:** Call responseGenerator.generate(commonCoachPackage, evaluationResult, retrievedChunks, interventionDecision, gameState) → AdaptiveCoachResponse
>
> 6. **Update learner model:** Call learnerStore.updateSkillState(event.actorId, event.domainId, evaluationResult.skillIds[0], evaluationResult)
>
> 7. **Return** the AdaptiveCoachResponse
>
> Also track hint level state per decision point (reset when a new deal starts or new decision point is reached).
>
> Write an integration test that:
> - Creates a learner profile
> - Sends a bid_made event with an incorrect bid
> - Verifies the full pipeline returns a hint response
> - Sends a hint_requested event
> - Verifies the hint level escalates
> - Checks the learner model was updated with the mistake

**Depends on:** Steps 2, 4, 5, 6, 7.

**Done when:** The integration test passes end-to-end. One event in, one coaching response out, learner model updated.

---

## Step 9 — Session Engine

**What to build:** A lightweight session manager that tracks the lifecycle of a learning session and logs all events and coach interactions.

**Prompt for Claude Code:**

> In `platform/session/`, build a **SessionEngine**.
>
> **Session type:**
> - sessionId: string
> - learnerId: string
> - domainId: string
> - startedAt: string
> - endedAt?: string
> - status: "active" | "completed" | "abandoned"
> - events: SessionEvent[] (append-only log)
> - coachInteractions: CoachInteraction[]
>
> **SessionEvent:**
> - eventId: string
> - eventType: string
> - timestamp: string
> - payload: any
>
> **CoachInteraction:**
> - interactionId: string
> - triggerEventId: string (which event caused this)
> - response: AdaptiveCoachResponse
> - timestamp: string
>
> **SessionEngine** class:
> - startSession(learnerId, domainId): Session
> - logEvent(sessionId, event: ActivityEvent\<any\>): void
> - logCoachInteraction(sessionId, triggerEventId, response: AdaptiveCoachResponse): void
> - endSession(sessionId): Session (returns the complete session with all logs)
> - getSession(sessionId): Session
>
> **SessionStore** (in-memory, Map-backed):
> - save(session): void
> - get(sessionId): Session | null
> - getByLearner(learnerId): Session[] (for history)
>
> Update the AdaptiveCoachRuntime (Step 8) to accept an optional SessionEngine and automatically log events and coach interactions when one is provided.
>
> Write tests:
> - Start session, log 3 events and 2 coach interactions, end session
> - Verify the complete session contains all logged data
> - Verify getByLearner returns correct sessions

**Depends on:** Step 1 (types), Step 8 (runtime integration).

**Done when:** Sessions track the full history of events and coach interactions. The runtime automatically logs to the session when one is active.

---

## Step 10 — End-to-End Integration Test

**What to build:** A comprehensive test that simulates a complete Beginner 1 coaching session — multiple hands, multiple bids, hint requests, mistake tracking, and hint escalation.

**Prompt for Claude Code:**

> Create an integration test file at the project root that exercises the entire Phase 1 coaching loop.
>
> The test should:
>
> 1. **Setup:**
>    - Initialize all components: LearnerStore, KnowledgeRetriever (loaded from the Beginner 1 JSON), Bridge Evaluator, InterventionPolicyEngine, ResponseGenerator (with mocked LLM — return predictable strings), SessionEngine, AdaptiveCoachRuntime
>    - Create a learner profile with beginner level, gentle feedback style, short explanation depth
>    - Start a session
>
> 2. **Scenario A — Correct bid (coach stays silent):**
>    - Hand: ♠AKJ87 ♥Q4 ♦K92 ♣J54 (14 HCP, 5 spades)
>    - Learner bids: 1♠
>    - Assert: response type is "silent"
>    - Assert: learner model shows SKILL_OPENING_1SUIT exposure +1, correct +1
>
> 3. **Scenario B — Incorrect bid (coach hints):**
>    - Hand: ♠KQ874 ♥A3 ♦K92 ♣J54 (13 HCP, 5 spades)
>    - Learner bids: 1NT (incorrect — not 15–17 balanced)
>    - Assert: response type is "hint", level is 2 (major mistake)
>    - Assert: response metadata includes CONCEPT_OPENING_BID
>    - Assert: learner model shows SKILL_OPENING_1SUIT mistake +1
>
> 4. **Scenario C — Hint escalation:**
>    - Same decision point as Scenario B
>    - Learner sends hint_requested event
>    - Assert: hint level escalates to 3
>    - Learner sends another hint_requested
>    - Assert: hint level escalates to 4 (or caps at maxHintLevel)
>
> 5. **Scenario D — Repeated mistake detection:**
>    - New hand, same concept (opening bid)
>    - Hand: ♠5 ♥AKQ74 ♦J92 ♣K854 (14 HCP, 5 hearts)
>    - Learner bids: 1♣ (incorrect — should open 1♥ with 5-card major)
>    - Assert: intervention engine recognizes repeated CONCEPT_OPENING_BID mistake
>    - Assert: hint level is higher than first-time default (escalated due to pattern)
>
> 6. **Scenario E — Response to partner's opening:**
>    - Partner opened 1♠
>    - Learner hand: ♠Q93 ♥K74 ♦J852 ♣T63 (7 HCP, 3 spades)
>    - Learner bids: 2♠ (correct — simple raise)
>    - Assert: response type is "silent"
>    - Assert: SKILL_SIMPLE_RAISE exposure +1, correct +1
>
> 7. **Teardown:**
>    - End session
>    - Assert: session contains all events and coach interactions
>    - Assert: learner model reflects cumulative skill state changes
>
> If the LLM client is mocked, have the mock return different strings based on hint level so you can verify the right level was requested.

**Depends on:** All previous steps (2–9).

**Done when:** The full integration test passes. The coaching loop works end-to-end: events in, appropriate responses out, learner model evolving, session logged.

---

## Step 11 — API Layer (for Mobile Client)

**What to build:** A simple REST API that exposes the coaching runtime to a mobile frontend. This is the interface the mobile app will call.

**Prompt for Claude Code:**

> Create a lightweight Express.js (or Fastify) API server that exposes the coaching runtime for a mobile client.
>
> **Endpoints:**
>
> `POST /api/learners`
> - Body: { name, preferences: { feedbackStyle, explanationDepth } }
> - Creates a learner profile
> - Returns: { learnerId, profile }
>
> `GET /api/learners/:learnerId`
> - Returns the learner profile including skill states
>
> `POST /api/sessions`
> - Body: { learnerId, domainId }
> - Starts a new session
> - Returns: { sessionId }
>
> `POST /api/sessions/:sessionId/events`
> - Body: an ActivityEvent (eventType, action payload)
> - Passes the event through the AdaptiveCoachRuntime
> - Returns: { response: AdaptiveCoachResponse }
> - This is the main endpoint the mobile app calls on every learner action
>
> `POST /api/sessions/:sessionId/hint`
> - Requests a hint for the current decision point
> - Returns: { response: AdaptiveCoachResponse }
>
> `POST /api/sessions/:sessionId/end`
> - Ends the session
> - Returns: { session: Session } (summary with all events and interactions)
>
> `GET /api/sessions/:sessionId`
> - Returns the current session state
>
> The server should:
> - Initialize all components on startup (LearnerStore, KnowledgeRetriever with loaded Beginner 1 content, BridgeEvaluator, InterventionPolicyEngine, ResponseGenerator, SessionEngine, AdaptiveCoachRuntime)
> - Handle errors gracefully and return appropriate HTTP status codes
> - Keep responses JSON and compact (mobile-friendly payloads)
>
> Write a test that calls the API endpoints in sequence simulating a mobile client interaction:
> 1. Create learner
> 2. Start session
> 3. Send bid_made event → get coach response
> 4. Request hint → get escalated response
> 5. End session → get summary

**Depends on:** Step 8 (runtime), Step 9 (session engine).

**Done when:** The API server starts, all endpoints work, and the sequential test simulates a complete mobile client interaction.

---

## Step 12 — Deal Generator (Beginner 1)

**What to build:** A simple deal generator that produces bridge hands suitable for Beginner 1 practice — opening bid and response scenarios.

**Prompt for Claude Code:**

> In `domains/bridge/`, create a **DealGenerator** class that produces practice deals for Beginner 1 skills.
>
> A deal is:
> - dealId: string
> - dealer: "N" | "E" | "S" | "W"
> - vulnerability: "None" | "NS" | "EW" | "Both"
> - hands: { N: string, E: string, S: string, W: string } (each hand in format "S:AKxxx H:Qx D:Kxx C:Jxx")
> - targetSkill: string (skill ID this deal is designed to practice)
> - expectedBid: string (the correct bid for the learner)
> - position: "N" | "E" | "S" | "W" (which seat the learner sits in)
>
> The generator should support these modes:
>
> **generateOpeningBidDeal(skillId?):**
> - Randomly generate a 52-card deck and deal 4 hands
> - Ensure the learner's hand (South) matches one of these patterns:
>   - 12–21 HCP with a 5+ card major (for SKILL_OPENING_1SUIT)
>   - 15–17 HCP balanced with no 5-card major (for opening 1NT)
>   - 12–21 HCP with no 5-card major (for minor opening)
>   - 0–11 HCP (for passing)
> - Set the learner as dealer (no prior bids) or ensure no one opened before them
> - Tag with targetSkill and expectedBid
>
> **generateResponseDeal(partnerOpening: string):**
> - Generate hands where North (partner) has a hand appropriate for the given opening
> - South (learner) has a hand that tests a specific response skill
> - Set auction so that North opened the given bid, East passed
> - Tag with targetSkill and expectedBid
>
> Use rejection sampling: generate random deals, check if the learner's hand meets the criteria, retry if not (with a max retry limit).
>
> Also add an endpoint to the API (Step 11):
> `POST /api/deals/generate`
> - Body: { targetSkill?: string, mode: "opening" | "response", partnerOpening?: string }
> - Returns: a deal object
>
> Write tests verifying generated deals match their target skill criteria.

**Depends on:** Step 3 (skill constants), Step 11 (API).

**Done when:** The generator produces valid Beginner 1 deals tagged with the correct skill. Every generated deal, when fed to the evaluator (Step 4), confirms the expectedBid is indeed correct.

---

## Summary: Step Dependencies

```
Step 1  (Contracts)
  ├── Step 2  (Learner Model)
  ├── Step 3  (Bridge Plugin + Skills)
  │     └── Step 4  (Bridge Evaluator)
  ├── Step 5  (Knowledge Store + Content)
  └── Step 6  (Intervention Policy)
        └── Step 7  (LLM Response Generator)
              └── Step 8  (Coach Runtime Pipeline)
                    ├── Step 9  (Session Engine)
                    ├── Step 10 (Integration Test)
                    ├── Step 11 (API Layer)
                    └── Step 12 (Deal Generator)
```

Steps 2, 3, 5, and 6 can be built in parallel after Step 1.
Steps 4 depends on 3. Step 7 depends on 6.
Step 8 ties everything together.
Steps 9–12 build on the assembled pipeline.