# Course Wizard — Gap Report & API Proposal

Scope: `src/app/components/screens/CourseWizard.tsx` only (plus new `src/lib/api.ts` and
extensions to `src/lib/types.ts`). Ground truth: `src/imports/pasted_text/course-wizard-spec.md`
and `src/imports/laic-learning-platform.html`.

Goal of the rebuild: keep the existing shadcn/Tailwind design **exactly**, but replace all
demo/mock data and stubs with a **typed API layer** (`src/lib/api.ts`) that is RAG-backed on
the server. Client only calls / streams / renders. No `localStorage`. No fallback to mock
data — failed calls surface a visible error.

---

## 0. Cross-cutting gaps (apply to the whole file)

| Area | Spec / requirement | Current state | Gap |
| --- | --- | --- | --- |
| Data source | All data from typed API layer | Imports `SOURCES` and `SEED_MODULES` (mock) from `src/lib/data.ts` and a local const | Remove `data.ts` usage entirely from this workflow; load via API |
| Types | Real shapes in `types.ts` | Local `Block`/`Lesson`/`Module` interfaces inside the component with `type: string` | Move to typed domain models in `types.ts` (see §API) |
| Async UX | Loading, empty, error states for **every** async call | No async calls exist; everything is synchronous local state | Add loading/empty/error rendering for sources load, course create, skeleton, generate (stream), editor load, block patch, ai edit/generate, library picker, policy save, submit |
| Streaming | Generate + Ask-AI are streamed from server | No streaming; "Generate content →" just advances the step | Implement stream consumption + progress/typing UI |
| Persistence | Draft course created server-side; id held through steps | No `courseId`; nothing persisted | Hold `courseId` in wizard state after Step 2 |
| Errors | Typed errors, graceful failure | None | `ApiError` + visible inline error + retry |
| Env | `VITE_API_BASE_URL` | Not referenced | Read in `api.ts` |

Persistent chrome (header, stepper, bottom action bar, next-button labels) **matches the spec
already** and should be preserved as-is visually.

---

## STEP 1 — Source

**Spec:** Load real sources from `GET /api/sources` (+ collections). Multi-select. Show each
source's **ingestion status**. `primary` sources pre-selected. Upload dropzone (multiple)
adds + auto-selects; "name a source" adds + auto-selects. Live "N selected" counter. **Gate:
Next disabled until ≥1 selected source is `ready` (embedded).**

| Requirement | Current | Gap |
| --- | --- | --- |
| Source list from API | `SOURCES.map(...)` from `data.ts` | Replace with `getSources()` result; loading/empty/error states |
| Ingestion status per source | Not shown at all | Add status chip (queued / processing / ready / failed); poll or refetch while not ready |
| Pre-select `primary` | `SOURCES.filter(s => s.primary)` from mock | Same behavior but from API result |
| Upload dropzone | Static markup, no `<input>` handler | Wire real file input (multiple) → `uploadSource()` → auto-select |
| "Name a source" field + `＋` | Inputs render, no handler | Wire → `createNamedSource()` → auto-select |
| Collections | Spec mentions "(+ collections)" | Load `getCollections()` and group/label sources |
| Gate | `canNext = selSources.length > 0` | Change to: ≥1 selected source with `ingestionStatus === 'ready'` |

**Demo/stub here:** `SOURCES` import; non-functional dropzone; non-functional name field.

---

## STEP 2 — Structure (Design)

**Spec:** Pure form state for all design decisions (identity, audience, parsing, approach,
hierarchy levels + rename/toggle, progression, pacing, objectives/diagnostic/capstone/
certificate + completion). **On leaving the step, `POST /api/courses` to create a draft course
and hold its id.**

| Requirement | Current | Gap |
| --- | --- | --- |
| All fields present | `DEFAULT_STRUCT` + `Step2` cover every field in spec | Form is essentially complete — keep UI |
| Typed config | `typeof DEFAULT_STRUCT` (loose) | Promote to typed `CourseConfig` in `types.ts` |
| Create draft on leave | Nothing happens on advance | On advancing 2→3: `createCourse({ config, sourceIds })`, store `courseId`; show saving/error state; block advance on failure |
| Completion criteria reveal | Implemented (only when certificate ON) | OK |

**Demo/stub here:** none functionally, but no persistence call.

---

## STEP 3 — Skeleton (Parse source)

**Spec:** `POST /api/courses/:id/skeleton { config, sourceIds }` — server uses RAG over
selected sources to propose the outline. Render editable (rename / add / remove nodes).
**Regenerate re-calls the endpoint** (toast "Re-parsed — fresh outline generated"). Source
refs (e.g. "Ch.4 pp.32–35") come from the server. Right card: live counts + info note.

| Requirement | Current | Gap |
| --- | --- | --- |
| Outline from RAG endpoint | Uses local `SEED_MODULES` mock | Call `parseSkeleton(courseId, { config, sourceIds })`; loading (parsing…) / empty / error |
| Editable rename/add/remove | Implemented on local state | Keep editing UX; edits update in-memory skeleton (persisted at generate/patch time) |
| Regenerate | `regen()` sets a fake local message | Re-call `parseSkeleton(...)`; show spinner; real toast |
| Source refs (`mod.ref`) | Hardcoded in mock | From server skeleton nodes |
| Top-level "Add {group}" only when grouping on | Always shown | Gate on `config.groupLevel` |
| Nested top grouping level (Part) | Only Module→Lesson handled | Spec allows a top grouping level; current tree is 2-level. Support configured levels (at minimum keep Module→Lesson/Checkpoint; add top level if enabled) |

**Demo/stub here:** `SEED_MODULES`; fake `regen()` toast.

---

## STEP 4 — Generate (choose what to generate)

**Spec:** Per-item multi-select "generate" pills set a **plan** (checkpoints default Quiz,
lessons default Full lesson). Right panel: Teaching preferences (style / reading level / depth,
auto-seeded from Step 2 audience & pacing), "Apply to all" quick-add pills, amber note.
Pressing **Generate content →** runs `POST /api/courses/:id/generate { skeleton, plan, prefs }`,
**streams progress**, then loads the result and advances to the editor.

| Requirement | Current | Gap |
| --- | --- | --- |
| Plan pills | Implemented (local `selPills`) | Keep UI; lift plan into wizard state as typed `GeneratePlan` |
| Prefs auto-seed from Step 2 | Hardcoded defaults (`High school`, `Standard`) | Seed reading level from `config.audience`, depth from `config.pace` |
| Apply-to-all | Implemented | Keep |
| Generate call + stream | "Generate content →" just calls `advance()` | Call `generateCourse(courseId, { skeleton, plan, prefs })`; consume progress stream (per-lesson progress UI); on done, `getCourse(courseId)` then advance; error state with retry |

**Demo/stub here:** generation is entirely fake (no call); prefs not wired to config.

---

## STEP 5 — Editor

**Spec:** `GET /api/courses/:id` (modules→lessons→blocks). Lesson tree (sticky). Per-block
`BlockCard` with read/edit/ask-AI modes, reorder, delete. Manual edit → `PATCH
/api/courses/:id/blocks/:blockId` (toast "Block saved"). Ask-AI → `POST /api/ai/edit-block
{ blockId, instruction }` (RAG rewrite, **streamed**, chat thread + "Apply this"). Add block
(dropdown of 11 types, toast). Generate a block → `POST /api/ai/generate-block`. Use object
from library → `GET /api/objects?reusable=true` (Library Picker modal). **Quiz Builder** and
**Flashcard Builder** modals edit real block data. **Reused-object lessons** render as linked
amber panels (not editable blocks) with "Remove from course".

| Requirement | Current | Gap |
| --- | --- | --- |
| Load course from API | Uses shared `modules` mock state | Load via `getCourse(courseId)`; loading/empty/error |
| Read views per block type | Covers rich-text/concept-card/question/quiz/flashcard-set only | Add: summary, source_excerpt (amber + citation), scenario, reflection (+ visibility chip), assignment, video_script, image placeholder — per spec |
| Edit mode | Uncontrolled `textarea`, Save just closes | Controlled inputs (title/concept/misc/body); `patchBlock(...)`; toast; loading/error on save |
| Ask-AI mode | Chips + input are no-ops | `editBlock(blockId, instruction)` streamed; chat thread; per-suggestion "✓ Apply this" → applies + patches; toast |
| ↑/↓ reorder, delete | Local only | Persist ordering/delete via `patchBlock`/reorder endpoint (or block PATCH with order); optimistic + error revert |
| Add block ▾ | Button, no dropdown, no action | Dropdown of 11 types; append block (client) → persist; toast |
| Generate a block with AI | No handler | `generateBlock(...)`; toast; inserts AI-drafted block |
| Use object from library | No modal | Library Picker modal: `getReusableObjects(search)`; empty state; "＋ Add" links object; reused panel render |
| Quiz Builder modal | **Missing entirely** | Build full modal: bank / editor (11 question types) / settings; edits real quiz block; "✓ Done — save to lesson" toast |
| Flashcard Builder modal | **Missing entirely** | Grid of card editors (front/back/hint/delete), add card, review-mode selector; save toast |
| Reused-object rendering | **Missing** | Amber linked panel with type/scope chips, blueprint chips, Remove |
| Header chip "✦ N blocks generated" | Present per-lesson | Keep |

**Demo/stub here:** all block content is mock; Save/Ask-AI/Add/Generate/Use-object are
no-ops; no builder modals; no reused-object concept.

---

## STEP 6 — Review

**Spec:** Computed **client-side** from the loaded course. Four stat cards (Modules/Lessons/
Blocks/Flashcards), Course design card with chips (audience/approach/progression/pacing +
enabled features + completion criteria), module list with per-lesson block-type chips, green
banner. **No new calls.**

| Requirement | Current | Gap |
| --- | --- | --- |
| Computed from loaded course | Computes from mock `modules` | Compute from API-loaded course (no new call) — correct approach, just real data |
| Stat card label | "Flashcard sets" | Spec says "Flashcards" — align label |
| Completion criteria chip | Not shown | Add `{completion}` chip when certificate enabled |
| Container width | `max-w-2xl` | Leave (design) unless you want full-width like other screens |

**Demo/stub here:** derives from mock modules only.

---

## STEP 7 — Learner interactions

**Spec:** Two toggle cards (AI & study tools; Navigation & feedback). `requireOrder` auto-set
from Step 2 progression. Feedback timing dropdown. **`PUT /api/courses/:id/policy`.**

| Requirement | Current | Gap |
| --- | --- | --- |
| Toggles + feedback timing | Implemented (local `Step7` state) | Keep UI |
| `requireOrder` auto-set | Hardcoded `true` | Seed from `config.progression === 'Linear (in order)'` |
| Persist policy | Nothing saved | `savePolicy(courseId, policy)` on change/leave; saving/error state |

**Demo/stub here:** policy never persisted; auto-set not wired.

---

## STEP 8 — Publish (submit for approval)

**Spec:** Publication type radios (Course default / Learning package / Standalone objects),
note textarea (prefilled), Submit → `POST /api/courses/:id/submit { publicationType, note }` →
status "in review". Confirmation state: **amber clipboard icon**, heading, course-title text,
`in review` + program chips, footer note; bottom bar shows **✓ Finish**. Toast "Submitted for
administrator approval".

| Requirement | Current | Gap |
| --- | --- | --- |
| Submit call | `onSubmit` just sets local `submitted` | `submitCourse(courseId, { publicationType, note })`; loading/error; only show confirmation on success |
| Confirmation icon | Green check circle | Spec: **amber clipboard** icon |
| Program chip | Hardcoded "Bridge" | From course/program context |
| Toast | None | "Submitted for administrator approval" |

**Demo/stub here:** submit is local-only; wrong icon; hardcoded program.

---

## Summary of every demo-data / stub / toast site

1. `import { SOURCES } from '../../../lib/data'` — Step 1 list + primary preselect.
2. `SEED_MODULES` const — Steps 3/4/5/6 outline & content.
3. Step 1 upload dropzone — no handler.
4. Step 1 "name a source" field/button — no handler.
5. Step 3 `regen()` — fake local toast, no re-parse.
6. Step 4 "Generate content →" — calls `advance()`, no generation/stream.
7. Step 5 block Save — closes edit mode, no PATCH, no toast.
8. Step 5 Ask-AI chips/input — no-ops.
9. Step 5 "Add block ▾" — no dropdown/action.
10. Step 5 "Generate a block with AI" — no handler.
11. Step 5 "Use object from library" — no modal.
12. Step 5 Quiz Builder / Flashcard Builder — missing entirely.
13. Step 5 reused-object panel — missing.
14. Step 7 toggles — never persisted; `requireOrder` hardcoded.
15. Step 8 submit — local-only; wrong confirmation icon; hardcoded program chip.

---

# Proposed `src/lib/api.ts` surface

## Client core

```ts
// Reads import.meta.env.VITE_API_BASE_URL
export class ApiError extends Error {
  status: number;              // HTTP status (0 for network/abort)
  code: string;               // machine-readable, e.g. 'not_found', 'network_error'
  details?: unknown;          // server payload if any
}

// JSON request helper — throws ApiError on non-2xx / network failure.
async function apiFetch<T>(
  path: string,
  opts?: { method?: string; body?: unknown; signal?: AbortSignal; query?: Record<string, string | number | boolean | undefined> },
): Promise<T>;

// Streaming helper — yields typed events from an NDJSON/SSE response.
async function* apiStream<E>(
  path: string,
  opts?: { method?: string; body?: unknown; signal?: AbortSignal },
): AsyncGenerator<E, void, unknown>;
```

## Typed endpoint functions

```ts
// STEP 1 — Sources
export function getSources(signal?: AbortSignal): Promise<WizardSource[]>;
export function getCollections(signal?: AbortSignal): Promise<SourceCollection[]>;
export function uploadSource(file: File, opts?: { collectionId?: string; signal?: AbortSignal }): Promise<WizardSource>;
export function createNamedSource(name: string, signal?: AbortSignal): Promise<WizardSource>;
export function getSource(id: string, signal?: AbortSignal): Promise<WizardSource>; // for polling ingestion status

// STEP 2 — Create draft course
export function createCourse(input: CreateCourseInput, signal?: AbortSignal): Promise<CourseDraft>;
//   CreateCourseInput = { config: CourseConfig; sourceIds: string[] }

// STEP 3 — Skeleton (RAG parse)
export function parseSkeleton(courseId: string, input: SkeletonInput, signal?: AbortSignal): Promise<CourseSkeleton>;
//   SkeletonInput = { config: CourseConfig; sourceIds: string[] }

// STEP 4 — Generate (RAG, streamed)
export function generateCourse(
  courseId: string,
  input: GenerateInput,
  signal?: AbortSignal,
): AsyncGenerator<GenerateProgressEvent>;
//   GenerateInput = { skeleton: CourseSkeleton; plan: GeneratePlan; prefs: TeachingPrefs }

// STEP 5 — Editor
export function getCourse(courseId: string, signal?: AbortSignal): Promise<CourseFull>;
export function patchBlock(courseId: string, blockId: string, patch: BlockPatch, signal?: AbortSignal): Promise<CourseBlock>;
export function reorderBlocks(courseId: string, lessonId: string, blockIds: string[], signal?: AbortSignal): Promise<void>;
export function deleteBlock(courseId: string, blockId: string, signal?: AbortSignal): Promise<void>;
export function addBlock(courseId: string, lessonId: string, type: CourseBlockType, signal?: AbortSignal): Promise<CourseBlock>;
export function editBlock(input: EditBlockInput, signal?: AbortSignal): AsyncGenerator<AiEditEvent>; // POST /api/ai/edit-block (streamed)
//   EditBlockInput = { blockId: string; instruction: string }
export function generateBlock(input: GenerateBlockInput, signal?: AbortSignal): Promise<CourseBlock>; // POST /api/ai/generate-block
export function getReusableObjects(query?: { search?: string; signal?: AbortSignal }): Promise<ReusableObject[]>; // GET /api/objects?reusable=true
export function linkObjectToLesson(courseId: string, lessonId: string, objectId: string, signal?: AbortSignal): Promise<CourseLessonNode>;
export function unlinkObjectFromLesson(courseId: string, lessonId: string, signal?: AbortSignal): Promise<void>;

// STEP 7 — Policy
export function savePolicy(courseId: string, policy: CoursePolicy, signal?: AbortSignal): Promise<CoursePolicy>; // PUT /api/courses/:id/policy

// STEP 8 — Submit
export function submitCourse(courseId: string, input: SubmitInput, signal?: AbortSignal): Promise<SubmitResult>;
//   SubmitInput = { publicationType: PublicationType; note: string }
```

## Proposed additions to `src/lib/types.ts`

```ts
// --- Step 1 ---
export type IngestionStatus = 'queued' | 'processing' | 'ready' | 'failed';
export interface WizardSource {
  id: string; title: string; filename: string;
  kind: 'pdf' | 'docx' | 'slides' | 'text' | 'video-transcript' | 'audio' | 'link';
  pages?: number; duration?: string; domain: string;
  primary: boolean; ingestionStatus: IngestionStatus; collectionId?: string;
}
export interface SourceCollection { id: string; name: string; sourceIds: string[] }

// --- Step 2 (typed CourseConfig) ---
export type Audience = 'Beginners' | 'Intermediate' | 'Advanced' | 'Mixed level';
export type ParsingMode = 'toc' | 'ai';
export type Approach = 'Concept-first' | 'Case-based' | 'Problem-based' | 'Spiral review';
export type Progression = 'Linear (in order)' | 'Open (any order)' | 'Unlock by prerequisite';
export type Pacing = 'Short (~5 min)' | 'Standard lessons' | 'In-depth (20 min+)';
export type CompletionCriteria = 'Finish all lessons & checkpoints' | 'Pass every checkpoint' | 'Score 80%+ overall';
export interface HierarchyLevels {
  topLevel: boolean; topName: string;      // default off / "Part"
  groupLevel: boolean; groupName: string;  // default on / "Module"
  contentName: string;                     // always on / "Lesson"
  assessOn: boolean; assessName: string;   // default on / "Checkpoint"
}
export interface CourseConfig {
  title: string; subtitle: string; audience: Audience;
  parsing: ParsingMode; approach: Approach;
  hierarchy: HierarchyLevels;
  progression: Progression; pace: Pacing;
  draftObjectives: boolean;
  diagnostic: boolean; capstone: boolean; certificate: boolean; completion: CompletionCriteria;
}

// --- Step 3 ---
export type SkeletonNodeKind = 'group' | 'lesson' | 'checkpoint';
export interface SkeletonNode { id: string; kind: SkeletonNodeKind; title: string; sourceRef?: string; children?: SkeletonNode[] }
export interface CourseSkeleton { courseId: string; nodes: SkeletonNode[] }

// --- Step 4 ---
export type GenType =
  | 'Full lesson' | 'Summary' | 'Quiz questions' | 'Flashcards' | 'Concept cards'
  | 'Reflection prompts' | 'Scenario activity' | 'Assignment' | 'Video script';
export type GeneratePlan = Record<string /* lessonId */, GenType[]>;
export type TeachingStyle = 'Conversational' | 'Textbook' | 'Concise / bulleted' | 'Q&A' | 'Scenario-first';
export type ReadingLevel = 'Middle school' | 'High school' | 'General adult' | 'Advanced';
export type Depth = 'Overview' | 'Standard' | 'Deep dive';
export interface TeachingPrefs { style: TeachingStyle; readingLevel: ReadingLevel; depth: Depth }
export interface GenerateProgressEvent {
  type: 'progress' | 'lesson-done' | 'done' | 'error';
  lessonId?: string; lessonTitle?: string;
  completed?: number; total?: number; message?: string;
}

// --- Step 5 (course content model) ---
export type CourseBlockType =
  | 'rich_text' | 'summary' | 'concept_card' | 'source_excerpt' | 'single_question'
  | 'scenario' | 'reflection' | 'assignment' | 'video_script' | 'image'
  | 'quiz' | 'flashcard_set';
export interface Citation { sourceId: string; sourceTitle: string; locator: string } // e.g. "p.32"
export interface CourseBlock {
  id: string; type: CourseBlockType; label: string;
  aiDrafted: boolean; order: number;
  // type-specific optional fields:
  body?: string; title?: string;
  concept?: string; plain?: string; misconception?: string;
  prompt?: string; options?: QuizOption[]; correct?: number;
  visibility?: 'private' | 'shared';
  script?: string; imageAlt?: string;
  quiz?: QuizData; flashcards?: FlashcardData;
  citations?: Citation[];
}
export type QuestionType =
  | 'multiple_choice' | 'multiple_select' | 'true_false' | 'short_answer' | 'fill_blank'
  | 'matching' | 'ordering' | 'ranking' | 'scenario' | 'ai_critique' | 'essay';
export interface QuizOption { id: string; text: string; correct: boolean; feedback?: string }
export interface QuizQuestion { id: string; type: QuestionType; difficulty: number; prompt: string; options: QuizOption[] }
export type QuizKind = 'practice' | 'checkpoint' | 'graded' | 'final';
export interface QuizData { questions: QuizQuestion[]; kind: QuizKind; attempts: number; passing: number; feedbackTiming: FeedbackTiming; hints: boolean }
export type ReviewMode = 'simple' | 'self rating' | 'spaced repetition';
export interface Flashcard { id: string; front: string; back: string; hint?: string }
export interface FlashcardData { cards: Flashcard[]; reviewMode: ReviewMode }
export interface BlockPatch { [field: string]: unknown } // partial CourseBlock fields

export type LessonNodeKind = 'lesson' | 'checkpoint' | 'reused-object';
export interface CourseLessonNode {
  id: string; kind: LessonNodeKind; title: string;
  blocks: CourseBlock[];
  reusedObject?: ReusableObject;  // when kind === 'reused-object'
}
export interface CourseModuleNode { id: string; title: string; sourceRef?: string; lessons: CourseLessonNode[] }
export interface CourseDraft { id: string; title: string; program: Program; status: ObjectStatus; config: CourseConfig }
export interface CourseFull extends CourseDraft { modules: CourseModuleNode[]; policy?: CoursePolicy }

export interface ReusableObject {
  id: string; title: string; type: ObjectType; scope: 'bridge' | 'shared';
  status: ObjectStatus; reuseCount: number; sourceLine?: string; blueprint?: string[];
}

// --- Step 5 AI streams ---
export interface AiEditEvent { type: 'token' | 'suggestion' | 'done' | 'error'; text?: string; suggestionId?: string; message?: string }
export interface EditBlockInput { blockId: string; instruction: string }
export interface GenerateBlockInput { courseId: string; lessonId: string; hint?: string }

// --- Step 7 ---
export type FeedbackTiming = 'Immediately after each answer' | 'After the attempt' | 'After completion' | 'Never show answers';
export interface CoursePolicy {
  askAI: boolean; quizMe: boolean; learnerFlashcards: boolean; privateNotes: boolean;
  requireOrder: boolean; allowSkipOptional: boolean; showHints: boolean; feedbackTiming: FeedbackTiming;
}

// --- Step 8 ---
export type PublicationType = 'Course' | 'Learning package' | 'Standalone objects';
export interface SubmitInput { publicationType: PublicationType; note: string }
export interface SubmitResult { id: string; status: 'in-review'; title: string; program: Program }
```

## Notes / decisions to confirm

- **Block type naming**: spec's Step 5 read-view list uses `snake_case` (`rich_text`,
  `flashcard_set`, …); the current component uses `kebab-case` (`rich-text`). I propose the
  API/domain model use `snake_case` (matches the spec text) and map to the existing chip
  styling. Confirm OK, or keep kebab-case to minimize churn.
- **Reorder/delete persistence**: I proposed dedicated `reorderBlocks` / `deleteBlock`
  endpoints rather than overloading `patchBlock`. Confirm the backend shape.
- **Ingestion polling**: Step 1 will poll `getSource(id)` for sources not yet `ready`
  (interval, with cleanup) since generation depends on embeddings. Confirm polling vs. a
  websocket/stream is acceptable.
- **Streaming transport**: proposal assumes NDJSON (or SSE) lines parsed into typed events by
  `apiStream`. Confirm which the backend emits.
- **No `data.ts`**: this workflow will import nothing from `src/lib/data.ts`. Other screens
  keep using it (out of scope).
