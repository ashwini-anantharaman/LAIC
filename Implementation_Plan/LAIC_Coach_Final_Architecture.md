# LAIC Coach — Final Architecture and Implementation Plan

**Document type:** Consolidated architecture + build plan (the single source of truth for building the Coach)
**Consolidates:** Generalizable Coach Architecture v3 (engine), Coaching Platform Implementation Plan v2 (product/ops), adjusted to Learning Platform Implementation Plan v2 (content/runtime requirements)
**Version:** v1.0 (merged)
**Audience:** Coach engineering, platform/architecture leads, Learning Platform integrators

---

## 0. How to read this document

This document merges two levels of design into one buildable specification:

- The **engine layer** (from the Generalizable Coach Architecture, "GCA") — how one coach session actually runs: the two-layer model, the evaluator/knowledge/tool contracts, the runtime pipeline. This is the reusable core.
- The **platform layer** (from the Coaching Platform Implementation Plan, "CPIP") — how many coach configurations are authored, deployed, versioned, and governed across apps: profiles, instances, the Configuration Studio, coaching modes, APIs, and the database.

It is then **adjusted to the Learning Platform Implementation Plan ("LPIP")** so the Coach plugs into the content/runtime system it lives alongside without duplicating it or violating its boundaries.

This document is written as a ground-up build: every component described here is something to be designed and built as part of the Coach, except where a component is explicitly marked as **owned by another platform** (Learning, Bridge, or Nexus), in which case the Coach consumes it only through a defined contract and never builds it.

Section 15 is the consolidated build sequence. Section 17 lists the decisions that must be closed before or during the build.

---

## 1. The model in one paragraph

The Coach is a **UI-agnostic, domain-agnostic, configurable adaptive coaching runtime** built in two cooperating layers, deployed as many scoped instances. The **Common Layer** knows *who the learner is* across everything they do — skills, mastery, enrolled courses, goals, past interactions — independent of any single activity. The **Adaptive Layer** takes that background and combines it with *one specific activity's* evaluator, knowledge scope, and resolved policy to coach the learner moment to moment on the thing in front of them. The Coach never builds or owns knowledge, content, identity, or domain runtime; it consumes each through a narrow contract. The same engine therefore runs embedded and offline inside an application like Bridge, and online inside the Learning Platform serving Brain Bee and MindAI Bee — the difference is entirely behind the contracts.

```text
        ┌───────────────────────────────────────────────────────┐
        │                     COMMON LAYER                        │
        │   cross-domain learner model + coach interaction memory │
        │   "who is this learner, across everything they do"      │
        └───────────────────────────┬─────────────────────────────┘
                                     │ Common Coach Package (built at session open)
                                     ▼
  ┌──────────────┐    ┌───────────────────────────────────────────┐
  │  Knowledge   │◄───┤               ADAPTIVE LAYER               │
  │ (via Knowledge│    │  per-session: evaluator + knowledge scope  │
  │   Source)    │    │  + resolved policy + host tool registry     │
  └──────────────┘    │  "coach them, right now, on THIS activity"  │
                      └───────────────────────┬─────────────────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                    text intervention                    tool call
              (silent/nudge/hint/question/                (quiz, flashcards,
               explanation/reflection/rec)                 study plan, replay…)
```

---

## 2. Core design bets (the invariants)

These are the non-negotiables. Every later decision is constrained not to break them.

1. **Evaluators judge; policies decide; knowledge scopes constrain; LLMs explain; humans review high-impact assets.** Whether a learner's action is correct is determined by deterministic code or a graded model call *before* the LLM runs. The LLM only turns the verdict into words. This is what makes hint levels, guardrails, source-grounding, and silence-on-correct reliable rather than hoped-for.

2. **UI-agnostic.** The host translates its native events into a generic `ActivityEvent`; the Coach never knows whether it is inside a bridge table, a lesson page, or a dance app.

3. **Domain-agnostic.** The engine never names "bridge." A domain is a plugin (evaluator + taxonomy + knowledge source + tool registry) resolved at session-open time.

4. **Configurable, not code-forked.** New coaches are created by configuration (profiles, capability scopes, policies, knowledge scopes), never by writing a new coach codebase. One runtime, many scoped instances.

5. **Offline-capable.** The Coach must be able to run in-process with no server and no knowledge store inside an embedded app. "Offline" refers to *knowledge*: no ingestion pipeline, no vector DB required at runtime. Phrasing may still route through a server-side LLM proxy where a host chooses.

6. **Domain-isolated learner data by default.** Every learner record carries a `domainId`; dashboards filter by domain/program/entitlement. Cross-domain *awareness* inside coaching is a policy-gated feature, off by default (LPIP requirement, see §5.4 and §9).

7. **Bounded, policy-gated agency (not an open agent).** The Coach may take *multiple* steps within one conversational turn — ask, retrieve, propose a tool, fold the result into a reply — so it can support a "chat with me" assistant that does several things at once. But every step re-passes scope, capability, and gating checks, is bounded by a `maxOrchestrationSteps` limit, and is traced. The LLM only *phrases* and *selects among already-allowed options*; it never decides correctness or bypasses a guardrail. This is orchestration under guardrails, not a free-roaming multi-agent system.

---

## 3. Layer / runtime / instance vocabulary

The build must keep these distinct (this is the CPIP runtime-vs-instance split, reconciled with GCA's two layers).

| Layer | Meaning | Source |
|---|---|---|
| Coach Core Runtime | The reusable engine: Common Layer + Adaptive Layer + pipeline. Observes, evaluates, decides, retrieves, responds, updates. | GCA §4–6 |
| Domain Plugin | What an activity *means*: taxonomy, event shapes, evaluator, knowledge source, tool registry. | GCA §7 |
| Coach Profile | A versioned, deployable, admin-authored record: purpose, audience, domain, references to policy/scope/evaluators/tools, status, owner. | CPIP §7 |
| Coaching Policy | The resolved behavioral rules: intervention mode, hint policy, explanation policy, question policy, reflection, recommendation, model-update. | CPIP §9 / GCA §11 |
| Knowledge Scope | The approved packages/concepts/skills/sources/objects a coach may use in a context. The primary guardrail. | CPIP §10 |
| Coach Instance | A published profile deployed to a concrete place: app, course, learning object, bridge table, review screen, human-coach workspace. | CPIP §7.1 |
| Coaching Mode | How the instance is active right now: passive, on-demand, guided tutor, live coach, postmortem, guided replay, human-coach assistant. | CPIP §5 |

**Naming reconciliation (resolved decision).** GCA and CPIP each defined a type called `CoachProfile` meaning different things. In this merged spec:
- **`CoachProfile`** = the outer deployable record (CPIP §7 meaning).
- The inner behavioral object GCA called `CoachProfile` is renamed **`CoachingPolicyProfile`** and is what `CoachProfile.coachingPolicyId` resolves to (§8). No two types share a name.

---

## 4. Two integration / deployment modes

The engine is identical in both modes; only what sits behind the knowledge contract and where knowledge comes from differ. This is why one runtime can serve an embedded Bridge app and the online Learning Platform.

| | **Application mode** (Bridge, embedded) | **Platform mode** (Learning Platform: Brain Bee, MindAI Bee) |
|---|---|---|
| Knowledge origin | Pre-authored, hand-tagged, baked in at build time | Learning Studio-published objects, ingested + auto-tagged |
| Knowledge store | Bundled package, in-process | Server-side vector store, queried over HTTP |
| Knowledge scope | Single domain, one base | Potentially many courses per learner |
| Runtime deps for knowledge | None | Server + DB + embedder |
| Who produces knowledge | You, offline, ahead of time | Learning Platform ingestion |
| Coach engine | Same | Same |

**One principle:** one `KnowledgeChunk` contract, two producers (authored / ingested), three retrieval adapters (bundled / platform / multi-scope).

---

## 5. Common Layer — the cross-domain learner model

### 5.1 Purpose
Answers "who is this learner, across everything they do?" *before* any specific activity is considered. This is what makes the Coach feel like it knows the person, not just the current task.

### 5.2 Cross-domain Learner Profile Store
**Decision:** one Learner Profile Store per learner, keyed by learner ID, holding skills and mastery across all domains, each skill namespaced by the domain/course it belongs to. It is explicitly not siloed per domain — but see §5.4 for the isolation constraint LPIP imposes on *how it is surfaced*.

```ts
interface LearnerProfile {
  learnerId: string;
  skills: Record<SkillId, SkillState>;   // "bridge.opening_bid", "brainbee.memory_consolidation"
  enrolledScopes: ScopeId[];             // courses/classes/domains they can access
  goals: LearningGoal[];
  weakSkillHistory: WeakSkillRecord[];
  preferences: LearnerPreferences;       // feedbackStyle, explanationDepth, interruptionTolerance
}
interface SkillState {
  skillId: SkillId; domain: string; mastery: number; // 0–1
  attempts: number; lastSeen: string; recentMistakes: MistakeRef[];
}
```

This one physical store is projected into CPIP's `LearnerDomainProfile` (§CPIP 11.1) per domain by filtering on `domain`. The storage is unified; every *view* is domain-filtered.

### 5.3 Coach Interaction Memory (past chats)
The Coach's own record of what it and the learner have said and done — coach-owned, distinct from knowledge. Two uses: (a) *informing policy* — recent mistakes/interactions bias the intervention decision; (b) *conversational recall* — answering "what did we cover last week?" via a second retrievable source, separate from `KnowledgeSource`.

```ts
interface InteractionMemory {
  recall(q: { learnerId: string; text?: string; sinceDays?: number; topK?: number })
    : Promise<InteractionRecord[]>;
}
```

**Conversation thread vs. long-term memory.** The *active* multi-turn thread (the running chat within one session) is distinct from this long-term Interaction Memory. The thread is short-lived working context for the current conversation and drives the bounded orchestration loop (§6.3); Interaction Memory is the durable, cross-session record that `recall()` queries. A conversational turn reads the thread for immediate context and writes each turn into Interaction Memory for later recall.

### 5.4 Domain isolation vs. cross-domain awareness (LPIP adjustment)
LPIP requires domain-isolated progress by default; cross-domain aggregation must be opt-in and admin-level. GCA's Common Layer surfaces cross-domain awareness by default. **Resolution:** store cross-domain (§5.2), but treat `crossScopeAwareness` as a **policy-gated field, OFF by default**. The Coach references other courses in dialogue only when the resolved policy enables it. This keeps GCA's unified store while satisfying LPIP's isolation rule.

### 5.5 Common Coach Package
At session open, the Common Layer produces one package the Adaptive Layer consumes as context:

```ts
interface CommonCoachPackage {
  learnerSummary: string;
  weakSkills: SkillId[];
  activeGoals: LearningGoal[];
  resolvedPolicy: CoachingPolicy;     // collapsed config (§8)
  preferences: LearnerPreferences;
  crossScopeAwareness: ScopeId[];     // populated ONLY if policy enables it (§5.4)
}
```

---

## 6. Adaptive Layer — the per-session runtime

### 6.1 Session open
```text
openCoachSession({ learnerId, domainId, coachInstanceId, enrolledScopes, activityContext }) →
  1. resolve domain plugin by domainId                 (§7)
  2. build Common Coach Package for learnerId          (§5.5)  ← COMMON LAYER
  3. resolve CoachingPolicy from config chain          (§8)
  4. resolve KnowledgeScope + wire KnowledgeSource     (§11)   ← single or multi-scope
  5. bind host tool registry from the plugin           (§10)
  6. return a CoachSession bound to all of the above           ← ADAPTIVE LAYER
```

### 6.2 The runtime pipeline
This unifies GCA's five-stage pipeline with CPIP's named sub-stages — they are the same pipeline at different granularity.

```text
ActivityEvent (host-translated)
  → Observation Builder            (record what happened; CPIP §13.1)
  → Context Builder                (assemble learner + activity context)
  → Evaluator.evaluate             → EvaluationResult (deterministic OR graded, §7.2)
  → Diagnosis Builder              (interpret educationally; CPIP §13.2)
  → InterventionPolicyEngine.decide → { intervention, hintLevel?, allowedTools[] } (§9)
  → KnowledgeSource.retrieve       → KnowledgeChunk[] (progressive disclosure by hint level, §11)
  → ResponseGenerator.generate     → text intervention OR tool_call (§12)
  → LearnerStore.updateSkillState  → mastery + mistake fold-back (§5)
  → RecommendationEngine (optional)→ Recommendation[] (§13)
  → Analytics event
```

### 6.3 Conversational interaction mode (chat)
Beyond reacting to a host `ActivityEvent`, the Coach supports a **message-driven** turn — the "chat with me" surface (e.g. a Spark.E-style assistant). A free-text learner message runs a parallel pipeline that reuses the same scope, policy, gating, memory, and trace machinery:

```text
ChatMessage (learner text)
  → Intent Router          classify: ask | answer | command(do X) | meta("what did we cover?")
  → branch by intent
      ask     → KnowledgeSource.retrieve (scope-bounded) → decide → compose
      answer  → Evaluator.evaluate → diagnose → feedback (+ recommendation, §13)
      command → gate tools (§10) → select tool + input → tool_call → ToolResult → weave
      meta    → InteractionMemory.recall (§5.3)
  → ResponseGenerator.generate   (LLM PHRASES the grounded result; deterministic offline fallback)
  → InteractionMemory.record + InterventionTrace   (every turn; §5.3, plan §3.4)
  → bounded orchestration loop   (repeat a gated step until done or maxOrchestrationSteps; bet #7)
```

The router, tool selection, and LLM phrasing sit **after** scope and gating, so a fluent conversation can never answer out of scope or fire a forbidden / answer-revealing tool. This is what lets the Coach *feel* like a conversational assistant while staying source-bound and policy-gated. LLM phrasing is optional: with no model, the reply is assembled deterministically from the retrieved chunks + citations.

---

## 7. Domain Plugin layer

A domain is the unit of "what this activity means." Adding a domain requires no core changes.

```ts
interface DomainPlugin {
  domainId: string;                       // "bridge_gameplay", "course_learning", ...
  taxonomy: { concepts: ConceptId[]; skills: SkillId[] };
  eventTypes: ActivityEventSchema[];
  evaluator: Evaluator;                   // deterministic or LLM-graded (§7.2)
  knowledgeSource: KnowledgeSource;       // bundled | platform | multi-scope (§11)
  toolRegistry?: ToolRegistry;            // this plugin's tool catalogue (§10)
  promptStrategy?: PromptStrategy;
}
registerDomain(plugin);                   // self-registration; resolved by domainId
```

**Domains for this build:**

- **`bridge_gameplay`** — deterministic evaluator, bundled tag-based knowledge, offline. The proving ground for live/postmortem/replay coaching (CPIP §18–19).
- **`course_learning`** — the Learning-Platform domain: LLM-graded evaluator (§7.2), platform-backed (optionally multi-scope) knowledge. **This is the plugin the Learning Platform's in-lesson AI helper becomes** (§14). Its content-generation functions become tools (§10), not a competing brain.
- **`mindai_bee`** — a `course_learning` deployment (concept/scenario/reflection) via configuration, or a thin variant plugin if scenario evaluation needs specialization.
- **`brainbee`** — a `course_learning` deployment via configuration (study/quiz-feedback/review).
- Future: `dance`, `singing`, `public_speaking` — same shape.

### 7.2 Evaluator layer
Two verdict shapes; both feed the same policy engine.

```ts
interface DeterministicResult {        // Bridge, rule-based
  kind: "deterministic";
  correctness: "correct" | "acceptable" | "suboptimal" | "incorrect";
  severity: number; conceptIds: ConceptId[];
}
interface GradedResult {               // course_learning, open-ended
  kind: "graded";
  correctness: "correct" | "partially_correct" | "incorrect";
  confidence: number;                  // 0–1
  partialCredit?: number;              // 0–1
  conceptIds: ConceptId[];
  rationale: string;                   // transparency / postmortem
}
type EvaluationResult = DeterministicResult | GradedResult;
```

The policy reads `confidence`/`partialCredit` when present (e.g. a low-confidence graded verdict biases toward a question rather than an assertion). The pipeline shape is unchanged — an extension, not a fork.

**Batch / historical evaluation (LPIP + CPIP modes 5–7 adjustment).** An evaluator may run over a *replayed window of stored events* rather than a live stream. This is what powers Postmortem, Guided Replay, and Human-Coach-Assistant modes. `openCoachSession` accepts `activityContext.mode = "live" | "replay" | "postmortem" | "assistant"`; in non-live modes the pipeline is fed from the Event Log / Learner Profile rather than an incoming live event.

---

## 8. Coach Configuration Model

This is design bet #4 made real: coaches are configuration, resolved through an inheritance chain into the flat `CoachingPolicy` the runtime consumes.

### 8.1 Inheritance chain
```text
Platform Default
  ↓  (overrides where permitted)
CoachingPolicyProfile   (persona, hint ladder, questioning style, intervention policy, enabled tools)
  ↓
Learning Program / Course
  ↓
Class (optional)
  ↓
Learner Preferences     (feedbackStyle, explanationDepth, interruptionTolerance)
  ↓
Current Session         (temporary overrides, e.g. assessment mode)
```

### 8.2 Deployable record and behavioral profile
```ts
// The deployable, admin-authored record (CPIP §7 meaning)
type CoachProfile = {
  id: string; name: string; description: string;
  domainId: string;                     // brainbee | mindai_bee | bridge | future
  profileType: "study_tutor" | "challenge_prep" | "live_activity_coach"
             | "postmortem_coach" | "analysis_coach" | "human_coach_assistant";
  supportedModes: CoachingMode[]; defaultMode: CoachingMode;
  coachingPolicyProfileId: string;      // → CoachingPolicyProfile (§8.3)
  knowledgeScopeId: string;             // → KnowledgeScope (§11.5)
  capabilityScopeId: string;            // → CoachCapabilityScope (§8.4)
  learnerScopePolicyId: string;
  recommendationPolicyId?: string;
  evaluatorBindings: EvaluatorBinding[]; toolBindings: ToolBinding[];
  promptTemplateSetId?: string; outputStyleId?: string;
  version: string; status: "draft" | "review" | "published" | "archived";
  ownerType: "platform" | "program" | "organization" | "human_coach"; ownerId: string;
  basePresetId?: string;                // clone lineage
  compatibility: { apps: string[]; domains: string[]; activityTypes: string[]; learnerLevels: string[] };
};

// The behavioral object the runtime resolves to (was GCA's "CoachProfile")
type CoachingPolicyProfile = {
  profileId: string; schemaVersion: string; displayName: string;
  persona: { tone: string; terminology: Record<string,string> };
  hintLadder: HintLadderConfig;         // the configurable hint ladder (§9)
  questioningStyle: "socratic" | "direct" | "mixed";
  interventionPolicy: {
    maxHintLevel: 0|1|2|3|4|5;
    allowDirectAnswer: boolean;
    interruptionTolerance: "low"|"medium"|"high";
    postmortemVsRealtime: "prefer_realtime"|"prefer_postmortem";
  };
  enabledTools: string[];               // subset of the HOST's registered tools this profile permits
  lockedFields?: string[];              // fields lower levels may NOT override
};
```

### 8.3 Resolver algorithm
```text
resolvePolicy(learner, course, session):
  policy = PLATFORM_DEFAULT
  for layer in [coachingPolicyProfile, course, class, learnerPrefs, session]:
     for field in layer:
        if field not in parent.lockedFields:
           policy[field] = layer[field]      # lower overrides higher, unless locked
  return flatten(policy) → CoachingPolicy + LearnerPreferences   # the flat shape the runtime consumes
```

The runtime consumes the flat `CoachingPolicy` (CPIP §9 shape); the resolver is what collapses the inheritance chain down into it.

### 8.4 Capability scope (what a coach may DO, independent of what it knows)
```ts
type CoachCapabilityScope = {
  id: string; name: string;
  canAnswerQuestions: boolean; canExplainConcepts: boolean; canAskSocraticQuestions: boolean;
  canGenerateHints: boolean; canEvaluateResponses: boolean;
  canRecommendLearningObjects: boolean; canRecommendPractice: boolean; canCreateFlashcardReview: boolean;
  canGeneratePostmortems: boolean; canGuideReplay: boolean;
  canSummarizeForHumanCoach: boolean; canUpdateLearnerModel: boolean; canTriggerNotifications: boolean;
  canChatConversationally: boolean; canChainTools: boolean;   // conversational assistant (§6.3, bet #7)
};
```

The *shape* of a conversational turn is further governed by resolved `CoachingPolicy` fields (§8.2): `conversationalMode` (enable the chat surface), `maxOrchestrationSteps` (the hard bound on step/tool chaining within one turn), and `canChainTools` (whether multi-step tool use is permitted). A capability the scope disables is structurally unavailable in chat exactly as elsewhere.

### 8.5 Config versioning
Each resolved `CoachingPolicy` is stamped with the `profileId` + `schemaVersion` that produced it and stored on the session, so a later postmortem or audit reads history under the settings it was created with.

### 8.6 Governance rule
A coach profile is never published directly from an LLM response. The LLM may draft prompts/templates/policy suggestions, but the stored profile, capability scope, knowledge scope, and policy are explicit, reviewable data. High-impact assets are human-reviewed before publication.

---

## 9. Intervention Policy Engine — where config becomes behavior

Deterministic, no LLM. This is where configuration becomes *behavior* rather than cosmetic prompt text.

- **Intervention mode** selects from: `silent · save_for_postmortem · nudge · question · hint · explanation · warning · reflection_prompt · recommendation · coach_alert · upgrade_prompt`.
- **`feedbackStyle` is behavioral:** `socratic` biases `responseType: "question"` and caps early hint levels at question-form; `direct` permits jumping to higher hint levels; `minimal` raises the `shouldRespond` threshold.
- **`interruptionTolerance` is read, not just stored:** low tolerance biases toward `save_for_postmortem`.
- **The hint ladder is a config object** (§8.2 `HintLadderConfig`). Generic levels 0–5 (CPIP §14): none / general reminder / relevant concept / relevant rule / directional / recommended action. Domains specialize the text.
- **Tool gating** (§10.5) is computed here: filters the host-injected registry down to `allowedTools` for this turn using each tool's `policyHints` only.
- **Capability scope** (§8.4) is a hard gate: a capability the profile disables is structurally unavailable, not merely discouraged.

---

## 10. Tool-Calling Layer — host-injected, not Coach-owned

The Coach is not an autonomous multi-agent system, and it does not own a hardcoded tool catalogue. Baking concrete tool names into the engine would violate domain-agnosticism the same way baking in "bridge" would. It *may*, however, take **multiple gated steps within one conversational turn** (propose a tool, read its result, continue) — bounded by `maxOrchestrationSteps` and re-checked against scope / capability / gating at every step (bet #7). That is orchestration under guardrails, not open-ended autonomy.

### 10.1 The inversion
The Coach defines only the *abstract capability* — a tool has a name, description, input schema, handler, and policy hints. The **host** injects its own registry at session-open via its domain plugin. The Coach never knows a tool exists until told.

```ts
interface CoachTool {
  name: string; description: string;      // description shown to the LLM
  inputSchema: object;
  handler: (input: unknown, ctx: SessionContext) => Promise<ToolResult>;  // HOST's code
  policyHints?: {
    revealsAnswer?: boolean;              // block during assessment mode
    category?: "practice" | "assessment" | "reference" | "planning";
    minHintLevel?: number;                // don't offer before the learner has struggled enough
  };
}
interface ToolRegistry { list(): CoachTool[]; }
```

`policyHints` is the tool equivalent of `chunkType` on a `KnowledgeChunk`: abstract, policy-legible metadata the Coach reasons over without knowing what the tool concretely does. A tool with no hints is treated conservatively.

### 10.2 Attachment
The registry is attached to the domain plugin (`DomainPlugin.toolRegistry`), keeping everything host-specific in one coherent unit (evaluator + knowledge + tools).

### 10.3 Runtime flow
```text
1. Host registers a ToolRegistry (or advertises a tool MANIFEST)   ← HOST decides WHAT tools exist
2. openCoachSession() binds the session to it
3. Learner acts / asks
4. GATE:    filter registry → allowedTools using policyHints        ← COACH decides WHETHER
5. SELECT:  a selector (rule-based → LLM function-calling) picks a tool from allowedTools + fills input  ← COACH decides WHICH
6. PROPOSE: the Coach emits a `tool_call` (it never executes tool logic itself)
7. EXECUTE: the HOST runs the tool — in-process handler, or its own endpoint keyed by the tool name  ← HOST's code
8. RETURN:  the host hands back a `ToolResult`, correlated by `callId`
9. WEAVE:   the Coach folds the result into its reply, and may loop to step 4 up to maxOrchestrationSteps (§6.3)
```
Selection is deterministic/rule-based first; LLM-driven function-calling is layered on later. Whether the Coach *calls* the host (co-located) or merely *returns* the `tool_call` for the host to execute (separate-service, the safe default) is a deployment choice — the contract in §10.6 is identical either way.

### 10.4 Illustrative Learning-Platform catalogue (example, not shipped by the engine)
| Example tool | Backed by (host function, LPIP) | Example policyHints |
|---|---|---|
| `request_quiz` | Learning Platform `generate-questions` / quiz builder | `category: "assessment"` |
| `request_flashcards` | Learning Platform `generate-flashcards` | `category: "practice"` |
| `request_study_plan` | Recommendation engine + Weak-Skill Detector | `category: "planning"` |
| `recommend_review_block` | Recommendation engine → LPIP object | `category: "reference"` |
| `launch_domain_activity` | LPIP domain-activity launch (e.g. Bridge practice) | `category: "practice"` |

Bridge would register an entirely different catalogue (hint expansion, guided-replay step, postmortem section). Plain `chat()` needs no tool — it is answered via `KnowledgeSource.retrieve()` directly.

### 10.5 Safety property
A tool tagged `revealsAnswer: true` is *structurally absent* from `allowedTools` during assessment mode — the LLM never sees it and therefore can never choose it. Same guarantee as bet #1, applied to actions.

### 10.6 Tool-execution contract
A tool call and its result are plain data, so the same contract works in-process or across a service boundary:
```ts
interface ToolCall   { callId: string; tool: string; input: unknown; }
interface ToolResult { callId: string; ok: boolean; data?: unknown; error?: string; }
```
- **Discovery.** The host either injects a `ToolRegistry` (in-process) or advertises a **manifest** (`name`, `description`, `inputSchema`, `policyHints`, endpoint) that the Coach fetches at session open. MCP is a compatible standard for the manifest/transport.
- **Execution model.** Default (safe for a shared, multi-host Coach): the Coach *proposes* a `ToolCall` and the **host executes** it in its own auth context, returning a `ToolResult`. A co-located deployment may instead let the Coach invoke the host handler directly.
- **Correlation.** `callId` ties a returned `ToolResult` to the turn that proposed it, enabling the bounded orchestration loop (§6.3, bet #7).
- **Guardrail preserved.** Moving execution to HTTP does not weaken safety: the Coach can still only invoke a tool the host advertised *and* the gate allowed.

---

## 11. The Knowledge Contract

The entire surface between the Coach and the outside world for knowledge. Nothing else about how knowledge is produced leaks in. This is the seam where the Learning Platform's content enters the Coach.

### 11.1 `KnowledgeChunk` — the data shape (JSON Schema, versioned)
```json
{
  "title": "KnowledgeChunk", "type": "object",
  "required": ["id", "content", "schemaVersion"],
  "properties": {
    "schemaVersion": { "type": "string" },
    "id": { "type": "string" }, "content": { "type": "string" },
    "conceptIds": { "type": "array", "items": { "type": "string" } },
    "skillIds":   { "type": "array", "items": { "type": "string" } },
    "chunkType":  { "type": "string",
      "enum": ["rule","example","explanation","misconception","hint_template","drill_prompt"] },
    "difficulty": { "type": "string", "enum": ["beginner","intermediate","advanced"] },
    "scopeId": { "type": "string" }, "citation": { "type": "string" },
    "pageStart": { "type": "integer" }, "pageEnd": { "type": "integer" },
    "timeStart": { "type": "number" }, "timeEnd": { "type": "number" },
    "score": { "type": "number" }, "embedding": { "type": "array", "items": { "type": "number" } }
  }
}
```

- Only `id`, `content`, `schemaVersion` are required at the type level, but **producers must populate `conceptIds`/`skillIds`/`chunkType`** because hint disclosure keys off `chunkType`. Platform ingestion runs an LLM auto-tag step with a safe default (`chunkType: "explanation"`) on failure — never a silently untagged chunk.
- **Schema-first:** types are *generated* from this schema on both sides (`json-schema-to-typescript` for the Coach; `datamodel-code-generator` for the platform), never hand-mirrored.
- **`citation` / `pageStart` / `scopeId`** carry LPIP's source-reference requirement through to the learner-facing answer, satisfying "source-bound tutoring with citations."

### 11.2 `KnowledgeSource` — the retrieval port
```ts
interface KnowledgeQuery {
  text?: string;                          // semantic query (platform/course content)
  conceptIds?: string[];                  // tag query (authored domains like bridge)
  chunkType?: string;                     // progressive disclosure by hint level
  topK?: number;
  scope?: "current" | "all" | ScopeId[];  // default "current"
}
interface KnowledgeSource { retrieve(q: KnowledgeQuery): Promise<KnowledgeChunk[]>; }
```
A **pull** port owned by the Coach: it decides *when* and *what* to retrieve, tied to the learner's action — identical whether backed by an in-process package or an HTTP call.

### 11.3 The three adapters
| Adapter | Mode | Backing | Runtime deps |
|---|---|---|---|
| `BundledKnowledgeSource` | app | pre-baked package, in-process cosine + tag-based | none |
| `PlatformKnowledgeSource` | platform | HTTP → Learning Platform `/retrieve` | server + DB |
| `MultiScopeKnowledgeSource` | platform | composite over N `PlatformKnowledgeSource`s | server + DB |

### 11.4 Multi-scope retrieval (cross-course)
A composite adapter implementing the same interface, so nothing upstream changes. `resolveScopes("all")` needs the learner's enrolled-scope list, which is platform-owned enrollment data passed into `openCoachSession({ enrolledScopes })`. Merge/rank starts cheap (per-source min-max normalization) and moves to a shared reranker only on evidence. **Gated by the same cross-domain policy as §5.4** — off by default to satisfy LPIP isolation. Bridge is untouched (one scope, defaults to `"current"`).

### 11.5 Knowledge Scope — the guardrail (CPIP §10, adjusted to LPIP objects)
`KnowledgeScope` binds a coach instance to approved content. Under the merged spec its `allowedLearningObjectIds` / `allowedSourceIds` reference **published LPIP learning objects and source documents directly**, so the scope and the Learning Platform library stay in sync.
```ts
type KnowledgeScope = {
  id: string; domainId: string;
  allowedKnowledgePackageIds: string[];
  allowedConceptIds: string[]; allowedSkillIds: string[];
  allowedLearningObjectIds?: string[];   // LPIP LearningObjectBase.id
  allowedSourceIds?: string[];           // LPIP SourceDocument.id
  forbiddenConceptIds?: string[]; forbiddenSkillIds?: string[];
  instructionalLevel: "intro"|"beginner"|"club_beginner"|"intermediate"|"advanced";
  sourcePolicy: { sourceBoundOnly: boolean; allowGeneralBackground: boolean; requireCitations: boolean };
};
```
The `RetrievalRequest` the Coach sends the Learning Platform carries `domainId`, `knowledgeScopeId`, and allowed/forbidden source ids so the platform never returns out-of-scope content. **The Coach never retrieves from the whole platform by default.**

### 11.6 Versioning
`schemaVersion` travels on every chunk. An adapter receiving an unrecognized major version rejects the chunk rather than guessing.

---

## 12. Response shape

```ts
type AdaptiveCoachResponse =
  | { type: InterventionType; message: string; level?: HintLevel;
      sources?: KnowledgeChunk[]; metadata?: Record<string,unknown> }
  | { type: "tool_call"; callId: string; tool: string; input: unknown; metadata?: Record<string,unknown> };

// A tool's outcome returns as a ToolResult (§10.6) and re-enters the pipeline:
//   tool_call → (host executes) → ToolResult → Coach weaves it into the next response.
```
The generator moves from "always a message" to "a message *or* a cleared tool call." In a conversational turn (§6.3) these alternate — `tool_call → tool_result → message` — bounded by `maxOrchestrationSteps`. `sources` carries citations back to the UI to satisfy LPIP source-grounding.

---

## 13. Recommendation Engine

Deterministic rules first; ML later. Outputs reference LPIP objects so the Learning Platform renders them.
```ts
type Recommendation = {
  id: string; learnerId: string; domainId: string;
  reason: string; recommendationType: string;   // review_block | flashcard_set | quiz_retry | next_lesson
                                                 // | tutorial | drill | practice_hand | postmortem_review
                                                 // | reflection | assessment | human_coach_review | guided_replay
  targetObjectId?: string;                       // LPIP learning object id
  priority: "low"|"medium"|"high"; evidenceRefs: string[];
  status: "active"|"accepted"|"dismissed"|"completed"|"expired";
  generatedBy: "rule"|"coach"|"llm_assisted"|"human_coach"; createdAt: string;
};
```
Starter rules: quiz miss → review block/flashcards; same concept missed twice → tutorial review; repeated bridge mistake category → drill/practice hand; many hints → prerequisite review; postmortem flags concept → related tutorial.

---

## 14. Integration with the Learning Platform (the LPIP adjustment)

This section is the heart of "adjusted to LPIP." It states exactly how the Coach plugs into the existing content/runtime system without duplicating or violating it.

### 14.1 Boundary (who owns what)
```text
Nexus            → identity, orgs, access, roles, entitlements
Learning Platform→ learning objects, Studio authoring, publishing, course runtime, progress,
                   source ingestion, AND the knowledge /retrieve endpoint (see §14.5)
Bridge Platform  → bridge runtime, boards, tables, AI players, BEN, LIN/PBN, game events
Coach (this doc) → coach profiles/instances, policies, scopes, observation→diagnosis→intervention,
                   hints, explanations, reflection prompts, recommendations, postmortems,
                   learner model, human-coach assistant
```
LPIP explicitly disclaims "deep real-time coaching, live hints, adaptive coach runtime, postmortem coaching" — those are the Coach's. The Coach explicitly disclaims content, ingestion, identity, and domain runtime.

### 14.2 The in-lesson AI helper is a `course_learning` Coach session (key integration)
LPIP §9.8 specifies a lightweight, source-bounded in-lesson AI helper (the "AI Explainer Block," reached via `POST /api/runtime/ai/ask`). **Build this helper as a `course_learning` Coach session from the start — not as a separate, self-contained chatbot inside the Learning Platform.** Routing it through the Coach is what gives the in-lesson helper memory, hint escalation, intervention policy, guardrails-as-policy, and the toolbelt, instead of a thin stateless Q&A box that would later have to be rebuilt.

Concretely: the lesson page opens a Coach session scoped to `course_learning`, passing the current lesson/course and learner ID. The Coach answers using its evaluator, resolved policy, memory, and the Knowledge Scope (§11.5) — the Learning Platform never hand-rolls that logic. The `AIExplainerBlockConfig` fields (`allowedContext`, `sourceBounded`, `allowQuizMe`, `allowFlashcardCreation`, `maxResponseLength`) map onto the Coach's KnowledgeScope + CapabilityScope + tool registry rather than a separate feature.

### 14.3 De-risked rollout (mandatory)
```text
1. Build the course_learning plugin + LLM-graded evaluator + eval harness.
2. Enable it BEHIND A FLAG on ONE test course first.
3. Validate grading quality + guardrail/source-grounding parity against the intended
   source-bound behavior before widening.
4. Enable it as the default in-lesson helper across courses only once it is proven
   to meet the source-grounding and guardrail bar on the test course.
```

### 14.4 Event flow (LPIP → Coach), no back-writing of content
The Learning Platform stays the system of record for content and progress; the Coach is the system of record for understanding and help.
```text
Student misses quiz question
  → Learning Platform records quiz_attempted event (LPIP /api/runtime/events)
  → Learning Platform forwards it as an ActivityEvent (LPIP /api/progress/signals → Coach /api/coaching/events)
  → Coach diagnoses missed concept, updates learner model
  → Coach emits a Recommendation referencing an LPIP object id
  → Learning Platform renders the recommended review block / flashcard / retry
```
`ActivityEvent.sourcePlatform = "learning"`, `activityType ∈ {lesson, quiz, flashcard, reflection, assignment}`, `contextRefs.learningObjectId` = the LPIP object. No Coach writes into LPIP content tables.

### 14.5 The knowledge grounding pipeline — the one prerequisite to assign
All three documents assume grounded answers come from approved, published sources, but none fully owns the pipeline that turns a **published LPIP course into queryable `KnowledgeChunk`s** (parse → chunk → tag → embed → store → serve `/retrieve`). This is the single hard dependency for `course_learning` and must be assigned before Phase D.

**Decision for this build:** the Learning Platform owns ingestion and the `/retrieve` endpoint (per LPIP it owns source ingestion, `ParsedSourceUnit`, and the vector store). It publishes chunks conforming to §11.1 and serves the `RetrievalRequest` contract in §11.5. The Coach only calls `retrieve()`. If a separate dedicated retrieval/RAG service is introduced later, the Learning Platform proxies to it — transparent to the Coach.

### 14.6 Domain-activity launches stay a hand-off
LPIP's `BridgeLearningActivityLaunch`/`Result` (course-progress-level signals: score, summary, `bridgeSignalIds`) sit *downstream* of the fine-grained `ActivityEvent` stream the live Bridge Coach consumes directly from the Bridge Platform. **Constraint:** `bridgeSignalIds` must reference the Coach's own Event Log / Skill State, not a second separately-computed skill record, so the two platforms never diverge on what the learner mastered.

### 14.7 Progress isolation preserved
Coach learner-model updates are written per `domainId` and projected into LPIP's per-domain progress views. A learner's Bridge mastery never appears in a Brain Bee dashboard. Cross-domain awareness in dialogue is policy-gated off by default (§5.4).

---

## 15. Consolidated Build Sequence

Phases A–C touch only the Coach and don't depend on the Learning Platform; Phase D is where LPIP integration and its risk concentrate. This merges GCA's A–D sequencing with CPIP's 9-phase plan.

```text
PHASE A — Foundations (no behavior change)
  A1. Formalize KnowledgeChunk JSON Schema + generated types (§11.1)
  A2. Wrap existing retriever as BundledKnowledgeSource behind the port (§11.3)
  A3. Make Learner Profile Store explicitly cross-domain, domain-namespaced (§5.2)
  A4. Define shared contracts: CoachProfile, CoachInstance, CoachingPolicy,
      KnowledgeScope, ActivityEvent, CoachIntervention, Recommendation,
      LearnerDomainProfile (CPIP Phase 1)

PHASE B — Make configuration real ("configurable coach")
  B1. CoachingPolicyProfile schema + resolver + config versioning (§8)
  B2. Wire feedbackStyle / interruption / configurable hint ladder into policy (§9)
  B3. Capability scope enforcement (§8.4)
  B4. chat() conversation window (§6)
  B5. Coach profile registry + Configuration Studio: presets, clone, preview,
      publish, deploy-as-instance (CPIP Phase 2)

PHASE C — Interaction surface + lightweight tutoring
  C1. Tool-calling layer: engine shape + policyHints gating + response variant (§10,§12)
  C2. Coach Interaction Memory recall (§5.3)
  C3. Event ingestion API + observation store (CPIP Phase 3)
  C4. Lightweight study-tutor mode for Brain Bee / MindAI Bee, using bundled/tagged
      knowledge and a rule-based evaluator (before the graded course_learning path):
      lesson-scoped Q&A, quiz feedback, missed-topic review, recommendations,
      reflection prompts, source-bound explanations (CPIP Phase 4)

PHASE D — Platform convergence (highest risk, behind a flag)
  D1. course_learning plugin + LLM-graded evaluator + eval harness (§7.2)
  D2. PlatformKnowledgeSource + MultiScopeKnowledgeSource against /retrieve (§11)
  D3. Flagged enablement of the graded course_learning helper as the default
      in-lesson coach, once it meets the source-grounding/guardrail bar (§14.2–14.3)

PHASE E — Bridge depth (parallel to C/D; uses the same runtime)
  E1. Bridge passive + postmortem coaching (batch evaluator, §7.2) (CPIP Phase 5)
  E2. Bridge live coaching: before/after-commit hooks, hint ladder, live panel (CPIP Phase 6)
  E3. Guided replay + LIN/PBN import review (CPIP Phase 7)

PHASE F — Human coach + governance
  F1. Human-coach-assistant light: summaries, repeated mistakes, suggested
      assignments, coach notes (CPIP Phase 8)
  F2. Admin/review/quality: trace outputs to sources/events, review low-confidence
      responses, disable instances, audit model updates (CPIP Phase 9)
```

---

## 16. APIs, persistence, and stack

### 16.1 Coach APIs (CPIP §23)
```http
POST /api/coaching/sessions        GET  /api/coaching/sessions/:id
POST /api/coaching/events          POST /api/coaching/interventions
POST /api/coaching/hints           POST /api/coaching/questions
POST /api/coaching/explanations    POST /api/coaching/reflections
POST /api/coaching/postmortems     POST /api/coaching/recommendations/generate
GET  /api/coaching/recommendations?learnerId=&domainId=
PATCH /api/coaching/recommendations/:id
GET  /api/coaching/instances/:id   GET  /api/coaching/profiles/:id
```
Learning Platform → Coach bridge: LPIP `POST /api/progress/signals` and `POST /api/runtime/events` forward into `POST /api/coaching/events`. Knowledge: Coach → Learning Platform `POST /retrieve` (the §11.5 `RetrievalRequest`).

### 16.2 Database tables (CPIP §24)
```text
coach_profiles · coach_profile_versions · coach_profile_presets · coach_capability_scopes
coach_instances · coaching_policies · coaching_policy_profiles · knowledge_scopes
coach_preview_scenarios · coach_sessions · coach_messages · activity_events
coach_observations · coach_diagnoses · coach_interventions
learner_domain_profiles · learner_concept_states · learner_skill_states · learner_mistake_events
recommendations · postmortems · reflection_entries · interaction_memory
human_coach_profiles · human_coach_assistant_configs · coach_instance_entitlements · coach_analytics_events
```
Persistence principles: raw events separate from learner model; store outputs with input context + source refs; version profiles/scopes/policies; preserve preset/clone lineage; enforce domain isolation; keep human notes separate from AI notes; full traceability for every hint/recommendation.

### 16.3 Stack (aligned with CPIP §25 and LPIP §22)
TypeScript · React/Next.js embedded components · Postgres · pgvector (or the Learning Platform's `/retrieve`) · durable event table first, queue later · model-router LLM layer · auth from Nexus. Start as an integrated module; split into a service when event processing, LLM scaling, background recommendations, or multi-app demand require it.

### 16.4 Coach UI components (CPIP §22)
Universal: coach button, panel, chat window, hint card, explanation card, reflection prompt, recommendation card, source-reference card, summary card, access prompt. Learning-Platform-specific: lesson-scoped panel, quiz-feedback coach, missed-concept review, flashcard recommendation, reflection panel. Bridge-specific: live sidebar, hint ladder, decision timeline, postmortem panel, guided-replay coach, learner-model panel.

---

## 17. Open decisions to close during the build

1. **Config ownership / UI (§8.6):** who edits each config level, API-only vs. an instructor-facing Studio screen.
2. **`/retrieve` ownership (§14.5):** confirmed Learning Platform in this spec; re-confirm if a separate RAG service (newtutor) is introduced, with the platform proxying.
3. **Merge/rank strategy (§11.4):** start with cheap normalization; adopt a reranker only on evidence.
4. **Interaction-memory scope (§5.3):** how far conversational recall reaches; privacy/retention for stored learner chats.
5. **LLM-graded evaluator reliability (§7.2):** grading open content well enough to drive intervention is a genuine unknown — the eval harness (D1) must pass before the graded `course_learning` helper (D3) is enabled as the default.
6. **Cross-domain awareness default (§5.4):** confirmed OFF by default per LPIP; define the admin gate that turns it on.
7. **Conversational agency bound (§6.3, §10, bet #7):** set the default `maxOrchestrationSteps` and confirm the **bounded, policy-gated** posture over an open LLM agent — the LLM phrases and selects among allowed options, never bypassing scope/gating. Revisit only with evidence.

---

## 18. Mental model (one screen)

```text
Common Layer   = who the learner is, across everything (awareness + memory), domain-namespaced.
Adaptive Layer = coach them right now on ONE activity (evaluator + knowledge + resolved policy + tools).
Domain Plugin  = what the activity means (concepts, skills, events, evaluator, knowledge, tools).
Evaluator      = judges the action (deterministic OR graded; live OR replayed).
Knowledge      = consumed, never built; single- or multi-scope; scoped by KnowledgeScope guardrail.
Tools          = HOST decides WHAT exists (injected per plugin); Coach decides WHETHER one fires now.
Config         = one runtime, many scoped instances; resolved platform→profile→course→learner→session.
Ingestion      = OUTSIDE (Learning Platform); the Coach only consumes published, tagged, cited chunks.
```

The formula:
```text
Cross-domain learner model
+ Adaptive session (evaluator + knowledge contract, consumed not built)
+ Resolved coach configuration (profile → policy → scope → capability)
+ Bounded, policy-gated tool access
+ Real-time OR replayed events
+ Domain-isolated learner data with policy-gated cross-domain awareness
= LAIC Configurable Adaptive Coach, embeddable in Bridge and the Learning Platform alike
```

The central rule: **build one configurable coaching runtime; deploy many scoped coach instances; keep player, coach, learner model, learning content, and domain runtime separate.**
