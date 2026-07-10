# M4 Execution Plan — Coach ↔ OwlwiseStudio (Learning Platform) Convergence

**Status:** Plan only (no code yet).
**Milestone:** M4 / Architecture Phase D — "Platform convergence" (highest risk, behind a flag).
**Repos in scope:** `Components/Generalizable Coach` (the Coach) · `Applications/OwlwiseStudio` (the Learning Platform).
**Governing docs:** `Coach_Integration_Requirements.md` (LR1–LR8), `LAIC_Coach_Final_Architecture.md` (§7.2, §11, §14, Phase D).

---

## 0. Key decision baked into this plan (and its consequence)

**Decision (confirmed):** OwlwiseStudio remains the **system of record for mastery** (its BKT `mastery_states`). The Coach **reads** Owlwise mastery and treats it as an evaluation/context input; the Coach does **not** own or write back course mastery.

**Consequence — a deliberate deviation from architecture §14.6** ("bridgeSignalIds / progress must reference the Coach's own skill state, no divergent second record"). We are accepting two skill stores:

- **Owlwise BKT** = authoritative course mastery (drives Owlwise dashboards, unchanged).
- **Coach learner model** = a *read-through view* of Owlwise BKT for `course_learning`, used only to inform the intervention decision within a session. It is not persisted as a competing truth.

**Risk this creates:** the two can drift if the Coach ever updates skill state locally. **Mitigation:** for `course_learning`, the Coach's `LearnerStore` update step is **disabled/observational** — mastery is pulled from Owlwise at session open and after graded events, never independently advanced. This must be enforced in code (a policy flag), not by convention. Revisit if/when a true cross-domain mastery view is needed.

---

## 1. What M4 delivers / does not deliver

**Delivers:** the `course_learning` domain wired to OwlwiseStudio end-to-end — grounded retrieval over the Coach `/retrieve` contract, a graded evaluator with an accuracy gate, event forwarding, the in-lesson helper rerouted through a Coach session, and a flagged rollout on one test course.

**Does not deliver:** Nexus identity reconciliation (dev uses Supabase `userId` as `actorId`), cross-domain awareness (stays OFF), Bridge depth (that's M5), multi-scope/cross-course retrieval as default (built but gated off).

---

## 2. Readiness baseline (verified in code)

| Capability | Owlwise today | Gap to M4 |
|---|---|---|
| Vector RAG + embeddings + `match_chunks` | ✅ `server/lib/rag.ts`, Voyage | expose as contract endpoint |
| Ingestion → `document_chunks` w/ citations, pages | ✅ `ingestExtract` | add concept/skill tagging |
| `concept_ids`/`skill_ids`/`chunk_type` columns | ✅ migration 005 (default only) | populate at ingest |
| Learning objects w/ stable ids | ✅ courses/concepts/modules | none |
| Learner mastery (BKT) | ✅ `mastery_states` | expose read endpoint for Coach |
| In-lesson AI helper | ⚠️ standalone `studentAssistant.ts` | reroute through Coach session |
| `/retrieve` contract endpoint | ❌ | build (small) |
| Event forwarding to Coach | ❌ | build adapter |
| Nexus auth | ⚠️ Supabase Auth | defer; use userId as actorId |

---

## 3. Workstreams

Each task lists **repo · files · contract · effort (S/M/L)**.

> **Build status (all workstreams implemented + unit-verified; live e2e pending):**
> **A** ✅ `/retrieve` + `PlatformKnowledgeSource` + migration 007 (4 tests). **B** ✅ `autoTagCourseChunks` + ingest/publish hooks + `POST /course/:id/tag`. **C** ✅ `LlmGradedEvaluator`/`HeuristicGradingModel`/router + eval harness `scoreGradingAccuracy` (9 tests) + `partially_correct` in the policy engines. **D** ✅ Owlwise→Coach `forwardActivityEvent` + `GET /api/mastery` + Coach `LearnerStore` external-mastery guard (2 tests). **E** ✅ `/assistant/chat` routes to a Coach session when flagged (local fallback) + `GET /api/agents/coach-tools` manifest. **F** ✅ `COACH_GRADED_COURSES` flag + `isCoachGradedCourse`.
> Coach suite **226/226**, `tsc` clean. Owlwise server `tsc`: **0 new errors** (7 pre-existing, project runs via `tsx`).
> **Needs a live env to finish:** apply migration 007; set `COACH_SERVICE_TOKEN` / `COACH_BASE_URL` / `COACH_GRADED_COURSES` + Voyage/Anthropic keys; wire the Coach's `course_learning` session factory to use `PlatformKnowledgeSource`→Owlwise `/retrieve` (deployment wiring); run the real-LLM eval-harness pass and clear `DEFAULT_ACCURACY_BAR` before flipping the flag on broadly (the D3 gate).

### Workstream A — Knowledge seam (LR1 + D2)  ✅ IMPLEMENTED (live e2e pending)
The docs call this "the one prerequisite to assign" (§14.5). The hard parts (embeddings, vector store, chunking, citations) are already done.

**Status (implemented):**
- A1 · Owlwise `POST /api/rag/retrieve` (`server/routes/rag.ts`) + `requireServiceOrAuth` (`server/middleware/auth.ts`) + `COACH_SERVICE_TOKEN` (`server/lib/config.ts`). **`knowledgeScopeId` maps to the Owlwise `courseId`.**
- A2 · migration `007_match_chunks_coach_filters.sql` (concept/skill/chunk_type/source filters, returns tag columns; backward compatible) + `retrieveForCoach()` (`server/lib/rag.ts`) with a tag-only no-text branch.
- A3 · Coach `PlatformKnowledgeSource` (`platform/knowledge-source/PlatformKnowledgeSource.ts`), exported; rejects unknown major `schemaVersion`.
- A4 · Coach contract test `tests/engine/platform-knowledge-source.test.ts` (mock fetch) — **4/4 pass; full suite 215/215; both sides typecheck clean (no new errors).**
- **Pending (needs a live env):** apply migration 007 to Supabase, set `COACH_SERVICE_TOKEN`, seed a course, and run the Coach's `PlatformKnowledgeSource` against the running Owlwise server for the true end-to-end proof.


- **A1 · Owlwise · `server/routes/rag.ts` (+ index mount) · S** — add `POST /api/rag/retrieve` accepting the Coach `RetrievalRequest` (`domainId`, `knowledgeScopeId`, `text`, `conceptIds`, `skillIds`, `chunkType`, `allowed*/forbidden*`, `topK`, `scope`) and returning `KnowledgeChunk[]`.
- **A2 · Owlwise · `server/lib/rag.ts` · M** — extend `match_chunks` (or wrap it) to filter by `conceptIds`/`skillIds`/`chunkType` and honor `allowed*/forbidden*` (LR6). Map `RagChunk` → `KnowledgeChunk` (`id`, `content`, `conceptIds`, `skillIds`, `chunkType`, `citation`, `pageStart/End`, `score`, `schemaVersion`).
- **A3 · Coach · `platform/knowledge-source/PlatformKnowledgeSource.ts` (new) · M** — implement the `KnowledgeSource` port over HTTP to `/api/rag/retrieve`; reject unknown `schemaVersion` majors. Add `MultiScopeKnowledgeSource` composite (gated OFF by default — single course scope for M4).
- **A4 · Both · contract test · S** — a shared fixture: Coach `PlatformKnowledgeSource.retrieve()` against a seeded Owlwise course returns tagged, cited chunks. This is the end-to-end proof A is done.

**Acceptance:** the Coach retrieves scoped, cited chunks from a real Owlwise course over `/retrieve`; out-of-scope content is never returned.

### Workstream B — Tagged-chunk ingestion (LR7)
- **B1 · Owlwise · `server/lib/rag.ts` (`ingestExtract`) · M** — add an LLM auto-tag step that populates `concept_ids`/`skill_ids` from the course's concept list; keep the safe default `chunk_type:"explanation"` on failure (never silently untagged). Concept ids must be the **same stable slug ids** used elsewhere (LR5/BR7 shared taxonomy).
- **B2 · Owlwise · backfill script · S** — re-tag existing `document_chunks` for the test course.

**Acceptance:** new and backfilled chunks carry non-empty `concept_ids` aligned to course concept slugs; retrieval by `conceptIds` works.

### Workstream C — Graded evaluator + eval harness (D1)  ← the gate
- **C1 · Coach · `domains/course_learning/evaluator.ts` · L** — add an LLM-graded evaluator producing the `GradedResult` shape (`correctness: correct|partially_correct|incorrect`, `confidence`, `partialCredit?`, `conceptIds`, `rationale`). Keep the existing deterministic exact-match evaluator for closed items; route open-ended answers to the graded path.
- **C2 · Coach · `tests/eval-harness/` (new) · L** — a graded-accuracy harness with a labeled answer set; define the pass bar **before** enabling the graded helper as default (this is the hard CI gate on D3).

**Acceptance:** graded evaluator meets the agreed accuracy bar on the harness; below-bar → the graded helper stays flag-off.

### Workstream D — Event forwarding + mastery read (LR2 + mastery-read)
- **D1 · Owlwise · `server/routes/data.ts` (or new `events.ts`) · M** — on quiz attempt / block completion / reflection, map the native signal → `ActivityEvent` (`domainId:"course_learning"`, `sourcePlatform:"learning"`, `actorId`=Supabase userId, `contextRefs.courseId/learningObjectId`=concept id) and POST to the Coach `/api/coaching/events`. At-least-once; Coach de-dupes on `eventId`.
- **D2 · Owlwise · `server/routes/data.ts` · S** — expose `GET /api/mastery?userId=&courseId=` returning `mastery_states` (BKT level/score per concept) for the Coach to read. **(New requirement created by the mastery decision — see §0.)**
- **D3 · Coach · `openCoachSession` + `platform/learner-model` · M** — at `course_learning` session open, pull Owlwise mastery via D2 and populate the learner model **read-only**; disable local skill-state advancement for this domain (the §0 mitigation).

**Acceptance:** a missed quiz in Owlwise appears as an `ActivityEvent` in the Coach; the Coach's session context reflects Owlwise BKT without writing a second mastery record.

### Workstream E — Reroute the in-lesson helper (LR3 + LR4)
- **E1 · Coach · `course_learning` session · M** — ensure `POST /api/coaching/sessions` + `/ask` cover the helper's needs (scope-bound Q&A, quiz guardrail as policy, citations). The quiz guardrail currently hand-coded in `studentAssistant.ts` becomes **capability/policy** (assessment mode hides `revealsAnswer` tools).
- **E2 · Owlwise · `server/agents/studentAssistant.ts` + client · L** — replace the standalone `claudeText` + `detectIntent` + local RAG path with a call into a `course_learning` Coach session. `AIExplainerBlockConfig` (`allowedContext`, `sourceBounded`, `allowQuizMe`, `allowFlashcardCreation`, `maxResponseLength`) maps onto the Coach's KnowledgeScope + CapabilityScope + tool registry.
- **E3 · Owlwise · tool manifest · M** — advertise existing agents (`quizCoach`, flashcards, reflection, review-block) as `CoachTool`s (`name`, `description`, `inputSchema`, `policyHints`), executed host-side; Coach proposes `ToolCall`, Owlwise executes and returns `ToolResult` correlated by `callId`.

**Acceptance:** the in-lesson helper answers via the Coach (memory, hint escalation, guardrails-as-policy, tools) with no separate chatbot brain; it cannot answer out of scope or reveal quiz answers.

### Workstream F — De-risked rollout (D3)
- **F1 · Both · feature flag · S** — enable the graded `course_learning` helper on **one test course** only.
- **F2 · Both · validate · M** — confirm grading quality + source-grounding + guardrail parity vs. the old helper before widening.
- **F3 · Both · default · S** — flip to default across courses only after the C2 bar is met.

---

## 4. Sequencing (dependency order)

```
A (knowledge seam)  ─┬─►  E (reroute helper)  ─►  F (rollout)
B (tagging)  ────────┘          ▲
C (graded evaluator + harness) ─┘   (gate for F default)
D (events + mastery read)  ── parallel to A/B/C, needed before E is useful
```

- **A first** — nothing grounded works without `/retrieve`. A + B together give tagged, scoped retrieval.
- **C in parallel** — the graded evaluator + harness is the gate; start early, it's the long pole.
- **D in parallel** — event forwarding + mastery read; independent of A.
- **E after A/B/C/D** — the reroute is the integration act; needs retrieval, grading, and context ready.
- **F last** — flag on one course, validate, then default.

---

## 5. Cross-cutting requirements (both sides)

- **Schema versioning** — every contract object carries `schemaVersion`; reject unknown majors.
- **Idempotency** — stable `eventId` (events) and `callId` (tool results).
- **Non-blocking** — Owlwise never blocks its runtime on the Coach; helper replies may be deferred/streamed.
- **Identity (interim)** — `actorId` = Supabase `userId`; leave a documented seam for Nexus identity (LR8) later.
- **Domain isolation** — stamp `domainId:"course_learning"`; cross-domain awareness stays OFF.

---

## 6. Open items to close during the build

1. **Graded-accuracy bar (C2)** — the numeric pass threshold for enabling the graded helper. Decide before F3.
2. **Mastery divergence guard (§0)** — confirm the Coach's `course_learning` skill-state update is truly disabled, not just unused.
3. **Tagging taxonomy (B1)** — confirm concept slug ids are the shared key across chunks, evaluation, and mastery.
4. **Tool auth (E3)** — Owlwise executes Coach-proposed tools as the authenticated learner; confirm the auth context.
5. **Nexus identity (LR8)** — when to replace Supabase `userId` with a Nexus-issued identity.

---

## 7. First concrete deliverable (when building starts)

Workstream **A1–A4**: `POST /api/rag/retrieve` in Owlwise + `PlatformKnowledgeSource` in the Coach + an end-to-end contract test against a seeded course. Smallest, lowest-risk slice that proves the integration and unblocks E and F.
