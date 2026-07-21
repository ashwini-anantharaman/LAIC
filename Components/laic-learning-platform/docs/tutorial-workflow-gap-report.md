# Tutorial Workflow — Gap Report (Templates + Structured Extract)

**Status:** Proposal only. No implementation until explicit “go.”  
**Scope allowed for later work:** Tutorial creation path in `ObjectCreator`, Extract step + data model, Define → Structure (template picker), `src/lib/types.ts`, small new child components, and the **Tutorial-only** generate/extract API surfaces the client already calls (`POST /api/tutorials/generate`, plus new typed extract helpers).  
**Out of scope:** Quiz / Flashcards / Concept card / Lesson / Summary / Reflection / Scenario / Assignment / Drill workflows, Course Wizard, admin / reviewer / coach / student chrome, sidebar, top bar, login.

**Guiding principle:** Template = pedagogical **SHAPE**; Extract clusters = typed **MATERIAL**; generation maps **one section ↔ one cluster** into the template’s block recipe. Neither is optional.

---

## 1. How Structure and Extract behave today

### 1.1 Define → Structure (Tutorial CFG)

Defined in `src/app/components/screens/ObjectCreator.tsx` as `CFG.tutorial`:

**Intent group**

| Field id | Label | Type | Default |
| --- | --- | --- | --- |
| `obj` | Learning objective | `area` | (empty) |
| `topic` | Overall topic | `text` | (empty) |
| `aud` | Audience | `pick` | `'High school'` |
| `lvl` | Level | `pick` | `'Basic'` |

**Structure group** (current first controls — no template)

| Field id | Label | Type | Default / options |
| --- | --- | --- | --- |
| `secs` | Sections / sub-lessons | `num` 2–8 | `3` |
| `prog` | Progression | `pick` | `'Linear build-up'` \| `'Prerequisite chain'` \| `'Themed clusters'` |
| `dpth` | Depth per section | `pick` | `'Overview'` \| `'Standard'` \| `'In-depth'` |
| `end` | End with | `pick` | `'End quiz'` \| `'End assignment'` \| `'Recap only'` \| `'None'` (default Recap) |

**Per section group**

| Field id | Label | Type | Default |
| --- | --- | --- | --- |
| `chks` | Checks per section | `num` 0–3 | `1` |
| `excpts` | Source excerpts (total) | `num` 0–3 | `1` |
| `wex` | Include a worked example | `bool` | `true` |

Rendered generically by `S4` via `Field` (stepper / pick pills / bool toggle). There is **no** `TutorialTemplate`, recipe, connection rule, assessment placement, or media-slot concept in CFG or state.

### 1.2 Client → generate payload (`runGenerate`)

In `ObjectCreator.tsx` `runGenerate`:

```ts
config: {
  obj, topic, aud, lvl,
  secs, prog, dpth, end,
  chks, excpts, wex,
}
extracts: extracts.map(e => ({ kind, text, from }))  // flat list only
media: media.map(m => ({ ref: id, kind, caption }))
```

No template id, no clusters, no per-section material binding.

### 1.3 Server generate shape (`buildGeneratePrompt` in `server/index.mjs`)

- Stuffing **all** extracts as a flat numbered list: `` `(${i+1}) [${e.kind||'Key point'}] ${e.text}` ``.
- Grounding language is soft: *“Prefer them; only add general connective explanation where needed”* — and if extracts are empty, explicitly allows generating from general knowledge.
- Structure instruction is only numeric prose:

  > Exactly `secs` sections. For EACH: one rich-text explanation (label `"Section N: <short title>"`), optional worked example, then `chks` questions…

- There is **no** per-section block recipe, no cluster→section map, no assessment placement rule beyond “N checks after each section,” no media-slot addresses (media is “place each ref somewhere pedagogically relevant”).

`normalizePart` accepts `rich-text` | `concept-card` | `question` | `media`. Question `label` is whatever the model returns (often repeated / generic).

### 1.4 Extract step (`S3`)

Function `S3({ extracts, setExtracts, markHighlights, docTitle, typeNoun })`:

1. **Pull** (`pull()`):  
   - Filters highlights with `tag === 'Use' || tag === 'Support'`.  
   - Dedupes only by **exact** `text` already present with `fromHl`.  
   - Maps every Use → `kind: 'Key point'`, Support → `kind: 'Fact'` via `KIND_FOR`.  
   - Text: `{ id, kind, from, fromHl: true, text }` — **1:1 copy**, no classification, no merge of near-duplicates, no clusters.

2. **Shape with AI**: uncontrolled `<input>` + `<button>Extract</button>` with **no `value` / `onChange` / `onClick`** — purely cosmetic.

3. **Add manually**: always seeds `kind: 'Key point'`.

4. **Unit UI**: flat list `#1…N`, `<select>` over `KINDS = ['Definition','Key point','Example','Quote','Fact','Procedure']`, editable `from` + `text`. No cluster panels, no merge stats, no gap flags, no structured table rows.

### 1.5 Section headings / questions (visible output bugs)

| Symptom | Cause in code |
| --- | --- |
| Sections lack real heading/subheading hierarchy | Prompt sets `label` like `"Section N: …"`, but save path maps rich-text to `{ type: 'rich-text', content: { text: p.body } }` — **`label` is dropped**. `LearnerReader` `RichText` only renders `content.text` (optional `##` in body). Preview in `ObjEditor` shows body text, not a section title hierarchy. |
| Checks feel untethered | Flat part list; questions not bound to a cluster id or section id; model invents order. |
| “Question 1” repeated | Model often sets every question `label` to `"Question 1"` / `"Knowledge check"`; client does not renumber on assemble. `DRAFT_PARTS` / add-block also hardcode `'Knowledge check'`. |

---

## 2. Every place units default to “Key point” or fail to type / dedupe / cluster

| Location | Behavior |
| --- | --- |
| `S3` `KIND_FOR` | `Use → 'Key point'` (always) |
| `S3` `pull()` | `kind: KIND_FOR[h.tag] \|\| 'Key point'` |
| `S3` “Add manually” | `kind: 'Key point'` |
| `conceptMarkupUnits()` (concept-card path — shared file, do not change behavior for other types when touching helpers) | Use → `'Key point'` |
| Server `extractLinesFrom` / tutorial prompt | Falls back to `'Key point'` when `kind` missing |
| Dedup | Exact string match on `fromHl` text only — no near-duplicate / overlap merge |
| Clustering | **None** — `extracts` is `any[]` with no `clusterId` |
| Structured tables / image score guides | Represented only as image media captions or prose sentences — no row/column fact model |
| Gap vs objective | **None** |
| Shape-with-AI instruction | **Not wired** — does not affect pull/type/merge |

---

## 3. Stubs, cosmetic controls, fake timers in the Tutorial workflow

| Item | Status |
| --- | --- |
| Extract “Shape with AI” input + **Extract** button | Cosmetic — no handlers |
| Mark-up AI suggest for Tutorial | **Real** — `suggestTutorialHighlights` → `POST /api/tutorials/suggest-highlights` |
| Mark-up AI suggest for non-pipeline types | Local heuristic + `setTimeout(..., 700)` in `S2.suggest` (not Tutorial when `onSuggest` is passed) |
| Tutorial generate | **Real** SSE LLM — but weakly grounded (see §1.3) |
| Tutorial edit-block Ask AI | **Real** |
| Demo `DRAFT_PARTS` in `ObjEditor` | Static seed if no `generatedParts` (edit path usually passes generated parts) |
| `CreatorPipelineDraft.extracts` | Typed as `any[]` — no knowledge-base shape persisted |
| Prompt-only source mode | Still allowed; generate may invent content when extracts empty |

---

## 4. Proposed TypeScript types (`src/lib/types.ts`)

Centralize new types (names per your brief):

```ts
/** Existing KINDS — promote from string literal union */
export type ContentUnitKind =
  | 'Definition' | 'Key point' | 'Example' | 'Quote' | 'Fact' | 'Procedure';

export type SectionConnectionRule =
  | 'sequential'           // builds on previous
  | 'standalone'           // may stand alone
  | 'prerequisite_chain';   // strict unlock order

export type AssessmentPlacement =
  | 'after_each_section'
  | 'end_only'
  | 'none'
  | 'checkpoints_after_each'; // Guided Walkthrough small checks

/** Block types inside a section recipe (generation targets) */
export type SectionRecipeBlockType =
  | 'section-heading'      // title + optional subheads (NEW — must survive into learner UI)
  | 'explanation'
  | 'worked-example'
  | 'source-excerpt'
  | 'instruction'          // walkthrough step
  | 'try-it'               // checkpoint prompt/question
  | 'principle'            // extracted from example-first
  | 'misconception'
  | 'correction'
  | 'scenario-advance'
  | 'knowledge-check'
  | 'media';

export interface MediaSlot {
  id: string;                 // e.g. 'diagram', 'demo-clip'
  kind: 'image' | 'video' | 'either';
  required?: boolean;
  /** Index in sectionBlockRecipe where a media part should be inserted */
  afterRecipeIndex: number;
  hint?: string;              // shown to author / used in prompt
}

export interface SectionBlockRecipeItem {
  type: SectionRecipeBlockType;
  /** Maps to ContentUnitKind preferences when filling from a cluster */
  preferKinds?: ContentUnitKind[];
  required?: boolean;
}

export type SectionBlockRecipe = SectionBlockRecipeItem[];

export interface TutorialKnobDefaults {
  secs?: number;
  prog?: string;
  dpth?: string;
  end?: string;
  chks?: number;
  excpts?: number;
  wex?: boolean;
}

export interface TutorialTemplate {
  id: string;
  name: string;
  description: string;
  builtin: boolean;           // true for shipped six; false for future custom
  sectionBlockRecipe: SectionBlockRecipe;
  sectionConnection: SectionConnectionRule;
  assessmentPlacement: AssessmentPlacement;
  mediaSlots: MediaSlot[];
  knobDefaults: TutorialKnobDefaults;
}

export interface ContentUnit {
  id: string;
  kind: ContentUnitKind;
  text: string;
  from?: string;
  fromHl?: boolean;
  clusterId?: string;
  /** Optional structured rows (e.g. score guide) */
  structured?: { columns: string[]; rows: string[][] };
  sourceHighlightIds?: number[];  // idxs merged into this unit
}

export interface ConceptCluster {
  id: string;
  name: string;
  unitIds: string[];
  /** Optional note for gap UI */
  covers?: string[];
}

export interface ClusteredKnowledgeBase {
  units: ContentUnit[];
  clusters: ConceptCluster[];
  /** Diagnostics */
  rawHighlightCount: number;
  mergedUnitCount: number;
  shapeIntent?: string;
  gaps?: CoverageGap[];
}

export interface CoverageGap {
  id: string;
  message: string;            // e.g. objective mentions scoring, no cluster covers it
  severity: 'warn' | 'error';
}

/** Generation: one section plan = template recipe + one cluster */
export interface TutorialSectionPlan {
  index: number;
  title: string;              // heading
  subheads?: string[];
  clusterId: string;
  recipe: SectionBlockRecipe;
  mediaPlacements: { slotId: string; mediaRef: string }[];
}

export interface TutorialGenerateRequest {
  title: string;
  config: TutorialConfig & { templateId: string };
  template: TutorialTemplate;           // full snapshot so server doesn’t need a registry
  knowledgeBase: ClusteredKnowledgeBase;
  sectionPlans: TutorialSectionPlan[];  // length ≈ secs / clusters
  prompt?: string;
  media: { ref: string; kind: 'image' | 'video'; caption?: string }[];
}
```

Also extend:

- `TutorialConfig` in `src/lib/api.ts` with `templateId?: string`.
- `CreatorPipelineDraft` with `knowledgeBase?: ClusteredKnowledgeBase`, `templateId?: string`, `shapeIntent?: string`.
- `RichTextContent` (or a dedicated section block) so **heading / subheads** persist into learner view — today `label` is lost on save.

**Data loading of templates:** e.g. `src/lib/tutorialTemplates.ts` exporting `BUILTIN_TUTORIAL_TEMPLATES: TutorialTemplate[]` (six built-ins). Custom templates later = same array shape from API; **no refactor**.

---

## 5. Proposed UI (component-by-component, existing patterns)

### 5.1 Define → Structure: template picker (FIRST control)

**Where:** Inside `CFG.tutorial` Structure group, **above** `secs` — either:

- Special-case in `S4` when `typeId === 'tutorial'` (recommended, like concept-card Intent chips), **or**
- New field type `template` on `FDef` handled only for tutorial.

**Component:** `TutorialTemplatePicker`

- Props: `templates`, `value: templateId`, `onChange(templateId)`.
- Layout: stack of selectable cards (reuse Style of Define pick pills / rounded-2xl bordered cards used in Extract pull row and Scope pills): name (semibold 13), one-line description (12, `#6B7280`), selected = dark fill `#0B0F1A` / white text (same as `Field` pick selected).
- Default selected: `concept-example-practice`.
- On select: write `fv.templateId` **and** apply `knobDefaults` into `fv` (`secs`, `prog`, `dpth`, `end`, `chks`, `excpts`, `wex`) without locking — subsequent knob edits override.

**Built-in cards (copy):**

1. Concept, Example, Practice — default  
2. Guided Walkthrough  
3. Worked Example First  
4. Explain, Misconception, Correct  
5. Scenario Driven  
6. Reference / Cheat Sheet  

(Recipes / connection / assessment / media slots as specified in the product brief — encoded in `TutorialTemplate` data.)

### 5.2 Extract: enriched knowledge base UI

Replace / extend `S3` for **tutorial only** (`typeNoun` / `typeId === 'tutorial'`), keeping the same chrome for other types if they still share `S3` — **branch so Quiz/Flashcard extract UI is unchanged**.

**New / upgraded pieces:**

| Component | Role |
| --- | --- |
| `ExtractPullPanel` | Existing pull row + new copy: “Classify, merge, and cluster…”; after pull show `Merged N highlights → M units`. |
| `ShapeWithAiBar` | Controlled input + Extract button → calls typed `shapeTutorialExtracts({ highlights, intent, objective?, topic? })`; loading / error states (no silent demo). |
| `ClusterBoard` | List of cluster cards (rounded-2xl border panels). Each: rename input, unit chips/cards, drag or “Move to…” select, Merge / Split actions. |
| `ContentUnitCard` | Existing unit editor + kind select + optional structured table editor when `structured` present. |
| `CoverageGapBanner` | Amber/red alert strip listing `knowledgeBase.gaps` once Intent fields exist (or deferred until Define filled). |
| `StructuredFactHint` | When media includes images tagged as tables / score guides: CTA “Extract table facts…” → typed API (error if unavailable). |

State in `ObjectCreator` (tutorial):

- `knowledgeBase: ClusteredKnowledgeBase | null`
- `shapeIntent: string`
- Persist both on `pipelineDraft`.

Async boundaries (typed, honest errors):

```ts
// src/lib/api.ts (tutorial-only)
classifyAndClusterExtracts(payload): Promise<ClusteredKnowledgeBase>
shapeTutorialExtracts(payload): Promise<ClusteredKnowledgeBase>
extractStructuredFactsFromMedia(payload): Promise<ContentUnit[]>
```

Server routes (to be added under `/api/tutorials/...` only) behind those functions — **no mock fallback**.

### 5.3 Generation UX (minimal UI change)

- Gate Generate (tutorial): require `knowledgeBase` with ≥1 cluster and a selected `templateId`; else clear inline error.
- `GeneratingView` can show “Filling section i from cluster ‘Bidding’…” if server emits progress (optional).

### 5.4 Headings in editor + learner (Tutorial correctness)

- Generation must emit an explicit **section-heading** part (or embed `## Title` + `### Subhead` in body **and** keep structured `heading`/`subheads` on the block).
- Save path for tutorial rich-text must preserve heading fields (extend content type or prefix body with markdown headings derived from section plan).
- Renumber questions sequentially when assembling parts (`Question 1…N`).

---

## 6. Exact generation request: template SHAPE × cluster MATERIAL

### 6.1 Client assembly before `generateTutorial`

```ts
const template = getTemplateById(fv.templateId); // from BUILTIN_TUTORIAL_TEMPLATES (+ future custom)
const kb = knowledgeBase; // ClusteredKnowledgeBase from Extract

// Map clusters → sections (order = cluster order; secs knob may trim/pad with gap warn)
const sectionPlans: TutorialSectionPlan[] = kb.clusters.slice(0, fv.secs).map((cluster, index) => ({
  index,
  title: cluster.name,
  subheads: subheadsForRecipe(template.sectionBlockRecipe), // e.g. Concept / Example / Check
  clusterId: cluster.id,
  recipe: template.sectionBlockRecipe,
  mediaPlacements: assignMediaToSlots(template.mediaSlots, media, index),
}));

const payload: TutorialGenerateRequest = {
  title,
  config: { ...knobs, templateId: template.id, obj: fv.obj, topic: fv.topic, aud, lvl },
  template,
  knowledgeBase: kb,
  sectionPlans,
  prompt: srcMode === 'prompt' ? promptText : undefined,
  media: media.map(...),
};
```

**Hard rules encoded in prompt + server validation:**

1. Emit parts **section by section** following `sectionPlans[i].recipe` order.  
2. For section `i`, **only** use units in `knowledgeBase` with `clusterId === sectionPlans[i].clusterId` (plus global intro/recap from objective).  
3. Definitions → explanation; Examples → worked-example; Facts/Procedures → check stems; Quotes → source-excerpt when recipe asks.  
4. Place `media` refs only into declared `mediaSlots` / `mediaPlacements`.  
5. Assessment placement from template overrides loose `chks` when conflicting (knob may still scale count).  
6. Refuse / warn if a section plan has an empty cluster (gap), rather than inventing from general knowledge.  
7. Label questions `Question ${globalIndex}` sequentially; section rich-text must include visible heading + subheads.

### 6.2 Server `buildGeneratePrompt` (tutorial) — conceptual shape

```
SYSTEM: You fill a FIXED template. Do not invent facts outside the provided cluster units.
USER:
  Template: {id, recipe, connection, assessment}
  For each sectionPlan:
    Heading / subheads
    Recipe steps
    ONLY these units: [typed list for that cluster]
    Media slots: [...]
  Global end rule from template + end knob
Return JSON array of parts in order…
```

### 6.3 Example section ↔ cluster mapping

| Section plan | Cluster | Recipe fill |
| --- | --- | --- |
| 1. “Dealing” | cluster `dealing` (Procedure + Fact units) | heading → explanation from procedures → worked-example from example units → check from facts |
| 2. “Bidding” | cluster `bidding` (Definition + Example) | heading → concept explanation → example → check |
| … | … | … |

---

## 7. Built-in template data sketch (for later implementation)

| id | Connection | Assessment | Knob defaults (illustrative) | Recipe (abbrev.) |
| --- | --- | --- | --- | --- |
| `concept-example-practice` | sequential | after_each_section | secs 3, chks 1, wex true, end Recap | heading → explanation → worked-example → media? → knowledge-check |
| `guided-walkthrough` | prerequisite_chain | checkpoints_after_each | secs 4–5, chks 1, wex false | heading → instruction → source-excerpt? → try-it |
| `worked-example-first` | standalone | after_each_section | dpth In-depth, wex true | heading → worked-example → principle → knowledge-check |
| `explain-misconception-correct` | sequential | after_each_section (probe misconception) | chks 1 | heading → explanation → misconception → correction → knowledge-check |
| `scenario-driven` | sequential | end_only | chks 0 per section, end End quiz | heading → scenario-advance (+ shared scenario thread in prompt) |
| `reference-cheatsheet` | standalone | end_only or none | wex false, chks 0, end None/Recap | heading → explanation (dense facts) |

Media slots example (Concept, Example, Practice): `{ id: 'worked-diagram', kind: 'image', afterRecipeIndex: 2, hint: 'Diagram for the worked example' }`.

---

## 8. Implementation order (after “go” — not started)

1. Types + `tutorialTemplates.ts` builtins.  
2. `TutorialTemplatePicker` + knob prefills in Define.  
3. Tutorial-branched Extract: classify / dedupe / cluster APIs + `ClusterBoard` UI + shape-with-AI wiring + gap flags.  
4. Rewire `runGenerate` + `POST /api/tutorials/generate` to `TutorialGenerateRequest` (cluster-locked, recipe-ordered).  
5. Persist headings; sequential question labels; media into slots.  
6. Loading / empty / error states; no demo fallbacks.

---

## 9. Explicit asks before implementation

1. **Server file `server/index.mjs`:** Tutorial generate/extract endpoints live here. Confirm this is in scope (Tutorial-only routes / helpers only; no changes to quiz/flashcard/etc. handlers’ behavior).  
2. **LearnerReader heading rendering:** Preserving section titles requires a small learner-side render change for tutorial rich-text/headings. Confirm that is allowed as “shared pipeline piece the Tutorial depends on,” or whether headings must be embedded only as markdown inside existing `RichText` with **no** `LearnerReader.tsx` edits.  
3. **Shared `S3`:** Plan is to branch `typeId === 'tutorial'` so other object types keep today’s Extract UI. Confirm.

---

**STOP.** Awaiting your review and explicit “go” before any implementation.
