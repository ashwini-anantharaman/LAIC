# Tutorial V2 — Section-by-Section Authoring: Implementation Plan

This is the full design + implementation spec for evolving the **`tutorial-v2`** object type
(the isolated fork already created) into "Approach 2": a **human-first, section-by-section**
authoring mode where the tutorial is built as a saved skeleton and each section is authored
independently — either written by hand (with AI refine) or generated on demand for just that
section. It reuses the existing V2 machinery wherever possible and touches **only the
`tutorialV2/` fork** — never the original Tutorial.

---

## 1. What V2 is, and how it differs from V1

**V1 (Approach 1, "AI-first"):** one linear pipeline for the whole tutorial (Plan → Sources →
Mark up → Extract → Define → **Generate**), ending in a single whole-tutorial generation the
author then curates. The tutorial only becomes real at the end.

**V2 (Approach 2, "human-first"):** two things flip.
1. The tutorial becomes a **persistent, saved skeleton** immediately after structure is set —
   an ordered list of defined-but-empty sections the author returns to across sessions.
2. Authoring happens **one section at a time, on demand.** There is **no whole-tutorial
   Generate.** Instead the author enters a section and fills it — by hand (AI refines) or by a
   **section-scoped** mini-pipeline (pick sources → mark up → generate *for just this
   section*). AI is a tool the author summons per section, not a pipeline that runs once.

The unit of work shrinks from "the tutorial" to "this section." Everything below serves that.

---

## 2. Isolation & reuse principles

- **Work only in the `tutorialV2/` fork.** All new logic lives in `src/lib/tutorialV2/*` and
  `src/app/components/screens/tutorialV2/*`. The original Tutorial (`ObjectCreator.tsx`,
  `tutorialTemplates.ts`, etc.) stays byte-for-byte untouched.
- **Reuse over rebuild.** The template editor, sources UI, markup workspace, extract/generation
  engine, block-level AI refine, and embed generation all already exist. V2 re-exposes them at
  the **section** level; it does not reimplement them.
- **Shared files stay shared only while type-agnostic.** `MarkupWorkspace`, `MarkupFlagReview`,
  `libraryEmbed`, the `api.ts` tutorial endpoints, and `server/index.mjs` generation remain
  shared. The moment V2 needs one to behave differently, fork that file into `tutorialV2/`
  rather than editing the shared one.
- The main file that gets substantially **reworked** is
  `src/app/components/screens/tutorialV2/ObjectCreatorTutorialV2.tsx` — its top-level flow
  changes from the linear V1 rail to the V2 flow in §5. That's expected: it's the fork.

---

## 3. The section state machine (the backbone — everything derives from this)

**Decision: one section workspace, two ways to fill it.** A section is just "content,"
authored however the author likes. "Write it myself" and "Generate it" are **two entry points
into the same section workspace**, not two separate modes. This is what lets a single tutorial
**mix** generated, hand-written, and AI-refined sections — the entire point of "more control."
An author can generate a section then hand-edit it, or write it then AI-refine it.

**Per-section status** (what the navigator shows at a glance):

| Status | Meaning | How it's set |
|---|---|---|
| `not_started` | no content, no sources picked, no markup | derived (nothing authored) |
| `in_progress` | has picked sources, markup, and/or partial content, but not confirmed | derived (any authoring exists, not done) |
| `done` | author has marked the section complete | explicit toggle by author |

`done` is an **explicit** flag the author sets ("Mark section done"); `not_started` vs
`in_progress` is **derived** from whether any authoring artifacts exist. A `done` section can be
re-opened and edited (which does not silently un-done it; edits keep it `done` unless the author
un-marks).

**Author-mode provenance** (informational, drives small UI hints): `empty` → `written` |
`generated` | `mixed` (generated then hand-edited, or written then AI-refined).

The tutorial is **complete** when every **required** section is `done`. Optional sections may be
left `not_started`. Completion unlocks the final review/submit gate (§10).

---

## 4. Data model

New/extended types live in `src/lib/tutorialV2/types` (or extend `types.ts` under the
`tutorial-v2` namespace). The section content reuses the **same part model** as V1 output, so the
learner reader and embed inject work unchanged.

```ts
type SectionStatus   = 'not_started' | 'in_progress' | 'done';
type SectionAuthorMode = 'empty' | 'written' | 'generated' | 'mixed';

interface V2Section {
  id: string;                 // stable section id (created with the skeleton)
  title: string;
  intent?: string;            // one-line "what this section teaches"
  recipe: RecipeItem[];       // this section's shape from the chosen template (blocks + embed slots)

  // authored content (same TutorialPart model V1 generation produces):
  parts: TutorialPart[];      // the section's blocks/embeds once authored

  // section-scoped authoring state (for the 4b generate path):
  pickedSourceIds: string[];  // subset of the tutorial source pool used for THIS section
  highlights: Highlight[];    // section-scoped markup
  units?: ContentUnit[];      // extracted units for this section

  authorMode: SectionAuthorMode;
  done: boolean;              // explicit "mark done"
  required: boolean;          // from template/recipe; drives completion gate
}

interface TutorialV2Draft {   // the savable skeleton (a real persisted object)
  id: string;
  type: 'tutorial-v2';
  title: string;
  metadata: Record<string, unknown>;   // Step-1 metadata (audience/level/etc. as applicable)
  templateId: string;                  // chosen V2 template
  structure: {                         // knobs from the template (connection, assessment, depth, endWith…)
    connection: SectionConnection;
    assessment: AssessmentPlacement;
    depth: Depth;
    endWith: EndWith;
    // …the rest of the template's structural knobs
  };
  sections: V2Section[];               // the skeleton — filled section by section over time
  sourcePool: SourceRef[];             // shared sources attached once (§ Sources)
  status: 'draft' | 'ready' | 'submitted';
  createdAt: number;
  updatedAt: number;
}
```

`status: SectionStatus` is a **derived selector** over `V2Section`:
`done ? 'done' : (parts.length || pickedSourceIds.length || highlights.length) ? 'in_progress' : 'not_started'`.

**Persistence:** `TutorialV2Draft` is saved as a real `LearningObject` of `type: 'tutorial-v2'`,
`status: 'draft'`, through the **same object/draft persistence V1 objects use** (extended to
carry `sections[].parts` + per-section authoring state), so it survives across sessions. It is
**namespaced** so it never collides with V1 drafts (V2 drafts carry `type: 'tutorial-v2'`; V2
templates already use `laic-tutorial-v2-templates`).

---

## 5. End-to-end authoring flow (the surfaces)

The V2 top-level flow (in `ObjectCreatorTutorialV2.tsx`) replaces V1's linear 6-step rail with:

**A. Start — Title & metadata → Save.**
A small first screen: name the tutorial + set metadata, then **Save** — which immediately
persists a `TutorialV2Draft` (empty `sections`). The tutorial now exists as a real, returnable
draft. (New surface; tiny.)

**B. Structure — pick template, shape sections → Save.**
Reuse **`TutorialTemplateEditorV2` / `TutorialTemplatePickerV2`**: choose a template, add/define/
move/rename the section blocks, optionally save a new template. On Save, the draft's `sections[]`
skeleton is created from the resolved recipe (one `V2Section` per defined section, each seeded
with its recipe shape, `required` flag, empty `parts`). The tutorial is now a **saved skeleton**.

**C. Sources — attach a shared pool.**
Reuse the existing Sources screen; sources attach to `draft.sourcePool` (tutorial-level). Sources
are **not** re-picked from scratch per section — each section's generate path sub-selects from
this pool (§8). Sources is skippable if the author intends to hand-write everything.

**D. Section navigator — the loop (§7).**
The outline of sections with per-section status. The author clicks into one section at a time.

**E. Per-section workspace (§8).**
Inside a section: two ways to fill it — **4a** write + AI-refine, or **4b** section-scoped
generate. Edit freely. Mark done.

**F. Review & assemble → submit (§10).**
When all required sections are `done`, the author sees the whole tutorial stitched together and
can submit/publish.

Sections A–C are a short linear setup; D–E is the repeatable core; F is the exit.

---

## 6. The savable skeleton (persistence)

- After **Structure (B)**, the tutorial is a persisted `TutorialV2Draft` with an ordered,
  defined-but-empty `sections[]`. It appears in **My Submissions / drafts** and can be reopened
  any time to continue authoring.
- Every meaningful edit (attach source, author a section, mark done) **autosaves** the draft, so
  no work is lost across sessions.
- Reopening a draft drops the author back into the **section navigator (D)** with each section's
  status restored.
- The draft is the single source of truth; the navigator and section workspace are views over it.

---

## 7. The section navigator (new build)

The control surface for section-by-section authoring. An outline/list of `draft.sections` in
order, where each row shows:

- section index + title (+ intent as subtext),
- a **status pill** (`not_started` / `in_progress` / `done`) with a subtle color,
- a small **author-mode hint** (e.g. "generated", "written", "mixed") once filled,
- a progress affordance (e.g. "3 of 6 sections done") in the navigator header.

Behaviors:
- Click a section → open its **workspace (§8)**.
- The navigator is always reachable (a persistent outline / back button from a section).
- A "required sections remaining" indicator; the **Review & submit** action (§10) is enabled only
  when every required section is `done`.
- Reorder/rename of sections is done in **Structure (B)**, not here — the navigator is for
  authoring, not restructuring (keeps the two concerns separate).

Reuse: the status-pill and outline patterns already exist in the app (StatusPill, list rows); this
is composition, not new primitives.

---

## 8. The per-section workspace (the heart)

Opening a section shows its **blocks from the recipe** (e.g. heading → explanation → worked example
→ embedded quiz), initially empty, plus the two authoring entry points. Both write to the same
`section.parts`, so they compose.

### 8a. Write it yourself + AI refine
- The author types/pastes content directly into the section's blocks (inline block editors, reusing
  the existing block editing from the V1 object editor).
- AI is invoked **only to refine** selected text — reuse the block-level "Ask AI" / edit-block
  pattern (`/api/…/edit-block` or the assistant refine call), scoped to the selected block/text:
  "simplify", "tighten", "match reading level", or a free instruction. AI assists; it never drafts
  the section unprompted.
- Sets `authorMode = 'written'` (or `'mixed'` if later generated content is mixed in).

### 8b. Generate this section (section-scoped pipeline)
This is V1's Sources→Mark up→Extract→Generate pipeline **scoped to one section, invoked on demand**
— reusing the existing engine:
1. **Pick sources for this section:** from `draft.sourcePool`, sub-select which sources this section
   draws on → `section.pickedSourceIds`.
2. **Mark up for this section:** reuse `MarkupWorkspace` over the picked sources, producing
   `section.highlights` (the same tags/scan/highlight machinery, just section-scoped).
3. **Generate this section:** call the **existing section-scoped generation** — the same grounded
   generator that already produces one section's content from that section's units (this is exactly
   what embed generation and V1's per-section prompt already do). It writes grounded, cited content
   into `section.parts` at the recipe shape, at the template's depth. Embedded objects in the
   recipe are generated/pinned per §9.
4. **Edit:** the generated `parts` are fully editable in place (same block editors as 8a); the
   author can also AI-refine any block. This makes `authorMode = 'generated'` → `'mixed'` once
   hand-edited.

Because both paths write `section.parts`, an author can generate a rough draft and then hand-edit,
or write a skeleton and generate to fill gaps — freely mixed.

**Grounding & constraints (unchanged from V1):** section generation draws **only** from that
section's picked sources/units — grounded, cited, no invented facts, no `aiExtra`. Length follows
the section's content + depth (no word target). An empty/unmarked section that the author tries to
generate is flagged ("pick and mark up sources first") rather than hallucinated.

**Mark done:** a "Mark section done" toggle sets `section.done = true`. Done sections show complete
in the navigator; they remain editable.

---

## 9. Embedded objects — per section

Embedded objects (quiz, concept card, assignment, etc.) are authored **inside the section they
belong to**, using the V2 embed machinery already built:
- **Generate-new embeds** are generated from that section's units when the section is generated
  (8b) — reuse `tutorialEmbedGenerate` scoped to the section — or on demand in 8a.
- **Pick-from-library embeds** are resolved to their pinned versions and spliced into the section's
  `parts` via the existing `libraryEmbed` positioner (per-section recipe position).
- **Prompt-when-authoring embeds** surface a resolver in the section workspace (choose generate vs
  pick) — this is the natural home for that mode in V2, since authoring is already per-section.

This fits V2 more naturally than V1: embeds are just part of authoring "this section."

---

## 10. Review, assembly & completion gate (new build)

Because the tutorial is built in fragments and the author never saw it whole, V2 adds a final step:
- **Completion gate:** enabled only when every **required** section is `done`. The navigator surfaces
  what's left until then.
- **Review & assemble:** show the whole tutorial stitched together in reading order (all sections'
  `parts` concatenated by section order) — the first time the author sees the end-to-end result.
  Reuse the learner reader / preview rendering for `tutorial-v2` (already wired to treat V2 like
  tutorial for pagination + cumulative quiz).
- From here the author can jump back into any section to fix it (navigator remains reachable), then
  **submit/publish** — flipping `draft.status` from `draft` → `ready`/`submitted` through the same
  publishing path V1 objects use.

This restores the "see it whole" that V1 got for free from whole-tutorial generation.

---

## 11. Reuse map (what exists vs what's new)

| Concern | Source |
|---|---|
| Template editor / picker (Structure, step B) | **Reuse** `TutorialTemplateEditorV2` / `TutorialTemplatePickerV2` |
| Sources UI (step C) | **Reuse** existing Sources screen → `draft.sourcePool` |
| Per-section mark up (8b.2) | **Reuse** `MarkupWorkspace` / `MarkupFlagReview`, scoped to a section |
| Per-section grounded generation (8b.3) | **Reuse** the existing section-scoped generation (same engine as V1 per-section + embeds) |
| Block-level AI refine (8a) | **Reuse** the block "Ask AI" / edit-block pattern |
| Embedded object generate / pin (9) | **Reuse** `tutorialEmbedGenerate` + `libraryEmbed`, per section |
| Block editors (8a/8b edit) | **Reuse** existing object-editor block editing |
| Learner assembly/preview (10) | **Reuse** the learner reader (V2 already treated like tutorial) |
| **Savable skeleton / `TutorialV2Draft`** | **New** (persist skeleton + per-section content + status) |
| **Section navigator** | **New** (outline + status + enter section + mark done + progress) |
| **Per-section workspace shell** | **New** (hosts 8a/8b entry points over one section's `parts`) |
| **Title/metadata start screen (A)** | **New** (small) |
| **Review & completion gate (10)** | **New** |
| **Reworked V2 driver** | **Rework** `ObjectCreatorTutorialV2.tsx` top-level flow (A→F) |

Most of V2 is re-exposed V1 machinery; the genuinely new code is the **skeleton + navigator +
per-section shell + review gate** and the flow rework in the forked driver.

---

## 12. Persistence & namespacing (isolation from V1)

- V2 drafts are `LearningObject`s of `type: 'tutorial-v2'`, saved via the existing object/draft
  store, extended to hold `sections[].parts` + per-section authoring state. They never overwrite
  V1 drafts (different `type`).
- V2 custom templates already use `laic-tutorial-v2-templates`; the default-id map uses
  `['tutorial-v2']`. Nothing V2 does reads or writes V1's `laic-tutorial-templates`.
- Section-scoped highlights/units live on the `V2Section`, not shared with V1.

---

## 13. Locked decisions (the "more steps??" questions, answered)

1. **4a and 4b are two entry points into one section workspace** — sections can mix generated /
   written / AI-refined content. (§3, §8)
2. **Sources are a shared pool** attached once (step C); each section **sub-selects** from it in 4b.
   Not per-section-from-scratch. (§5C, §8b.1)
3. **Mixing is allowed and expected** across sections; per-section status makes "what's left"
   visible. (§3, §7)
4. **The tutorial is done when every required section is `done`**; that unlocks the review/submit
   gate. Optional sections may be left unstarted. (§3, §10)
5. **A final review/assembly step exists** — the author sees the whole tutorial before submit,
   restoring the "see it whole" V1 got from whole-tutorial generation. (§10)
6. **Embedded objects are authored per section**, inside their section. (§9)
7. **Structure/reorder happens in step B**, not in the navigator — authoring and restructuring are
   separate concerns. (§7)

---

## 14. Out of scope / deferred

- No changes to the original Tutorial (V1) or any other object type.
- No new server generation branch yet — V2 section generation calls the existing endpoints with the
  same payloads (scoped to a section's units). Fork the server tutorial branch only if/when V2
  section generation must diverge.
- No collaborative/multi-author editing, versioning of individual sections, or section-level review
  workflow in this plan (possible later).
- Scenario embeds remain deferred until a scenario generator exists (unchanged from prior decision).

---

## 15. Recommended build order (reference)

Not required to build in this exact order, but the low-risk sequence is:
the **section state machine + `TutorialV2Draft`/`V2Section` types** first (so every surface has a
model to operate on), then the **savable skeleton** (A–C persist a real draft), then the **section
navigator** (D: enter a section, see status, mark done), then **8a** (write + refine), then **8b**
(section-scoped pick→markup→generate, reusing the engine), then **embeds per section (9)**, then the
**review + completion gate (10)**. Each is independently verifiable, and all of it lives in the
`tutorialV2/` fork.
