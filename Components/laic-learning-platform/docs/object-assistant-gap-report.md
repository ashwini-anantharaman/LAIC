# Object Assistant — Gap Report (Course-Dev Co-Author Panel)

**Status:** Proposal only. No implementation until explicit “go.”  
**Scope allowed for later work:** New `AssistantPanel` (+ children), assistant state (React only), typed edit-action / proposal layer, minimal wiring inside the Object Editor screen(s) that course-dev uses when an object is open for edit, new types in `src/lib/types.ts`, and a single typed API boundary in `src/lib/assistant.ts` (+ thin additions in `src/lib/api.ts` / tutorial-scoped server routes if needed).  
**Out of scope:** Course Wizard, admin / reviewer / coach / student chrome, sidebar, top bar, login; changing other object types’ *create* workflows beyond reusing the shared editor mutation patterns they already expose. If a change outside this scope seems required, stop and ask first.

**Guiding principle:** The assistant is a **context-aware co-author for the one open object**. It never silently mutates. Every edit is a **typed `EditAction`** proposed as a reviewable **diff**, applied only on explicit Accept through the **same mutation path** the manual editor uses (plus a new undo stack that wraps that path).

---

## 1. What the Object Editor exposes today

Primary surface for tutorials: `ObjEditor` in `src/app/components/screens/ObjectCreator.tsx` (~line 1543). Sibling editors follow the same “immediate AI apply” pattern: `FlashcardEditor`, `QuizEditor`, `ConceptCardEditor`, and `*Editor` shells in `StructuredObjectEditors.tsx`.

### 1.1 Tutorial `ObjEditor` — state and mutation primitives

| State | Role |
| --- | --- |
| `parts` / `setParts` | Ordered working list of editor parts (`rich-text` \| `concept-card` \| `question` \| `image` \| `video`) |
| `mode` | `'edit' \| 'preview'` (Student preview via `LearningBlocksPreview`) |
| `editId` | Which part is open in `EditPanel` (manual fields) |
| `aiId` | Which part is open in `AskAiPanel` |
| `docTitle`, `objective` | Object title + description (learning objective text) |
| `objectStatus`, `savedId` | Draft / in-review persistence via `addObject` |

**Typed-ish mutation helpers (exact names):**

```ts
updatePart(id, patch)           // map over parts; merge patch into one part
addBlock(type)                  // 'rich-text' | 'concept-card' | 'question' only
setParts(prev => …)             // reorder (swap), delete (filter), bulk replace
buildBlocks()                   // parts → Block[] for save / student preview
save(status)                    // addObject({ blocks, pipelineDraft, … })
```

There is **no** named action registry, **no** command pattern, and **no** undo stack today — mutations call `setParts` / `updatePart` / `setDocTitle` / `setObjective` directly.

### 1.2 Per-block controls (tutorial)

Exact UI controls on each part card:

| Control | Behavior |
| --- | --- |
| **Ask AI** | Toggles `aiId`; opens inline `AskAiPanel` (not image/video) |
| **Edit** | Toggles `editId`; opens inline `EditPanel` (heading / subheads / body / question fields) |
| **↑ / ↓** | Swap adjacent parts via `setParts` |
| **Delete** | `setParts(prev => prev.filter(…))` |
| **Add block** | Text / Concept card / Question only (`addBlock`) |

Media (`image` / `video`) use `ImagePartEditor` / `VideoPartEditor`; Ask AI is explicitly excluded for those types.

### 1.3 Whole-object controls (tutorial)

| Control | Behavior |
| --- | --- |
| Title / objective fields | Direct state |
| **Student preview** | Sticky header + footer toggle → `LearningBlocksPreview` |
| **Save draft** | `save('draft')` → library via `addObject` |
| **Submit for review** | `save('in-review')` |
| “✦ Edit with AI” (footer, older) | Replaced / coexists with preview button — **not** a working whole-object AI path |

### 1.4 How Ask AI works today (critical gap vs proposal)

`AskAiPanel` → `editTutorialBlock(part, instruction)` → `POST /api/tutorials/edit-block` with body `{ part, instruction }` only.

```ts
const edited = await editTutorialBlock(part, ins);
onApply(fields);   // → updatePart(id, fields) IMMEDIATELY
onClose();
```

- Applies **immediately** — no BEFORE→AFTER, no Accept/Reject.
- Grounding payload is **only the single part JSON + instruction** — does **not** send `knowledgeBase`, `extracts`, `highlights`, `fv`, or citations.
- Same immediate-apply pattern in Quiz / Flashcard / Concept / Structured editors via `editQuizQuestion`, `editFlashcard`, `editConceptCard`, `editStructuredObject` (`POST /api/ai/edit-item`).

### 1.5 Learner Ask AI (related, different product)

`AskAIChat` + `objectToContext(obj)` + `askAboutObject` (`POST /api/ask`) is a **read-only learner chat** grounded in flattened block text. It is mounted from `LearnerReader`, **not** from `ObjEditor`. It does not mutate. Useful as a prior art for Q&A UX and `objectToContext`, but **not** the course-dev co-author.

### 1.6 Selection today

| Kind | Exists? | Mechanism |
| --- | --- | --- |
| Selected block | Soft yes | `editId` / `aiId` (which panel is open) — not a first-class “selection” model |
| Text range in a block | **No** | No `selectionStart` / `getSelection` wiring in editors |
| Whole object | Implicit | When neither `editId` nor `aiId` is set |
| Pipeline markup selection | Separate | Sentence indices in Mark up (`highlights[].idx`) — not editor cursor |

### 1.7 Undo / redo today

**None** in Object Editor or sibling editors. No history stack. Publishing “versions” UI elsewhere is unrelated.

### 1.8 Pipeline context available on the open object (but unused by Ask AI)

`snapshotPipeline()` → `CreatorPipelineDraft` saved on `LearningObject.pipelineDraft`:

`srcMode`, `promptText`, `pasteText`, `ytUrl`, `doc`, `highlights`, `extracts`, `knowledgeBase`, `templateId`, `shapeIntent`, `fv`, `scope`, `media`, `sel`, `roles`, `urlRefs`, `reached`, `step`.

`fv` holds Define knobs (e.g. tutorial: `obj`, `topic`, `aud`, `lvl`, `secs`, `prog`, `dpth`, `end`, `chks`, `templateId`, …).

### 1.9 UI primitives available for a side panel

- `src/app/components/ui/sheet.tsx` (Radix sheet) — exists; **not** used by Object Editor today.
- Editors use **inline** expand panels, not Sheets.
- Proposal: mount assistant in a right **Sheet** (or sticky column) beside `ObjEditor` so it matches app primitives without inventing a new design system.

---

## 2. How the assistant must reuse existing edit paths (one path, one undo)

### 2.1 Principle

Introduce a thin **`applyEditAction(action: EditAction): void`** (or reducer) owned by the Object Editor host. Both:

1. Manual UI controls, and  
2. Accepted assistant proposals  

call **only** this function. The assistant never calls `setParts` / `updatePart` directly.

### 2.2 Mapping today’s mutations → shared actions

| Manual control today | Shared `EditAction` (proposed) | Implementation behind the action |
| --- | --- | --- |
| `updatePart` / `EditPanel` | `update_block` | `updatePart` / typed field merge |
| `addBlock` | `add_block` | Same factory as `addBlock` + insert index |
| ↑ / ↓ / intentional reorder | `reorder_blocks` | `setParts` with new order |
| Delete | `delete_block` | filter by id |
| Title / objective fields | `update_metadata` | `setDocTitle` / `setObjective` (+ optional `fv` patch) |
| (new) split / merge / convert | `split_block` / `merge_blocks` / `convert_block` | Compose from update + add + delete |
| (new) text-range rewrite | `update_block_range` | String splice inside `body` / prompt, then `update_block` |
| Quiz / flashcard field edits | `update_quiz_item` / `update_flashcard_item` | Same as those editors’ `updateQ` / `updateCard` when those editors host the panel |

### 2.3 Undo / redo (must be added — does not exist)

Wrap `applyEditAction` with an in-memory history (React state only):

```ts
type HistoryEntry = {
  id: string;
  label: string;           // "Accepted: shorten block 3"
  inverse: EditAction[];   // exact inverse actions
  forward: EditAction[];
  at: number;
  source: 'manual' | 'assistant';
};
```

- On apply (manual or Accept): push `forward` + store `inverse`; clear redo.
- Undo = apply `inverse`; Redo = apply `forward`.
- Assistant Accept uses the **same** stack → “AI edits indistinguishable from manual” for undo.

### 2.4 Deprecation path for inline Ask AI

Keep existing `AskAiPanel` temporarily **or** route its result through the proposal system:

**Recommended:** New assistant panel becomes the sole AI surface for tutorials in scope; inline `AskAiPanel` either (a) opens the side panel with a prefilled chip scoped to that block, or (b) is left untouched in this pass if wiring risk is high — but **accepted** assistant edits must still go through `applyEditAction`. Do **not** leave a second silent-apply path for the new assistant.

### 2.5 What we do **not** reuse as the edit API

- `editTutorialBlock` as a silent applicator — may remain as a **low-level model helper** that returns a candidate part for a proposal, but UI must not `onApply` without Accept.
- `askAboutObject` — reuse only for **read-only** Q&A shape; extend payload with structured `AssistantContext`, not flat string alone.

---

## 3. Proposed TypeScript types (`src/lib/types.ts`)

Add a dedicated section (do not overload `LearningObject` internals beyond optional soft links):

```ts
/** Where the developer’s focus is inside the open object. */
export type ObjectSelection =
  | { kind: 'none' }                                    // whole-object scope
  | { kind: 'block'; blockId: string }
  | { kind: 'block_range'; blockId: string; start: number; end: number; selectedText: string }
  | { kind: 'multi_block'; blockIds: string[] };

/** Live snapshot always sent with assistant turns. */
export interface AssistantContext {
  objectId: string;
  objectType: ObjectType;
  title: string;
  status: ObjectStatus;
  scope?: string;
  metadata: {
    objective?: string;
    audience?: string;
    level?: string;
    voice?: string;
    topic?: string;
    teachingApproach?: string;
    templateId?: string;
    /** Other Define knobs from pipelineDraft.fv */
    extras?: Record<string, unknown>;
  };
  provenance: {
    srcMode?: CreatorPipelineDraft['srcMode'];
    sourceCount: number;
    highlightCount: number;
    extractCount: number;
    highlights?: CreatorPipelineDraft['highlights'];
    extracts?: CreatorPipelineDraft['extracts'];
    knowledgeBase?: ClusteredKnowledgeBase;
    mediaSummary?: { id: string; kind: string; caption?: string }[];
  };
  blocks: Array<{
    id: string;
    index: number;
    type: Block['type'];
    label?: string;
    content: BlockContent;
    /** Best-effort citation / extract linkage if known */
    sourceRefs?: string[];
  }>;
  selection: ObjectSelection;
}

export type AssistantMessageRole = 'user' | 'assistant' | 'system';

export interface AssistantCitation {
  kind: 'block' | 'extract' | 'highlight' | 'cluster';
  id: string;
  label?: string;
}

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  at: number;
  citations?: AssistantCitation[];
  /** Proposals attached to this assistant turn */
  proposalIds?: string[];
  streaming?: boolean;
  error?: string;
}

/** Structured edit the model wants; never auto-applied. */
export type EditAction =
  | { type: 'update_block'; blockId: string; patch: Record<string, unknown>; reason?: string }
  | { type: 'update_block_range'; blockId: string; start: number; end: number; replacement: string; reason?: string }
  | { type: 'add_block'; atIndex: number; blockType: Block['type']; content: BlockContent; label?: string; reason?: string }
  | { type: 'delete_block'; blockId: string; reason?: string }
  | { type: 'reorder_blocks'; order: string[]; reason?: string }
  | { type: 'split_block'; blockId: string; atOffset: number; reason?: string }
  | { type: 'merge_blocks'; blockIds: [string, string]; reason?: string }
  | { type: 'convert_block'; blockId: string; toType: Block['type']; content: BlockContent; reason?: string }
  | { type: 'update_metadata'; patch: Partial<{ title: string; objective: string; audience: string; level: string; voice: string; fv: Record<string, unknown> }>; reason?: string }
  | { type: 'update_quiz_item'; blockId: string; questionIndex: number; patch: Record<string, unknown>; reason?: string }
  | { type: 'update_flashcard_item'; blockId: string; cardIndex: number; patch: Record<string, unknown>; reason?: string }
  | { type: 'batch'; actions: EditAction[]; reason?: string };

export type EditDiffKind = 'text' | 'structural' | 'metadata' | 'batch_item';

export interface EditDiff {
  id: string;
  kind: EditDiffKind;
  summary: string;                 // plain-language
  beforeText?: string;
  afterText?: string;
  /** For structural: human description + optional preview block snapshot */
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  blockId?: string;
  action: EditAction;              // atomic action this diff applies
}

export type ProposedEditStatus = 'pending' | 'accepted' | 'rejected' | 'edited_accepted';

export interface ProposedEdit {
  id: string;
  messageId: string;               // assistant turn that produced it
  status: ProposedEditStatus;
  title: string;
  diffs: EditDiff[];               // one or many (batch)
  createdAt: number;
}

export type AssistantActionResult =
  | { ok: true; kind: 'answer'; message: AssistantMessage }
  | { ok: true; kind: 'proposal'; message: AssistantMessage; proposal: ProposedEdit }
  | { ok: true; kind: 'clarify'; message: AssistantMessage }
  | { ok: false; code: string; message: string };

export interface AssistantSessionState {
  objectId: string;
  messages: AssistantMessage[];
  proposals: ProposedEdit[];
  changeLog: Array<{
    id: string;
    at: number;
    summary: string;
    blockIds: string[];
    proposalId?: string;
  }>;
  busy: boolean;
  error: string | null;
}

/** Request payload for the typed assistant boundary. */
export interface AssistantTurnRequest {
  context: AssistantContext;
  selection: ObjectSelection;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Optional quick-action id when chip-driven */
  quickAction?: AssistantQuickActionId;
}

export type AssistantQuickActionId =
  | 'improve_block'
  | 'make_simpler'
  | 'shorten'
  | 'add_example'
  | 'write_check'
  | 'fix_grounding'
  | 'coverage_check'
  | 'summarize';
```

Supporting module (not types): `src/lib/assistant.ts` — `buildAssistantContext(...)`, `streamAssistantTurn(...)`, `validateEditAction(...)`, pure helpers for inverse actions.

---

## 4. Proposed `AssistantPanel` component tree and mount

### 4.1 Component tree

```
AssistantPanel                      // Sheet / sticky right column; collapsible
├── AssistantHeader                 // title, collapse, object chip (type · title)
├── AssistantChangeLog              // session log; click → focus block (setSelection)
├── AssistantMessageList
│   ├── AssistantMessageBubble      // markdown + citation chips → jump to block
│   ├── ProposalCard                // BEFORE→AFTER diffs
│   │   ├── TextDiffView            // inline / side-by-side readable diff
│   │   ├── StructuralDiffView      // add/delete/reorder preview
│   │   └── ProposalActions         // Accept | Reject | Edit-then-accept
│   │       └── BatchProposalActions // Accept all | Reject all | per-item
│   └── ThinkingIndicator           // streaming / working state
├── AssistantQuickActions           // chips above input (scoped to selection)
└── AssistantComposer               // textarea + send; disabled while busy
```

Optional children: `AssistantEmptyState`, `AssistantErrorBanner`.

### 4.2 Mount point (minimal Object Editor wiring)

**Primary mount:** Inside `ObjEditor` (tutorial draft editor) as a right-hand sheet/column that remains available in both Edit and Student preview modes (“at all times” while the object editor is open).

```
ObjEditor
├── (existing sticky header: back · chips · Edit|Preview)
├── body row: [ main editor | AssistantPanel ]
└── (existing sticky footer: preview · save · submit)
```

**Props / shared context from host:**

```ts
<AssistantPanel
  open={assistantOpen}
  onOpenChange={setAssistantOpen}
  context={assistantContext}          // built every render from live parts + pipelineDraft + selection
  selection={selection}
  onSelectionChange={setSelection}    // panel citations can focus a block
  onApplyActions={(actions) => applyEditActions(actions)}  // ONLY accept path
  historyControls={{ undo, redo, canUndo, canRedo }}
/>
```

**Selection wiring (minimal, additive):**

- Clicking a part card sets `selection = { kind: 'block', blockId }`.
- Opening Edit / Ask AI also sets block selection.
- Future: textarea `onSelect` in `EditPanel` → `block_range` (start/end/selectedText). Until that lands, range edits are unavailable and the assistant must ask to select text or operate on the whole block.

**Session state:** React `useReducer` keyed by `objectId` in the host (or a small `AssistantProvider` wrapping only `ObjEditor`). Cleared when leaving that object’s editor; **no** `localStorage`.

### 4.3 Sibling editors (scope note)

The product brief says “the ONE learning object currently open.” Mounting first in **tutorial `ObjEditor`** matches current course-dev gravity. Quiz / Flashcard / Concept / Structured can adopt the same panel later by supplying their own `applyEditAction` adapters — **not** in the first implementation unless you expand scope after review.

### 4.4 Do not mount in

Learner `AskAIChat`, Course Wizard, library list, admin, sidebar, top bar.

---

## 5. Catalog of typed `EditAction`s ↔ product features + diff/approval model

### 5.1 Action catalog (mapped to feature numbers)

| # | Feature | Primary `EditAction`(s) | Notes |
| --- | --- | --- | --- |
| 13 | Edit selected block (rewrite / simplify / …) | `update_block` | Model returns patched fields; shown as text diff |
| 14 | Edit selected text range | `update_block_range` | Requires `ObjectSelection.block_range`; else clarify |
| 15 | Add block at position | `add_block` | Structural diff + preview of new content |
| 16 | Knowledge check after block | `add_block` (`question` / `quiz`) at `index+1` | Ground from that block + cluster |
| 17 | Convert block type | `convert_block` | Structural before/after snapshots |
| 18 | Reorder | `reorder_blocks` | Plain-language + order preview |
| 19 | Delete / split / merge | `delete_block` / `split_block` / `merge_blocks` | Structural |
| 20 | Quiz / flashcard structural edits | `update_quiz_item` / `update_flashcard_item` | Validate ≥2 correct for multi-select etc. before Accept enabled |
| 21 | Metadata | `update_metadata` | Diff title/objective/voice fields |
| 22 | Whole-object batch | `batch` of per-block actions | Multi-diff UI: Accept all / Reject all / per-item |
| 23 | Ground-fix | `update_block` and/or `add_block` (`source-excerpt`) and/or `delete_block` | Offer choices; never invent citation |
| 24 | Regenerate preserving intent/citation | `update_block` (as alternative proposal) | Present as comparable proposal, not silent replace |

Read-only features (7–12) emit **no** `EditAction` — only `AssistantMessage` (+ optional suggested quick actions that *then* create proposals).

### 5.2 Diff / approval data model

Flow:

1. User message (+ context + selection) → `streamAssistantTurn`.
2. Model returns either prose answer and/or one `ProposedEdit` with `diffs[]`.
3. Each `EditDiff` embeds the atomic `EditAction` to run on Accept.
4. UI:
   - **Accept** → `applyEditAction(diff.action)` → history push → proposal `accepted` → changeLog entry (link `blockId`).
   - **Reject** → status `rejected`; no mutation.
   - **Edit-then-accept** → developer tweaks `afterText` / fields in the card → rebuild action → Accept.
   - Batch: Accept all = apply remaining pending diffs in order; Reject all; or per-item.
5. Undo/Redo from history stack (feature 28).

### 5.3 Streaming

SSE (same pattern as `generateTutorial`) for assistant tokens + a final `proposal` event. Visible thinking state while `busy`. If the stream fails: honest error in panel; **no** fabricated answer or demo proposal (feature 36).

### 5.4 Safety mapping (30–33)

| Guard | Enforcement |
| --- | --- |
| Scope to open object | Context `objectId` fixed; refuse actions naming other ids |
| Role / status | If status/`in-review` rules block edits, return clarify/error — do not apply |
| No fabricated citations | Server + client: citations must resolve to ids in `AssistantContext`; else say so + ground-fix options |
| Ambiguity | Return `kind: 'clarify'` with one question |
| No silent apply | Apply path only from Proposal Accept buttons |

---

## 6. Grounded request payload shape

Single typed boundary: `src/lib/assistant.ts` → `src/lib/api.ts` → e.g. `POST /api/assistant/turn` (SSE).

### 6.1 Client → server

```ts
// AssistantTurnRequest (see §3)
{
  context: AssistantContext,     // full live snapshot (§B context layer)
  selection: ObjectSelection,    // duplicated at top-level for clarity
  message: string,               // user NL or chip-expanded instruction
  history: { role, content }[],  // session turns for THIS object only
  quickAction?: AssistantQuickActionId
}
```

**Context layer build (first implementation milestone):** `buildAssistantContext({ objectId, typeId, title, status, parts|blocks, pipelineDraft, fv, objective, selection })` must populate metadata, provenance (highlights / extracts / clusters), ordered blocks, and selection **before** any chat UI is considered done.

### 6.2 Server → client (stream)

```
event: token     { text }
event: status    { message: "Checking grounding…" }
event: message   { AssistantMessage }          // final prose + citations
event: proposal  { ProposedEdit }              // optional
event: error     { code, message }
event: done
```

### 6.3 Model contract (proposal honesty)

System instructions (server-side) must require:

- Answer only from `context` (object + sources/clusters); if unsupported, say so.
- Cite `block` / `extract` / `cluster` ids that exist in context.
- Emit edits **only** as structured `EditAction` JSON inside a proposal — never as “I already changed it.”
- Prefer selection scope: if `block_range`, edit only that span; if `block`, that block; if `none`, ask before whole-object batch unless the user clearly asked for whole-object.

### 6.4 Reuse vs new endpoints

| Existing | Reuse? |
| --- | --- |
| `POST /api/ask` | Pattern only (read-only); payload too weak (flat `context: string`) |
| `POST /api/tutorials/edit-block` | Optional internal helper to draft an `update_block` candidate — **not** the Accept path |
| `POST /api/ai/edit-item` | Same for quiz/flashcard/structured when those hosts adopt the panel |
| **New** `POST /api/assistant/turn` (SSE) | Required for conversation + proposals + grounding |

If the new endpoint is unavailable: panel shows a visible error; no mock replies; no silent demo diffs.

### 6.5 Quick-action chips → request

Chips set `quickAction` and optionally prefill `message`, always with current `selection`:

| Chip | Intent |
| --- | --- |
| Improve this block | Scoped rewrite |
| Make it simpler | Audience/level-aware simplify |
| Shorten | Condense |
| Add an example | `update_block` or follow-up `add_block` |
| Write a check for this | Feature 16 |
| Fix grounding | Feature 11→23 |

---

## 7. Implementation order (for after “go” — not started)

1. **Context layer:** `AssistantContext` + `buildAssistantContext` + selection state in `ObjEditor`.  
2. **`applyEditAction` + undo stack** wrapping existing `updatePart` / `setParts` / metadata setters.  
3. **Types + proposal UI** (`ProposedEdit`, Accept/Reject) with **stubbed** actions (no model) to prove the apply path.  
4. **`AssistantPanel` mount** (Sheet) + session chat state.  
5. **Typed `streamAssistantTurn`** + server route; wire read-only Q&A first (features 7–12).  
6. **Edit proposals** (13–24) + batch + change log.  
7. **Text-range selection** in `EditPanel` when ready.  
8. Only then consider mounting on Quiz/Flashcard/Concept editors.

---

## 8. Explicit gaps / risks to confirm before “go”

1. **First host only tutorials?** This report assumes `ObjEditor` first. Confirm if Quiz/Flashcard must ship in v1.  
2. **Inline Ask AI:** Keep, redirect into panel, or remove for tutorials?  
3. **Text-range selection** does not exist yet — v1 can ship block-level only with clarify-on-range-request, or block on range wiring.  
4. **Undo does not exist** — must be built as part of the assistant apply path (not optional for features 27–28).  
5. **Citations on blocks** are weak today (pipeline extracts exist; blocks don’t store `sourceRefs`). Grounding audit will be best-effort from provenance + content overlap until we optionally stamp refs at generate time (stamp = possible later; ask before changing generate).  
6. **Student preview mode:** Panel stays open; edits still go through Accept → parts → preview reflects them (good). Confirm.

---

**End of gap report. Stopping here pending your review and explicit “go.”**
