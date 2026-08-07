# Tutorial generate-new embed integration — implementation plan (checkpoint)

**Status:** PLAN ONLY — do not implement until explicit “go”.  
**Scope:** Tutorial pipeline only. Reuse per-type generators by **calling** them; do not rewrite shared generators.  
**Authority:** Derived from current code + `docs/tutorial-pipeline-end-to-end.md`.

---

## 1) What exists today (quoted from code)

### 1.1 Section-quiz emission (live — must not regress)

**Manual scaffold** (`ObjectCreator.tsx → scaffoldTutorialFromTemplate`): for composite recipes, generate-new quiz embeds become `type: 'section-quiz'` with empty questions:

```728:746:Components/laic-learning-platform/src/app/components/screens/ObjectCreator.tsx
        if (item.objectType === 'quiz' && item.sourceMode !== 'pick_from_library') {
          // ...
          parts.push({
            id: rid(),
            type: 'section-quiz',
            label: `Section quiz · ${sectionTitle}`,
            sourceMode: item.sourceMode,
            authoringNote: item.authoringNote || "test only this section's concept",
            required: item.required,
            questions,
          });
```

**AI generate prompt** (`server/index.mjs → buildGeneratePrompt` composite path):

- Recipe line for quiz: emit ONE `section-quiz` for THIS section (`formatCompositeRecipe` / `formatRecipeItemForPrompt` quiz branch).
- System rules (`compositeQuizRules`):  
  > When a recipe line is EMBEDDED_QUIZ with sourceMode=generate (or prompt_on_author), emit exactly ONE part of type "section-quiz"…  
  > If sourceMode=pick_from_library: do NOT emit a section-quiz…  
- Client keeps those `section-quiz` parts; `partsToBlocks` maps them to quiz blocks with `embeddedQuiz: true`.

**Plan decision:** leave this path **as-is**. Do **not** replace generate-new quiz embeds with a client call to `generateQuiz` in v1.

### 1.2 Deferred non-quiz stub (~line 356)

`ObjectCreator.tsx → buildTutorialSectionPlans` (legacy cluster path) logs:

```351:360:Components/laic-learning-platform/src/app/components/screens/ObjectCreator.tsx
  if (useComposite) {
    for (const item of template.recipe) {
      if (item.kind === 'embedded' && item.objectType !== 'quiz') {
        console.warn(
          `[tutorial] embedded ${item.objectType} slot is deferred (not yet wired for generation); quiz embeds are live.`,
        );
      }
    }
  }
```

Server + client prompt language for non-quiz generate embeds (`formatRecipeItemForPrompt` / `buildGeneratePrompt` formatCompositeRecipe):

> emit ONE rich-text headed with generateMeta.title (or object type) summarizing objective/instructions; do NOT invent a full nested object

And `compositeQuizRules` last line:

> Other embedded object types with sourceMode=generate: emit a short rich-text placeholder headed with generateMeta.title; do not invent a full nested object.

That rich-text is the stub we replace with real nested generation + splice.

### 1.3 How library inject positions parts today

`libraryEmbed.ts → injectPinnedEmbedsIntoParts(parts, recipe, libraryObjects)`:

1. Filters `recipe` to slots with `sourceMode === 'pick_from_library'` + `versionPin.objectId`.
2. If any quiz/reused pin: **drops all** `section-quiz` parts from the stream (so library quiz wins).
3. Finds section starts = rich-text parts whose `heading` is set and is not Introduction/Recap/Summary.
4. For **each** section, splices **the same full slot list** at the **end** of that section (before closing Recap/Summary), via `makeLibraryEmbedPart` → `type: 'library-embed'` + `snapshotBlocks`.
5. If no section starts: inserts all embeds once before closing.

**Call site today** (`ObjectCreator.tsx → runGenerate`):

```4920:4925:Components/laic-learning-platform/src/app/components/screens/ObjectCreator.tsx
      const withLibrary = injectPinnedEmbedsIntoParts(
        withHints,
        templateUsesCompositeRecipe(template)
          ? template.recipe.map((r) => (r.kind === 'embedded' ? r : null)).filter(Boolean) as any[]
          : [],
        createdObjects || [],
      );
```

**Gaps vs desired:**

| Gap | Today |
|-----|--------|
| Recipe source | `template.recipe` only — ignores archetype / per-section `sectionRecipe` |
| Position | End of section, not recipe index |
| Same embeds every section | Yes — one global recipe list repeated |
| Generated embeds | Not handled — only pick_from_library |

---

## 2) Per-type generators — input/output and mapping (without modifying them)

Shared client payload pattern (all below except where noted):

```ts
{
  title: string;
  config: <type-specific>;
  extracts: TutorialExtract[];      // { kind?, text, from?, authorNote? }
  highlights?: MarkupHighlightDirective[];
  prompt?: string;
  knowledgeBase?: ClusteredKnowledgeBase | null;
  shapeIntent?: string;
  authorInstructions?: string[];
}
```

**Grounding strategy for embeds (client mapping only):**  
For each embed, build `extracts` (and concept `markupUnits`) **only from that section’s units** (`sectionPlan.clusterId → unitIds → ContentUnit`). Optionally pass a **sliced** `knowledgeBase` `{ units: sectionUnits, clusters: [thatCluster], … }` so if the server also reads KB, it still stays section-scoped. Do **not** change server generators.

Map `authoringNote` + `embedPlans[key].instructions` + `generateMeta.instructions` into the optional `prompt` string (author note block) — all generators already accept `prompt?: string`.

---

### 2.1 Assignment — `generateStructuredObject('assignment', …)` → `/api/assignments/generate`

| | |
|--|--|
| **Entry** | `api.ts → generateStructuredObject` / `ObjectCreator → runGenerateStructured` + `structuredConfig` (assignment branch) |
| **Config keys** | `obj`, `aud`, `lvl`, `tt`, `del`, `el`, `cite`, `req`, `rubric` |
| **Output** | SSE `result` → assignment content object (`objective`, `prompt`, `requirements`, `rubric`, …) → saved as block `type: 'assignment'` |
| **Server** | `buildAssignmentPrompt` — grounds on `extracts` |

**Mapping (no generator change):**

| Source | → config / payload |
|--------|---------------------|
| `override.objective` \|\| `generateMeta.objective` \|\| section `intent` \|\| section title | `config.obj` |
| `generateMeta.tt/del/el/cite` | `config.tt/del/el/cite` (defaults: Short essay / Written text / ~300 words / true) |
| `generateMeta` has no `req`/`rubric` | defaults `req: 3`, `rubric: 3` |
| section units | `extracts` (+ optional sliced KB) |
| notes | `prompt` |
| title | `generateMeta.title` \|\| `${sectionTitle} · Assignment` |

**Can accept as-is:** YES.

---

### 2.2 Reflection — `generateStructuredObject('reflection', …)` → `/api/reflections/generate`

| | |
|--|--|
| **Config keys** | `goal`, `aud`, `voi`, `style`, `who`, `np`, `starters` |
| **Output** | SSE `result` → reflection content → block `type: 'reflection'` |
| **Server** | `buildReflectionPrompt` |

**Mapping:** `EmbeddedGenerateMeta` has **no** reflection-specific fields today (only `instructions` / `objective` / `title`). Use:

| Field | Mapping |
|-------|---------|
| `goal` | `override.objective` if it matches a known goal option, else default `'Apply to real life'`; put freeform objective into `prompt` |
| `voi` | `generateMeta.voi` \|\| `'Encouraging'` |
| `style` / `who` / `np` / `starters` | defaults matching `structuredConfig` reflection branch |
| units / notes | extracts + `prompt` |

**Can accept as-is:** YES (defaults + prompt for freeform intent).

---

### 2.3 Flashcard set — `generateFlashcards` → `/api/flashcards/generate`

| | |
|--|--|
| **Config** | `FlashcardConfig`: `mem`, `aud`, `lvl`, `cc`, `pull`, `dir`, `hooks`, `nc` |
| **Extra** | `images?: { id, caption?, url }[]` |
| **Output** | SSE `card` stream → cards → block `type: 'flashcard-set'` |

**Mapping:**

| Source | → |
|--------|---|
| `override.objective` \|\| `generateMeta.objective` \|\| section intent | `config.mem` |
| `generateMeta.cc/pull/dir/hooks` | same (defaults: Key terms→definitions, Glossary…, Front→back, false) |
| `generateMeta.cardCount` | `config.nc` (number; default 12) |
| section units | extracts |
| tutorial `media` images | only if `cc` includes Image→label; else omit |

**Can accept as-is:** YES.  
**Caveat (client-only):** if `cc` includes Image→label and tutorial has no image URLs, strip that style from `cc` before call (same guard as `runGenerateFlashcards`) — do not change the generator.

---

### 2.4 Concept card — `generateConceptCard` → `/api/concept-cards/generate`

| | |
|--|--|
| **Config** | `ConceptCardConfig`: `concept`, `aud`, `lvl`, `voi`, `len`, `categories?` |
| **Extra** | `markupUnits?`, `sourceUnits?` (in addition to extracts) |
| **Output** | SSE `card` → `GeneratedConceptCard` → block `type: 'concept-card'` |

**Mapping:**

| Source | → |
|--------|---|
| `generateMeta.conceptFocus` \|\| `override.objective` \|\| section intent \|\| section title | `config.concept` (**required** by standalone flow) |
| `generateMeta.voi/len` | config |
| section units | `extracts` + `markupUnits` (map unit → `{ text, from, kind, authorNote }`) |
| categories | default `resolveConceptCategories(undefined)` so sheet works |

**Can accept as-is:** YES, provided we always supply a non-empty `concept` and non-empty markup/extracts from section units. Empty section → fail that embed → rich-text fallback (touchpoint 4c).

---

### 2.5 Quiz — `generateQuiz` → `/api/quizzes/generate`

| | |
|--|--|
| **Config** | `QuizConfig` (+ passOn used client-side) |
| **Output** | SSE `question` stream |

**For tutorial generate-new quiz embeds:** **do not call this in v1.** Keep tutorial model emission of `section-quiz` (already grounded on section units + generateMeta).  

`generateQuiz` remains available for standalone quiz creation only.

**Can accept as-is for embed reuse:** N/A for v1 (by design). If we later dual-path, mapping would be straightforward from `generateMeta.questionCount/qtypes/cog/…` → `config.nq/qtypes/…` + section extracts — **no generator change required**.

---

### 2.6 Scenario — **FLAG: no reusable generator**

| Finding | Evidence |
|---------|----------|
| No `generateScenario` / `/api/scenarios/generate` | `api.ts` has no scenario generate; `StructuredObjectKind` = summary \| reflection \| assignment \| drill only |
| Standalone scenario “Generate” | `ObjectCreator → advance`: after flashcard/quiz/concept/structured/video branches, **falls through to `setShowEditor(true)`** — blank editor, no AI |
| Template allows embed type `scenario` | `EMBEDDED_OBJECT_OPTIONS` |

**Cannot map (section units + generateMeta) onto an existing scenario generator — none exists.**

**STOP for decision before implementation:**

1. **Defer scenario embeds** — keep reserved-slot → rich-text placeholder + Plan/Define visibility; document as unsupported for real generation; or  
2. **Authorize building a new scenario generator** (out of “call existing only”); or  
3. **Map scenario → assignment** (hack — not recommended).

**Recommendation:** option 1 for v1 unless you authorize new shared generator work.

---

### 2.7 Summary table

| Embed type | Existing generator | Accepts section units + meta via mapping? | v1 action |
|------------|-------------------|-------------------------------------------|-----------|
| quiz | Tutorial `section-quiz` (not `generateQuiz`) | N/A — keep as-is | Keep |
| assignment | `generateStructuredObject('assignment')` | YES | Call + splice |
| reflection | `generateStructuredObject('reflection')` | YES (defaults for missing meta fields) | Call + splice |
| flashcard-set | `generateFlashcards` | YES | Call + splice |
| concept-card | `generateConceptCard` | YES | Call + splice |
| scenario | **None** | **NO** | **Ask before touching** |
| reused-from-library | N/A (pin only) | N/A | Library path |

---

## 3) Proposed types

### 3.1 `EmbedPlanOverride` + `embedPlans` (`types.ts`)

```ts
/** Per-instance override for a template embed slot in THIS tutorial. */
export interface EmbedPlanOverride {
  /** Author tweak of what this embed should achieve (seeds generator intent). */
  objective?: string;
  /** Extra instructions beyond template authoringNote / generateMeta.instructions. */
  instructions?: string;
  /**
   * For sourceMode=prompt_on_author: author chooses at Plan time.
   * 'generate' | 'pick_from_library'. Undefined = still unresolved.
   */
  resolvedMode?: 'generate' | 'pick_from_library';
  /** When resolvedMode is pick_from_library (or override pin). */
  versionPin?: VersionPin;
  libraryTitle?: string;
}

export interface TutorialDefinition {
  objective: string;
  sections: DefinedSection[];
  /** Keyed by `${sectionId}:${recipeItemId}`. Optional — old drafts omit. */
  embedPlans?: Record<string, EmbedPlanOverride>;
}
```

Backward compat: missing `embedPlans` ≡ `{}`.

### 3.2 Helper (`tutorialDefinition.ts`)

```ts
export type ListedEmbed = {
  key: string;                    // `${sectionId}:${recipeItemId}`
  sectionId: string;
  sectionTitle: string;
  sectionIntent: string;
  recipeIndex: number;
  item: EmbeddedObjectItem;       // resolved item (may clone with effective pin/mode)
  effectiveMode: EmbeddedObjectSourceMode; // after prompt_on_author resolution
  effectiveMeta: EmbeddedGenerateMeta | undefined;
  authoringNote?: string;
  override?: EmbedPlanOverride;
};

export function listEmbedsForDefinition(
  def: TutorialDefinition,
  template: TutorialTemplate,
  opts?: { unitsBySectionId?: Record<string, Pick<ContentUnit, 'kind' | 'text'>[]> },
): ListedEmbed[];

/** Subset: effectiveMode === 'generate' (and unresolved prompt_on_author if desired). */
export function listGenerateEmbedsForDefinition(...): ListedEmbed[];
```

Implementation sketch:

1. For each titled `DefinedSection`, `recipe = filterRecipeByCondition(resolveSectionRecipe(template, sec.archetypeId), unitsForSection || [])`.
2. For each `kind === 'embedded'` item, compute `effectiveMode` from `item.sourceMode` and `def.embedPlans[key]?.resolvedMode`.
3. Return with recipe index + merged note/meta/override.

Also export `embedPlanKey(sectionId, recipeItemId)`.

---

## 4) Plan UI (`TutorialPlanPanel`)

Under each section (after title/intent/archetype/depth):

1. Resolve embeds via `listEmbedsForDefinition(def, template)` (units optional at Plan time — conditions that need kinds may show “may be skipped if source lacks …” when units unknown).
2. Per embed row:
   - **pick_from_library** (or resolved pick): read-only chip  
     `{Type}: {libraryTitle} · pinned {versionId} — from library, nothing to author`
   - **generate** (or resolved generate): editable sub-row  
     `⚙ {Type} (generate) — authored from this section's units`  
     - show `authoringNote`  
     - optional objective input → `setDef` → `embedPlans[key].objective` (seed from `generateMeta.objective`)
   - **prompt_on_author** unresolved:  
     `Choose how to source this {Type}: [Generate new] [Pick from library]`  
     - Generate → `resolvedMode: 'generate'`  
     - Pick → open existing `LibraryPickerModal` pattern (reuse Template Editor / ObjectCreator picker) → set `resolvedMode`, `versionPin`, `libraryTitle`
3. Top summary:  
   `This tutorial will generate N objects (Assignment, Concept card, …); M come from your library.`  
   Count generate-effective vs pick-effective (quiz generate counts toward N for honesty, even though filled by tutorial SSE).

No localStorage.

---

## 5) Define UI (`S4` “What will be generated”)

Split the green summary into three read-only blocks:

**(a) Tutorial prose sections** — existing planned section list / depth / sources / units copy.  
**(b) Embedded objects to generate** — from `listGenerateEmbedsForDefinition` (effective generate, **including quiz** for visibility; non-quiz are client-filled). Show type · section title · objective (override \|\| generateMeta \|\| intent).  
**(c) From your library (embedded as-is)** — pick chips with type · libraryTitle · versionPin.

Unresolved `prompt_on_author` → warning chip: “Resolve in Plan before generating” (soft; generate can still treat as generate or placeholder — prefer soft-block Next only if `required` and unresolved).

---

## 6) `runGenerate` orchestration order

```
1. Build sectionPlans = buildTutorialSectionPlansFromDefinition(...)  [unchanged spine]
2. Stream generateTutorial(payload)  → collected parts
   - Server reserves slots for non-quiz generate embeds (see §7)
   - Server still emits section-quiz for generate quizzes
3. orderTutorialParts → hints → attachSources  [unchanged]
4. Build per-section embed worklist from sectionPlans[].sectionRecipe
   + embedPlans resolution (prompt_on_author → generate | pick)
5. For each pick_from_library slot (per section, per recipe):
   - prepare library-embed parts (do not yet require end-of-section inject)
6. For each generate NON-QUIZ slot (assignment | reflection | flashcard-set | concept-card):
   - setGenProgress(`Generating embedded {Type} for “{section}”…`)
   - map units + meta + override → call existing generator
   - on success: wrap as embedded part (snapshot blocks)
   - on failure: rich-text placeholder + accumulate non-fatal genWarning
7. Scenario (if present): placeholder only until decision (§2.6)
8. injectEmbedsIntoParts(parts, perSectionSlots)  // generalized positioner
   - replace reserved placeholders by slot key when present
   - else insert at recipe-relative position within section
   - quiz generate: leave section-quiz alone
   - quiz pick: strip section-quiz for that section if needed (preserve today’s intent carefully)
9. renumber → saveGeneratedDraft → open editor
```

**Failure fallback:** per-embed try/catch; tutorial prose success is enough to open editor; surface `genError` or a softer banner listing failed embed types.

**Abort:** shared `genAbort` cancels in-flight embed streams where possible.

### 6.1 Generalized positioner (`libraryEmbed.ts`)

Rename/generalize conceptually to e.g. `injectEmbedsIntoParts(parts, sectionSlots[], libraryObjects)` where each slot is:

```ts
{
  sectionIndex: number;       // matches TutorialSectionPlan.index
  sectionTitle: string;
  recipeIndex: number;
  recipeItemId: string;
  objectType: string;
  mode: 'pick_from_library' | 'generate';
  versionPin?: VersionPin;
  libraryTitle?: string;
  authoringNote?: string;
  required?: boolean;
  /** Filled after client generation */
  generatedBlocks?: Block[];  // or Generated* converted to blocks
  placeholderPart?: any;      // failure fallback
}
```

**Positioning rules (in order):**

1. If part with `type === 'embed-slot'` (or rich-text marker — see §7) matching `sectionId:recipeItemId` exists → replace in place.  
2. Else: locate section by heading === `sectionTitle` (same heuristics as today); insert after the Nth content part corresponding to recipe order among non-slot teaching parts — best-effort.  
3. Else: append before section close (today’s end-of-section behavior).

**Critical fix:** build `sectionSlots` from **each** `sectionPlan.sectionRecipe` (post-condition filter), **not** from `template.recipe` alone.

**Part shape for generated embeds:** prefer reusing `library-embed` with:

- `snapshotBlocks` = blocks from generator output  
- `objectType` = embed type  
- `versionPin` = `{ objectId: 'generated', versionId: 'inline' }` or empty + flag `generated: true`  
- OR introduce `type: 'embedded-object'` mirrored in `partsToBlocks` / editor (small tutorial-only addition).  

Recommendation: **reuse `library-embed` + `generated: true`** to minimize editor/learner preview changes (`expandLibraryEmbedToBlocks` already expands snapshots). If you prefer a distinct type name in the editor UI, label it “EMBEDDED OBJECT” (already shown for library-embed).

---

## 7) Server slot reservation (`buildGeneratePrompt`)

**Change only the non-quiz generate (and unresolved prompt_on_author-as-generate) recipe lines** — keep HARD CONSTRAINTS, aiExtra off, length rules, section-quiz rules.

Replace current “emit ONE rich-text summarizing…” with:

> emit ONE part  
> `{"type":"embed-slot","id":"<stable>","slotKey":"<sectionPlan.index>:<recipeItemId>","objectType":"<type>","label":"<Type> (generated separately)","heading":null,"body":""}`  
> — do NOT write the nested object; the platform fills this slot after generation.

If extending the JSON schema with `embed-slot` is risky for the model, fallback marker:

> emit ONE rich-text with heading exactly `⟦EMBED_SLOT:${slotKey}⟧` and body `{Type} (generated separately)`.

Client recognizes either form.

Also update `formatRecipeItemForPrompt` in `tutorialTemplates.ts` (client-side formatter used in some paths) to match, and the duplicate formatter inside `buildGeneratePrompt`’s `formatCompositeRecipe`.

**Do not** change quiz emission lines.

Remove/replace the deferred `console.warn` in `buildTutorialSectionPlans` once client orchestration lands (or leave as debug for scenario only).

---

## 8) What stays untouched

- Non-tutorial object creation flows (`runGenerateFlashcards` / Quiz / Concept / Structured / Video as standalone entry points) — **called**, not edited (except tutorial `runGenerate` orchestration).
- Course Wizard, drills, admin/reviewer/coach/student, sidebar, top bar, login.
- Visual design system / shadcn patterns beyond Plan/Define row additions.
- Section-quiz AI emission and `partsToBlocks` quiz mapping (unless needed for `embed-slot` / generated library-embed).
- Extract / Mark up / Sources behavior (no source-mode auto-skip in this plan).
- Shared generator prompt builders (`buildAssignmentPrompt`, etc.) — **no edits** unless you later authorize scenario.
- `localStorage` / `sessionStorage` — not used.

**Files expected to change after “go”:**

| File | Change |
|------|--------|
| `src/lib/types.ts` | `EmbedPlanOverride`, `TutorialDefinition.embedPlans` |
| `src/lib/tutorialDefinition.ts` | `listEmbedsForDefinition` / `listGenerateEmbedsForDefinition` |
| `ObjectCreator.tsx` | Plan UI, S4 summary, `runGenerate` orchestration, remove deferred stub |
| `src/lib/libraryEmbed.ts` | Generalized per-section inject + generated snapshots |
| `src/lib/tutorialTemplates.ts` | Prompt formatter slot language |
| `server/index.mjs` | `buildGeneratePrompt` / formatCompositeRecipe slot reservation |
| Possibly `partsToBlocks` / editor | only if new part type needed |

---

## 9) Open decisions (need your answer before / with “go”)

1. **Scenario embeds:** defer with placeholder (recommended) vs authorize new generator?  
2. **Part type name:** reuse `library-embed` + `generated: true` vs new `embedded-object`?  
3. **Unresolved `prompt_on_author` at Generate:** soft warning + treat as generate, or hard-block required slots?  
4. **Quiz visibility in “Embedded objects to generate”:** list them (filled by tutorial SSE) or only non-quiz client-filled types?

---

## 10) Success criteria (for later implementation)

- Mixed template (library Quiz + library Concept card + generate Assignment): Plan shows library chips + Assignment authoring; Define lists all three buckets; Generate produces real Assignment content from **section** units, pins library objects per **section recipe**, keeps section-quiz behavior for generate quizzes.  
- Archetype Capstone with generate Assignment places embed under that section’s recipe, not only default `template.recipe`.  
- Old drafts without `embedPlans` open and generate.  
- Failed embed generator → placeholder + visible non-fatal error; tutorial still opens.  
- No changes to standalone assignment/quiz/flashcard/concept/reflection create flows beyond being invoked as libraries.

---

**STOP.** Awaiting your “go” (and answers to §9 if you want them locked before coding).
