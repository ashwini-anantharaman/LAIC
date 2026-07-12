# LAIC Coach — Integration Requirements

**Audience:** Learning Platform and Bridge Platform engineering teams.
**Purpose:** everything the Coach needs *from* your platform to integrate. The Coach is a separate, domain-agnostic service; it consumes your platform through the narrow contracts below and builds none of your identity, content, domain runtime, tool execution, or UI. This document is self-contained — you should not need the other design docs to implement against it.
**Status:** contracts are stable for M0–M3; items marked *(M4)* / *(M5)* are consumed at those milestones but should be agreed now.

---

## 1. The integration model in one screen

```
YOUR PLATFORM (the host)                         THE COACH (this service)
- authenticates the learner (via Nexus)          - knows the learner across domains
- emits what the learner did  ───ActivityEvent──▶ - decides whether/how to help
- evaluates the action (or the Coach does)  ────▶ - stays in scope, cites sources
- serves knowledge  ◀───retrieve()──────────────  - proposes tool calls (never runs them)
- executes tools it owns  ◀───ToolCall───────────  - remembers + traces every turn
- renders the reply  ◀───CoachResponse───────────  - recommends next steps
```

**One rule governs everything: the Coach *proposes*; the host *executes*.** The Coach emits events, decisions, tool calls, and recommendations; your platform runs its own code (retrieval, tools, rendering, auth) and returns results. Neither side reimplements the other.

---

## 2. Ownership boundary

| The Coach owns (you consume) | Your platform owns (the Coach consumes) |
|---|---|
| Learner model, mastery, weak-skill detection | Identity, auth, entitlements (Nexus) |
| Intervention policy (whether/how/when to respond) | The UI / chat surface / rendering |
| Knowledge scope enforcement (guardrails) | Knowledge **content**, ingestion, and storage |
| Retrieval orchestration (when/what to fetch) | The **tools** and the code that executes them |
| Interaction memory, recommendations | Domain runtime (bridge engine / lesson runtime) |
| Traceability of every output | Translating native actions into `ActivityEvent` |

If, during integration, you find yourself building something in the left column, stop — that's the Coach's job. If the Coach needs something in the right column, it's a requirement below.

---

## 3. Shared contracts (the five seams)

All objects carry `schemaVersion`; reject an unrecognized **major** version rather than guessing. TypeScript shapes are authoritative.

### 3.1 `ActivityEvent` — what the learner did (host → Coach)
```ts
interface ActivityEvent {
  schemaVersion: string;
  eventId: string;              // stable + unique; used for idempotent ingest
  domainId: string;             // "course_learning" | "bridge_gameplay" | ...
  eventType: string;            // "quiz_attempted" | "bid_made" | "card_played" | ...
  timestamp: string;            // ISO-8601
  sessionId: string;
  actorId: string;              // the learnerId (Nexus identity)
  action?: object | null;       // domain-specific payload (opaque to the Coach core)
  sourcePlatform?: "bridge" | "learning" | "nexus" | "coach" | "other";
  activityType?: string;        // "lesson" | "quiz" | "bid" | "play" | ...
  contextRefs?: {               // ids the Coach echoes in recommendations/scope
    learningObjectId?: string; courseId?: string; bridgeBoardId?: string;
    [k: string]: unknown;
  };
}
```
Delivered via `POST /api/coaching/events` (see §7). At-least-once delivery is fine — the Coach de-dupes on `eventId`.

### 3.2 `EvaluationResult` — the verdict on the action
Either the host supplies it (Bridge) or the Coach computes it (course_learning). Deterministic shape (used today):
```ts
interface EvaluationResult {
  correctness: "correct" | "acceptable" | "suboptimal" | "incorrect";
  confidence: number;                 // 0–1
  bestAction?: unknown;
  conceptIds: string[];               // what concepts this involves
  skillIds: string[];                 // what skills it tests
  explanation?: string;               // machine-readable, NOT learner-facing
  severity: "minor" | "moderate" | "major" | "critical";
}
```
*(M4)* A graded variant adds `partialCredit?: number` and `rationale?: string` for open-ended answers, and allows `correctness: "partially_correct"`. If your platform emits its own verdict, provide a documented mapping from your judgment scale onto `correctness` + `severity`.

### 3.3 `KnowledgeChunk` + `RetrievalRequest` — grounding (Coach → host `/retrieve`)
```ts
interface KnowledgeChunk {
  schemaVersion: string;
  id: string;
  content: string;
  conceptIds: string[];               // REQUIRED-tag rule: populate these
  skillIds: string[];                 // ...and these
  chunkType: "rule" | "example" | "explanation" | "misconception" | "hint_template" | "drill_prompt";
  difficulty?: "beginner" | "intermediate" | "advanced";
  scopeId?: string;
  citation?: string;                  // shown to the learner (source binding)
  pageStart?: number; pageEnd?: number;
  score?: number; embedding?: number[];
}

interface RetrievalRequest {
  domainId: string;
  knowledgeScopeId?: string;          // the coach instance's approved scope
  text?: string;                      // semantic query
  conceptIds?: string[]; skillIds?: string[];
  chunkType?: string;                 // progressive disclosure by hint level
  allowedLearningObjectIds?: string[];
  allowedSourceIds?: string[];
  forbiddenConceptIds?: string[];
  topK?: number;
  scope?: "current" | "all" | string[]; // "all" (cross-course) is off by default
}
```
Producers **must** populate `conceptIds`/`skillIds`/`chunkType` (safe default `chunkType: "explanation"` on auto-tag failure) — retrieval and progressive disclosure key off them.

### 3.4 Tools — `CoachTool` descriptor, `ToolCall`, `ToolResult`
The host advertises tools; the Coach gates + selects + proposes; the host executes.
```ts
interface CoachTool {                 // a manifest entry the host advertises
  name: string;                       // the shared key
  description: string;                // read by the selector to choose it
  inputSchema: object;                // JSON Schema for the input
  endpoint?: { method: string; path: string };  // where the host executes it
  policyHints?: {
    revealsAnswer?: boolean;          // hidden in assessment mode
    category?: "practice" | "assessment" | "reference" | "planning";
    minHintLevel?: number;
  };
}
interface ToolCall   { callId: string; tool: string; input: unknown; }
interface ToolResult { callId: string; ok: boolean; data?: unknown; error?: string; }
```
The host **validates `input` against `inputSchema`** and executes as the authenticated learner. `callId` correlates the result back to the turn.

### 3.5 `Recommendation` — next step (Coach → host, host renders)
```ts
interface Recommendation {
  schemaVersion: string;
  id: string; learnerId: string; domainId: string;
  reason: string;
  recommendationType: string;         // review_block | flashcard_set | quiz_retry | tutorial | drill | practice_hand | ...
  targetObjectId?: string;            // YOUR object id (from contextRefs)
  priority: "low" | "medium" | "high";
  evidenceRefs: string[];             // eventIds behind it
  status: "active" | "accepted" | "dismissed" | "completed" | "expired";
  generatedBy: "rule" | "coach" | "llm_assisted" | "human_coach";
  createdAt: string;
}
```

### 3.6 `CoachResponse` — what the host renders (Coach → host)
```ts
type CoachResponse =
  | { type: "hint" | "question" | "explanation" | "nudge" | "reflection";
      message: string; sources?: KnowledgeChunk[]; metadata?: Record<string, unknown> }
  | { type: "tool_call"; callId: string; tool: string; input: unknown }
  | { type: "declined"; message: string }     // out of scope — do not treat as an answer
  | { type: "silent" };                        // intentionally no output (e.g. good move)
```

---

## 4. Cross-cutting requirements (both platforms)

- **Identity / auth.** Provide a Nexus-issued learner identity/token. The Coach attributes events to `actorId`; your platform authorizes Coach-proposed tool calls as that learner.
- **Domain isolation.** Stamp `domainId` on every event/signal. The Coach keeps per-domain progress isolated; do not expect one domain's mastery in another's view.
- **Versioning.** Every contract object carries `schemaVersion`. Agree the major version; reject unknown majors.
- **Idempotency.** `eventId` (events) and `callId` (tool results) must be stable so retries don't double-apply.
- **Async / non-blocking.** Do not block your runtime on the Coach. Event delivery and coach responses are asynchronous; the Coach's *decision* is fast (deterministic), but LLM *phrasing* may add latency — design the UI to accept a deferred or streamed reply.
- **Stable ids.** Object/board/source ids you send must be stable and resolvable, since the Coach echoes them in recommendations and citations.

---

## 5. Endpoints — who calls whom

**The Coach exposes (you call it):**
```
POST /api/coaching/events            ingest an ActivityEvent
POST /api/coaching/sessions          open a coaching session (learner + domain + instance)
POST /api/coaching/ask               a chat turn (conversational surface)   (integration)
GET  /api/coaching/recommendations?learnerId=&domainId=
GET  /api/coaching/observations?learnerId=
```
**Your platform exposes (the Coach calls / subscribes):**
- Learning Platform: `POST /retrieve` (§6, LR1), plus your tool endpoints (LR4).
- Bridge Platform: an event **subscription** (BR1), your tool endpoints (BR4), and the **Coach→Bridge response channel** (BR3).

---

## 6. Learning Platform — requirements (LR1–LR8)

| # | Requirement | Contract / endpoint | Milestone |
|---|---|---|---|
| **LR1** | **Knowledge retrieval.** Serve source-bound chunks for a scoped query. | `POST /retrieve` → `RetrievalRequest` (§3.3) → `KnowledgeChunk[]` | M4 |
| **LR2** | **Event forwarding.** Forward learner activity to the Coach. | map `LearningEvent` → `ActivityEvent` (§3.1) → `POST /api/coaching/events` | M3/M4 |
| **LR3** | **Route the in-lesson AI helper through the Coach.** The AI Explainer / Study Panel opens a `course_learning` Coach session, not a standalone chatbot. | `POST /api/coaching/sessions` + `/ask` | M4 |
| **LR4** | **Tool manifest + execution.** Advertise actions (generate-quiz, generate-flashcards, recommend-review-block, launch-activity) and execute the Coach's `ToolCall`s host-side. | `CoachTool` manifest + `ToolCall`/`ToolResult` (§3.4) | M3/M4 |
| **LR5** | **Stable object/source ids.** Expose learning-object and source ids the Coach references. | ids in `contextRefs` + recommendations | M3 |
| **LR6** | **Knowledge-scope binding.** Per coach instance, the approved/forbidden object/source/concept ids. | `RetrievalRequest.allowed*/forbidden*` | M4 |
| **LR7** | **Tagged-chunk ingestion.** Publish chunks with `conceptIds`/`skillIds`/`chunkType` + citations (required-tag rule). | `KnowledgeChunk` (§3.3) | M4 |
| **LR8** | **Identity/auth.** Nexus learner identity for attribution + tool authorization. | §4 | M3 |

**Learning Platform checklist:** ☐ `/retrieve` live and conformant · ☐ events forwarded · ☐ AI helper routed to a Coach session · ☐ tool manifest + host execution · ☐ stable object ids · ☐ scope binding per instance · ☐ tagged ingestion · ☐ Nexus auth.

---

## 7. Bridge Platform — requirements (BR1–BR9)

| # | Requirement | Contract / mechanism | Milestone |
|---|---|---|---|
| **BR1** | **Event subscription.** Let the Coach subscribe to the game event bus (`bid_action`, `play_action`, `session`, `deal_started`). | your `BridgeEventBase` → `ActivityEvent` (§3.1), async | M5 |
| **BR2** | **Evaluation facts.** Emit your per-action verdict; the Coach consumes it and never re-implements bridge rules. Provide a judgment→`correctness`/`severity` mapping. | `BridgeActionEvaluation` → `EvaluationResult` (§3.2) | M5 |
| **BR3** | **Coach → Bridge response / render channel (the one seam still to define).** How the Coach's output reaches the table. | `CoachResponse` (§3.3) over a subscription callback, `callId`-correlated | M5 |
| **BR4** | **Tool catalogue + execution.** Advertise bridge actions (expand-hint, step-guided-replay, open-postmortem, load-similar-deal) and execute `ToolCall`s in the table UI. | `CoachTool` manifest + `ToolCall`/`ToolResult` (§3.4) | M5 |
| **BR5** | **Position/board context.** Provide the current position + support PBN/LIN import for guided replay. | `BridgePositionSnapshot` as `action`/context | M5 |
| **BR6** | **Progress signals → learner model.** Emit signals to the Coach; `bridgeSignalIds` must reference the Coach's own skill state (no divergent second record). | `BridgeProgressSignal` | M5 |
| **BR7** | **Shared taxonomy.** Concept/skill ids aligned across evaluation, knowledge, and learner model. | `conceptIds`/`skillIds` | M5 |
| **BR8** | **Timing hooks.** Before-/after-commit hooks for live intervention; honor non-blocking. | §4 | M5 |
| **BR9** | **Identity + isolation.** `domainId="bridge"` + Nexus identity on all events/signals. | §4 | M5 |

### 7.1 Proposed BR3 channel (fill this in together)
```ts
// The Coach delivers a CoachResponse for a live/postmortem moment. Bridge renders it.
interface CoachInterventionDelivery {
  bridgeSessionId: string;
  correlationId: string;        // ties back to the triggering event/turn
  coachInstanceId: string;
  response: CoachResponse;       // §3.6 — hint/question/explanation/tool_call/declined/silent
}
// If response.type === "tool_call", Bridge executes and returns:
interface CoachToolResultCallback { callId: string; result: ToolResult; }
```
`silent` means render nothing; `declined` means the ask was out of scope — do not present it as an answer.

**Bridge Platform checklist:** ☐ event subscription · ☐ evaluation facts + mapping · ☐ **BR3 response channel agreed** · ☐ tool catalogue + host execution · ☐ position/board context + PBN/LIN · ☐ progress signals tied to Coach skill state · ☐ shared taxonomy · ☐ timing hooks · ☐ domainId + identity.

---

## 8. What the Coach provides in return

So the contract is two-way, the Coach supplies: the cross-domain learner model and mastery; the intervention decision (silent / nudge / question / hint / explanation / save-for-postmortem, levels 0–5); scope enforcement and source-grounding; interaction memory; recommendations referencing *your* object ids; postmortems; and a full audit trace of every output. None of these are built by your platform.

---

## 9. The single most important open item

Everything the two hosts must provide is specified above **except BR3** — the Coach→Bridge response/render channel — which is currently only a placeholder in the Bridge plan. It is the one contract to agree before Bridge integration can be called "seamless." The Learning Platform's equivalent (`/retrieve`, LR1) is already fully specified.
```
