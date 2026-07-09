# LAIC Coach — Implementation Plan

**Companion to:** LAIC Coach — Final Architecture and Implementation Plan (the architecture doc)
**Purpose:** the operational build plan — milestones, deliverables, dependencies, sequencing, risks, and done-criteria. The architecture doc says *what* the Coach is; this says *how and in what order to build it, and how to know each part is done.*
**Version:** v1.0

---

## 1. How to use this plan

This plan is organized around six milestones (M0–M6) that map onto the architecture's build phases (A–F), plus a preceding setup milestone (M0). Each milestone has: a goal, the deliverables that make it real, its hard dependencies, the risks that live in it, and an explicit **definition of done** you can gate on before starting the next milestone.

The plan is deliberately *not* a calendar. It is a dependency-ordered sequence with rough effort sizing (S / M / L / XL relative to each other), because real dates depend on team size and how many milestones you parallelize. Section 9 gives two example staffing shapes (solo/small vs. a split team) so you can turn the sequence into a schedule.

Guiding rule inherited from the architecture: **Phases A–C build the Coach in isolation and carry low risk; Phase D (Learning Platform convergence) is where the hard unknowns concentrate.** Do the risky thing last, behind a flag, on one course. Bridge depth (E) and human-coach/governance (F) can proceed in parallel once the core runtime exists.

---

## 2. The dependency spine (read this first)

```text
M0 Setup ─▶ M1 Foundations (A) ─▶ M2 Configurable Coach (B) ─▶ M3 Interaction + light tutoring (C)
                                                                        │
                                    ┌───────────────────────────────────┼───────────────────────────┐
                                    ▼                                   ▼                           ▼
                        M4 Platform convergence (D)          M5 Bridge depth (E)         M6 Human coach + governance (F)
                        (needs M3 + LP /retrieve)            (needs M2 + bridge events)  (needs M3; hardened after M4/M5)
```

The only strictly linear stretch is M0 → M1 → M2 → M3. After M3 the runtime is real and three tracks (M4, M5, M6) can run concurrently if you have the people. M4 has an **external dependency** (the Learning Platform's `/retrieve` endpoint) that must be committed early even though it's consumed late.

---

## 3. Cross-cutting principles the whole build must honor

These come straight from the architecture's core design bets and must be true at every milestone, not bolted on at the end.

1. **Evaluators judge; policies decide; scopes constrain; LLMs explain.** Never let an LLM be the source of truth for correctness or for whether to intervene. Every milestone that adds an LLM call adds it *after* a deterministic or graded verdict, not instead of one.
2. **Contracts are schema-first and versioned.** `KnowledgeChunk`, `ActivityEvent`, `CoachProfile`, `CoachingPolicy`, `KnowledgeScope`, `Recommendation` are defined as schemas and code is generated from them. No hand-mirrored types across service boundaries.
3. **Domain isolation is enforced in data, not convention.** Every learner record carries `domainId`; every dashboard query filters on it. Cross-domain awareness is a policy-gated flag, off by default, from M1 onward.
4. **Traceability is built in from M3, not retrofitted.** The moment the Coach produces an intervention, it stores the input event, coach instance, policy version, knowledge scope version, retrieved sources, evaluator output, and the learner-facing output. Governance (M6) hardens this; it does not introduce it.
5. **Nothing the Coach doesn't own gets built here.** Identity/access (Nexus), content/ingestion/`retrieve` (Learning Platform), and bridge game runtime (Bridge Platform) are consumed through contracts. If a milestone finds itself building one of those, stop and route to the owning platform.

---

## 4. Milestone 0 — Setup and contracts foundation

**Goal:** a repo, a stack, and the shared schemas everyone else depends on. Nothing coaches yet, but every later milestone imports from here.

**Deliverables**
- Monorepo/package layout: `coach-core` (engine), `coach-contracts` (schemas + generated types), `coach-api` (HTTP surface), `coach-studio` (config UI, stub), `coach-adapters` (knowledge/tool adapters). (S)
- Stack baseline per architecture §16.3: TypeScript, Postgres, a durable `activity_events` table, a model-router LLM service layer, auth consumed from Nexus. (M)
- The schema-first pipeline: JSON Schemas for `KnowledgeChunk`, `ActivityEvent`, `CoachProfile`, `CoachingPolicy`, `KnowledgeScope`, `Recommendation`, `LearnerDomainProfile`, `CoachInstance`, plus generated TS types and a CI check that fails if generated types drift from schemas. (M)
- CI/CD, linting, a test harness, and a secrets/config story. (S)

**Dependencies:** none (this unblocks everything).

**Risks:** over-engineering the stack before any coaching behavior exists (architecture Risk 5). Mitigation: start as one integrated service; defer the service split until load justifies it (architecture §16.3).

**Definition of done**
- A new engineer can clone, build, run tests, and see generated types regenerate from a schema edit.
- All eight core schemas are committed and versioned with a `schemaVersion` field.
- An empty `POST /api/coaching/events` accepts a validated `ActivityEvent` and persists it to the raw event log.

---

## 5. Milestone 1 — Foundations (architecture Phase A)

**Goal:** the skeleton of the two-layer runtime exists and can hold a learner and retrieve knowledge, without yet coaching adaptively.

**Deliverables**
- **A1** `KnowledgeChunk` finalized as the versioned contract, with the required-tag rule enforced (`conceptIds`/`skillIds`/`chunkType` populated by producers; safe default on failure). (S)
- **A2** `BundledKnowledgeSource` implementing the `KnowledgeSource` port over an in-process, tag-based + cosine retriever, with a small hand-authored sample knowledge package (use a slice of Bridge or one Brain Bee chapter as the fixture). (M)
- **A3** Cross-domain Learner Profile Store: one record per learner, skills namespaced by domain, projected into per-domain `LearnerDomainProfile` views. Cross-domain awareness flag present and defaulted off. (M)
- **A4** The shared-contract set from M0 exercised by a first `openCoachSession()` that resolves a domain plugin, builds a Common Coach Package, and returns a bound session (even if the pipeline inside is still a stub). (M)

**Dependencies:** M0 schemas.

**Risks:** the learner store quietly leaking cross-domain data into a domain view. Mitigation: write the isolation test (a Bridge skill must never appear in a Brain Bee projection) in this milestone, before any UI exists.

**Definition of done**
- `openCoachSession({learnerId, domainId})` returns a session carrying a Common Coach Package.
- `KnowledgeSource.retrieve()` returns conforming, tagged chunks from the bundled package.
- The domain-isolation test passes; cross-domain awareness is provably off unless a flag is set.

---

## 6. Milestone 2 — The configurable coach (architecture Phase B)

**Goal:** design bet #4 becomes real — a coach's behavior is determined by resolved configuration, and non-engineers can create a coach without new code.

**Deliverables**
- **B1** `CoachingPolicyProfile` schema + the inheritance resolver (platform default → profile → course → class → learner prefs → session) + config versioning (each resolved policy stamped with `profileId` + `schemaVersion` on the session). (L)
- **B2** Intervention Policy Engine wiring: `feedbackStyle`, `interruptionTolerance`, and the configurable hint ladder become *behavioral*, not cosmetic — deterministic, no LLM. (M)
- **B3** Capability-scope enforcement: a disabled capability is structurally unavailable, not merely discouraged. (M)
- **B4** `chat()` conversation window (multi-turn context within a session). (S)
- **B5** Coach profile registry + a first cut of the Configuration Studio: view presets, clone, edit knowledge/capability/policy, preview against sample scenarios, publish a version, deploy as an instance. Presets are ordinary `CoachProfile` records. (XL)

**Dependencies:** M1 (needs the runtime skeleton and learner store).

**Risks:** the Studio balloons into a product before the runtime proves value (architecture Risk 5). Mitigation: the M2 Studio is admin-only and API-thin; it needs only enough UI to create and preview real profiles. Marketplace/authoring-product features are explicitly deferred to post-M6.

**Definition of done**
- An admin can clone the "Bridge Beginner Coach" preset, cap `maxHintLevel` at 3, disable slam bidding, save as a new version, and deploy it as an instance — with zero code changes.
- The same learner action produces different coach behavior under a `socratic` vs. `direct` profile, verifiably driven by the policy engine (not prompt text alone).
- Every session records the resolved policy version it ran under.

---

## 7. Milestone 3 — Interaction surface + lightweight tutoring (architecture Phase C)

**Goal:** the Coach becomes genuinely useful — it can hold a scoped conversation, call host tools, remember past interactions, and deliver real value in Brain Bee / MindAI Bee lessons — all *without* the risky graded-evaluator / platform-retrieval work.

**Deliverables**
- **C1** Tool-calling layer: the engine defines the tool *shape* only; hosts inject their registry via the domain plugin; the policy engine gates the registry down to `allowedTools` per turn using `policyHints`; the response type gains the `tool_call` variant. (L)
- **C2** Coach Interaction Memory: store the Coach's own chat/interaction history and expose `recall()` as a second retrievable source, separate from `KnowledgeSource`. (M)
- **C3** Event ingestion API + observation store: `POST /api/coaching/events` fully wired through Observation Builder → observation store, with the raw-event / learner-model split enforced. (M)
- **C4** Lightweight study-tutor mode for Brain Bee / MindAI Bee, using **bundled/tagged knowledge and a rule-based evaluator** (deliberately *before* the graded `course_learning` path): lesson-scoped Q&A, quiz feedback, missed-topic review, deterministic recommendations, reflection prompts, source-bound explanations with citations. (L)
- **Traceability** (cross-cutting): from this milestone on, every intervention persists its full context trace (input event, instance, policy version, scope version, sources, evaluator output, output). (S, but mandatory)

**Dependencies:** M2 (needs profiles, policy engine, capability scopes).

**Risks:** the tutor drifts into a generic chatbot answering outside scope (architecture Risk 1). Mitigation: require a `CoachInstance` + `KnowledgeScope` for every session; source-ground every answer; store traces. The isolation and scope tests from M1 extend here.

**Definition of done**
- A learner on a Brain Bee lesson can ask a question and get a source-cited answer bounded to that lesson's scope; asking something out of scope is declined or redirected, not hallucinated.
- A missed quiz question produces a deterministic recommendation referencing a real Learning Platform object id.
- A tool (`request_flashcards`) fires only when policy allows it, and is structurally absent in assessment mode.
- Every coach output in this milestone is traceable end-to-end.

---

## 8. Milestone 4 — Platform convergence (architecture Phase D) — highest risk

**Goal:** replace the rule-based tutor path with the full adaptive `course_learning` domain — LLM-graded evaluation, platform-backed and cross-course knowledge — proven safe before it becomes the default.

**Deliverables**
- **D1** `course_learning` plugin + LLM-graded evaluator (`GradedResult` with confidence/partial-credit) + **an eval harness** that measures grading accuracy and guardrail parity against the source-bound behavior established in M3. (XL)
- **D2** `PlatformKnowledgeSource` (HTTP client to the Learning Platform `/retrieve`) and `MultiScopeKnowledgeSource` (composite, cross-course), both behind the same `KnowledgeSource` port. Cross-course retrieval gated by the same off-by-default cross-domain policy. (L)
- **D3** Flagged enablement: run graded `course_learning` behind a flag on one test course; only make it the default in-lesson coach once the eval harness clears the source-grounding and guardrail bar. (M)

**Dependencies (critical):**
- M3 (the tool + memory + observation surface).
- **External: the Learning Platform's ingestion → embed → `/retrieve` endpoint**, serving the `RetrievalRequest` contract and publishing `KnowledgeChunk`-conforming output. **This must be committed and scheduled at the start of the program even though it is consumed only here** — it is the single hardest cross-team dependency (architecture §14.5, open decision §17.2).

**Risks:**
- LLM-graded evaluation isn't reliable enough to drive intervention (architecture open decision §17.5). Mitigation: the eval harness is a *gate*, not a formality — the default cutover (D3) does not happen until it passes.
- The `/retrieve` contract slips or diverges from `KnowledgeChunk`. Mitigation: agree the schema with the Learning Platform team during M0/M1; stub `PlatformKnowledgeSource` against a mock `/retrieve` so the Coach side isn't blocked on the real endpoint.

**Definition of done**
- The eval harness shows graded `course_learning` meets or beats the M3 rule-based path on grading accuracy and stays within guardrails.
- A learner enrolled in multiple courses can get cross-course retrieval *only* when the policy enables it; isolation holds otherwise.
- The graded helper is the default on at least one real course, with a kill-switch flag.

---

## 9. Milestone 5 — Bridge depth (architecture Phase E) — parallelizable after M2

**Goal:** the deepest coaching product — live and postmortem Bridge coaching — on the same runtime, proving the engine generalizes to a demanding real-time domain.

**Deliverables**
- **E1** Bridge passive + postmortem coaching: consume bridge bid/play/session events, record educational observations, map to concepts/skills/mistake categories, generate postmortems from structured session data, recommend tutorials/drills/practice. Uses the batch/replay evaluator mode. (L)
- **E2** Bridge live coaching: before-commit and after-commit hooks, the hint ladder in a live panel, policy-based intervention (silent/nudge/hint/save-for-postmortem), learner-model updates. (XL)
- **E3** Guided replay + LIN/PBN import review: decision-point identification, step-through replay, Q&A over the board, saved postmortem + updated recommendations. (L)

**Dependencies:** M2 (runtime + config) and the Bridge Platform emitting events + providing candidate decisions/analysis. The Bridge deterministic evaluator is the reference implementation of the evaluator contract.

**Risks:** the Bridge coach becomes over-ambitious (architecture Risk 2). Mitigation: start beginner/intermediate scope, postmortem + hints before full live intervention, conventions limited by profile.

**Definition of done**
- A completed hand produces a postmortem mapping key decisions to concepts/skills with recommended follow-ups.
- A learner at a live table can request a leveled hint governed by their instance's policy.
- An imported PBN becomes an interactive guided replay, not a static report.

---

## 10. Milestone 6 — Human coach + governance (architecture Phase F)

**Goal:** extend value to human coaches and make the whole system maintainable and safe for real learners.

**Deliverables**
- **F1** Human-coach-assistant (light): learner/class summaries, repeated-mistake surfacing, suggested assignments, coach-facing notes (kept separate from AI notes), completion tracking. (L)
- **F2** Admin/review/quality: trace any coach output back to sources/events/policy, review low-confidence and flagged responses, disable a problematic instance, publish revised policies, audit learner-model updates. (L)

**Dependencies:** M3 (traceability substrate) plus data from M4/M5 to summarize. Hardened *after* M4/M5 so there is real traffic to govern.

**Risks:** scope creep into a coach marketplace / autonomous class management (architecture out-of-scope list). Mitigation: assistant is `summary_only` → `assignment_support` → `review_support`; marketplace, revenue-sharing, and autonomous decisions stay out.

**Definition of done**
- A human coach sees a useful learner summary with repeated issues and can attach a suggested next drill.
- Any hint or recommendation can be traced to the policy, scope, sources, and event that produced it.
- An admin can disable a misbehaving coach instance without a deploy.

---

## 11. Testing strategy (headless — no UI required)

The Coach is a UI-agnostic engine: a host translates its native events into a generic `ActivityEvent` and renders whatever `AdaptiveCoachResponse` comes back. That boundary is what makes the entire engine testable with no screen — **your tests *are* the host.** A test sends an event and asserts on the returned object and the stored trace. Everything that makes the Coach *correct* is verifiable before a single pixel exists.

### 11.1 The three headless test surfaces
- **Contract/unit tests** — schemas and pure engine functions (resolver, policy engine, evaluators) tested directly, no HTTP.
- **API tests** — drive the HTTP surface (`/sessions`, `/events`, `/hints`, …) with a script or harness and assert on JSON responses.
- **Scenario/fixture tests** — canned learners + canned knowledge packages + canned event sequences replayed through the pipeline. These double as the Studio's "preview scenarios," so the test corpus is reusable product data, not throwaway.

### 11.2 Build the CLI harness first (M0/M1)
Before any milestone tests, build a tiny CLI/REPL: input a learner id, domain, and message; print the `AdaptiveCoachResponse` plus the full trace. It is an hour of work, is not a product UI, and becomes how you and reviewers "feel" coach behavior throughout the build without waiting on any front-end. Every scenario fixture below can be run through it manually as well as in CI.

### 11.3 Shared fixtures (create once in M0, grow per milestone)
```text
fixtures/
  learners/            seeded LearnerProfiles (single-domain, multi-domain)
  knowledge/           small hand-tagged KnowledgeChunk packages (bridge slice, one Brain Bee chapter)
  events/              recorded/synthetic ActivityEvent sequences (quiz miss, bid, play, PBN import)
  profiles/            CoachProfile + CoachingPolicyProfile presets (socratic, direct, beginner-capped)
  expected/            golden AdaptiveCoachResponse + trace snapshots per scenario
```

### 11.4 What can only be tested with a UI (be honest)
Visual correctness of cards/panels, perceived latency, and the *host's* translation of its native events into `ActivityEvent` and rendering of responses. These are host/front-end concerns owned by whoever builds Brain Bee / Bridge UIs — out of scope for the engine and deferred until after it's proven.

### 11.5 Per-milestone test files and what each asserts

**M0 — Setup + schemas.** Create:
- `tests/contracts/schema-validation.test.ts` — valid objects pass; malformed fail; each of the 8 schemas round-trips.
- `tests/contracts/type-drift.test.ts` (CI gate) — generated TS types match schemas; fails the build on drift.
- `tests/api/events-ingest.test.ts` — a valid `ActivityEvent` POSTed to `/api/coaching/events` persists to the raw event log.

**M1 — Foundations.** Create:
- `tests/engine/open-session.test.ts` — `openCoachSession()` returns a session carrying a Common Coach Package.
- `tests/engine/bundled-knowledge.test.ts` — `KnowledgeSource.retrieve()` returns conforming, tagged chunks from a fixture package.
- `tests/engine/domain-isolation.test.ts` *(critical)* — seed a learner with a bridge skill and a Brain Bee skill; assert the Brain Bee projection never contains the bridge skill; assert cross-domain awareness is off unless the flag is set.

**M2 — Configurable coach.** Create:
- `tests/config/resolver.test.ts` — the inheritance chain flattens correctly; locked fields are not overridden by lower levels; the resolved policy is stamped with `profileId` + `schemaVersion`.
- `tests/config/policy-drives-behavior.test.ts` *(headline)* — the same `ActivityEvent` under a `socratic` vs. `direct` profile yields the expected difference (question-form vs. higher hint level), proving policy — not prompt text — drives behavior.
- `tests/config/capability-scope.test.ts` — a disabled capability is structurally absent from what the session can produce.
- `tests/api/studio-registry.test.ts` — clone a preset → publish a version → deploy an instance, all via API; assert the versioned records persist and lineage is traceable.

**M3 — Interaction + light tutoring.** Create:
- `tests/tutor/scope-discipline.test.ts` — in-scope question → source-cited answer; out-of-scope question → declined/redirected, never hallucinated.
- `tests/tools/tool-gating.test.ts` — in assessment mode a `revealsAnswer` tool is absent from `allowedTools`; in practice mode a `request_flashcards` tool is present and fireable.
- `tests/tutor/recommendation.test.ts` — an incorrect `quiz_attempted` event yields a `Recommendation` referencing a real learning-object id.
- `tests/memory/recall.test.ts` — `InteractionMemory.recall()` returns prior interactions distinct from `KnowledgeSource` results.
- `tests/trace/intervention-trace.test.ts` *(cross-cutting)* — after any intervention, the stored trace contains input event, instance, policy version, scope version, sources, evaluator output, and learner-facing output.

**M4 — Platform convergence.** Create:
- `tests/eval-harness/graded-accuracy.test.ts` *(the D3 gate)* — run a labeled set of learner answers through the graded evaluator; assert accuracy, false-correct rate, and guardrail-violation rate meet the pre-agreed bar (§ "three things to lock").
- `tests/knowledge/platform-source.test.ts` — `PlatformKnowledgeSource` against a **mock `/retrieve`** returning fixed chunks; deterministic, runnable before the real endpoint exists.
- `tests/knowledge/multi-scope.test.ts` — cross-course retrieval returns merged/ranked chunks *only* when the cross-domain flag is on; isolation holds otherwise.
- `tests/flags/course-learning-default.test.ts` — the graded helper is gated behind a flag and the kill-switch disables it cleanly.

**M5 — Bridge depth.** Create:
- `tests/bridge/postmortem.test.ts` — replay a synthetic session's events; assert the postmortem identifies the expected decision points and maps them to the right concepts/skills.
- `tests/bridge/live-intervention.test.ts` — a before-commit event yields the policy-expected intervention (silent / hint level N / save-for-postmortem).
- `tests/bridge/guided-replay.test.ts` — a PBN fixture yields the expected decision points and alternative lines.

**M6 — Human coach + governance.** Create:
- `tests/humancoach/summary.test.ts` — a seeded learner history produces a summary with the expected repeated-issue structure.
- `tests/governance/traceability.test.ts` — any hint/recommendation traces back to policy, scope, sources, and event.
- `tests/governance/disable-instance.test.ts` — disabling an instance via API blocks new sessions without a deploy.

### 11.6 CI gates (which tests block which milestone)
- `type-drift` and `schema-validation` run on every commit from M0 on.
- `domain-isolation` must pass before M2 begins.
- `intervention-trace` must pass before M4 begins (traceability is a prerequisite for governance and for the eval harness's audit trail).
- `eval-harness/graded-accuracy` is the hard gate on M4-D3: the graded helper does not become any course's default until it passes.

---

## 12. Staffing shapes (turning the sequence into a schedule)

The sequence is fixed; the calendar depends on how you staff it. Two realistic shapes:

**Shape 1 — small team / sequential (1–3 engineers).**
Run M0→M1→M2→M3 strictly in order (this is the unavoidable spine). Then pick *one* of M4 or M5 as the flagship — usually M5 (Bridge) if Bridge is the lead product, or M4 if the Learning Platform apps ship first. Do M6 last. Rough relative effort: M0 (S) · M1 (M) · M2 (XL, the Studio dominates) · M3 (L) · M4 (XL) · M5 (XL) · M6 (M). M2 and M4 are the two heaviest; don't schedule them back-to-back for the same person.

**Shape 2 — split team / parallel (4+ engineers, two pods).**
Pod A owns the spine and platform track: M0→M1→M2→M3→M4. Pod B joins at M2's completion and owns Bridge: M5. A shared half-person owns contracts/governance (M0 schemas, then M6). The Learning Platform `/retrieve` dependency is negotiated by Pod A during M0/M1 so it's ready when M4 starts. This shape gets Bridge and the Learning Platform apps to value roughly together.

---

## 13. The three things to lock before you start coding

1. **The `/retrieve` contract with the Learning Platform** (architecture §14.5, §17.2). Consumed in M4 but must be agreed in M0/M1, because it gates the entire platform track. Get the endpoint owner named and the `KnowledgeChunk` shape signed off early.
2. **Config ownership / Studio scope** (architecture §17.1). Decide who edits each config level (API-only vs. instructor UI) before M2, because it sizes the Studio — the single biggest deliverable in the plan.
3. **The eval-harness bar for graded evaluation** (architecture §17.5). Define what "good enough to drive intervention" means *before* M4, so D3's cutover gate is objective rather than a judgment call under pressure.

---

## 14. Minimum shippable products along the way

You don't have to reach M6 to ship value. Natural release points:

- **After M3:** Brain Bee / MindAI Bee lightweight tutoring — source-bound Q&A, quiz feedback, review recommendations, reflection. A real, safe, useful product with no graded-evaluator risk.
- **After M5-E1:** Bridge postmortems + hint requests — the Bridge coach delivers value before full live intervention exists.
- **After M4-D3:** adaptive, memory-having, cross-course tutoring becomes the default learning experience.
- **After M6:** human coaches and admins are in the loop; the system is maintainable at scale.

---

## 15. One-screen summary

```text
M0 Setup          → repo, stack, 8 versioned schemas, event log accepts events
M1 Foundations    → two-layer skeleton, bundled knowledge, cross-domain store (isolation enforced)
M2 Configurable   → policy resolver + capability scopes + Configuration Studio (coach-by-config)
M3 Interaction    → tools + memory + observation store + safe rule-based tutoring + traceability
M4 Convergence    → graded course_learning + platform/multi-scope retrieval (flagged, eval-gated)   [needs LP /retrieve]
M5 Bridge depth   → passive/postmortem → live → guided replay                                        [parallel after M2]
M6 Human + govern → coach assistant + trace/review/disable/audit                                     [hardened after M4/M5]

Spine (linear):   M0 → M1 → M2 → M3
Then parallel:    M4 ‖ M5 ‖ M6
Lock first:       /retrieve contract · Studio scope · eval-harness bar
```

The whole plan in one sentence: **build the runtime and its configuration in isolation and safely (M0–M3), then take on the two hard, parallelizable frontiers — Learning Platform convergence and Bridge depth — behind flags and quality gates, and wrap it in human-coach and governance tooling last.**
