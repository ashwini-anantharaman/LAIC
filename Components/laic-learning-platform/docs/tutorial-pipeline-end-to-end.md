# Tutorial object pipeline — end-to-end (code-derived)

**Scope:** Tutorial object type in Content Studio / cd-creator (`Components/laic-learning-platform`).  
**Authority:** Derived from the codebase as of this document. Claims cite `file → symbol`. Where behavior is missing or ambiguous, it is marked **unverified** or listed under §9.  
**Not in scope:** Deep documentation of quiz / flashcard / concept-card pipelines (only shared surfaces).

**Related plan doc:** `docs/tutorial-define-first-plan.md` describes the *intended* migration. Several sections there still describe the **pre–define-first** world (source-first step order, free-text-only scan, `aiExtra` in Define). Those disagreements are recorded in §9.

---

## 1. Overview & mental model

### What it is

The tutorial pipeline is the authoring wizard inside `ObjectCreator` when `typeId === 'tutorial'`. It turns human-authored structure (Plan + Template Library recipe) plus grounded source units into a draft of typed tutorial parts via `POST /api/tutorials/generate` (`api.ts → generateTutorial`, `server/index.mjs → buildGeneratePrompt`).

### Actual step order (tutorial)

From `ObjectCreator.tsx → STEP_META_TUTORIAL` and step index helpers (`planStep` / `sourcesStep` / `markupStep` / `extractStep` / `defineStep`):

| Step # | Label | Subcopy in rail | Notes |
|--------|--------|-----------------|--------|
| 1 | **Plan** | Objective and section outline | Tutorial-only; other object types have no Plan |
| 2 | **Sources** | Pick what this object draws on | Shared `TutorialSource` path |
| 3 | **Mark up** | Comment on what matters | Rail marks `optionalLabel: true` / `skip: true` |
| 4 | **Extract** | Sort units into your sections | Same optional rail flags |
| 5 | **Define** | Confirm and generate | Slim confirm for tutorials; Generate is the Next action |

Generate is **not** a separate rail step. On Define, `advance` (`ObjectCreator.tsx → advance`) calls `runGenerate()` (or `openManualTutorialEditor()` when `srcMode === 'manual'`).

Non-tutorial pipeline types still use four-step `STEP_META`: Sources → Mark up → Extract → Define (`ObjectCreator.tsx → STEP_META`).

### Define-first philosophy (as coded)

1. **Human owns the outline.** Plan stores `TutorialDefinition` (`objective` + ordered `DefinedSection[]`). Scan, Extract clusters, and section plans are keyed by those section ids — the model must not invent or reorder sections (`server/index.mjs → buildGeneratePrompt` HARD CONSTRAINTS).
2. **Template owns per-section block shape.** `TutorialTemplate.recipe` / archetypes define atomic blocks and embedded objects; Plan titles are not recipe items (`types.ts → TutorialTemplate`, `tutorialDefinition.ts` comment: section count seeded from `knobDefaults.secs`, not recipe length).
3. **AI is scoped.** Markup scan is user-triggered only (comment in `ObjectCreator.tsx` above `handleScanFlags`). Extract clustering with a Plan uses fixed buckets (`buildClusteredKnowledgeBaseFromDefinition`). Generation forces `aiExtra: false` client and server. Length has no word target — units + depth.
4. **Empty sections stay empty of invented facts.** Missing units → short “missing markup” rich-text (`buildGeneratePrompt` lengthRule / per-section empty unit line).

### Human vs AI

| Concern | Who decides |
|---------|-------------|
| Learning objective, section titles/order/intents, archetype & per-section depth | Human (`TutorialPlanPanel`) |
| Per-section teaching/check recipe, library pins, locks | Template author (`TutorialTemplateEditor`) |
| Which passages matter (tags/notes/section assignment) | Human (+ optional AI scan proposals) |
| Cluster names when Plan is ready | Human Plan titles (not emergent AI names) |
| Generated prose / questions | AI, constrained to assigned units + recipe |
| Pick-from-library embeds | Platform inject after generate (`libraryEmbed.ts → injectPinnedEmbedsIntoParts`) |

### Data spine (`sectionId`)

```
TutorialDefinition.sections[].id  (Plan)
        │
        ├─► Markup highlights[].sectionId   (manual Apply / scan Accept via MarkupFlag.sectionId)
        │         │
        │         ▼
        ├─► ContentUnit.sectionId           (Extract / server cluster build)
        │         │
        │         ▼
        ├─► ConceptCluster.id / .sectionId  (= DefinedSection.id; plus Unassigned)
        │         │
        │         ▼
        └─► TutorialSectionPlan.clusterId + title/intent/archetypeId/depth/sectionRecipe
                  │
                  ▼
            Generated parts (ordered; library embeds spliced in)
```

Constants: `UNASSIGNED_SECTION_ID = '__unassigned__'` (`types.ts`, mirrored in `server/index.mjs`).

---

## 2. Data model

### 2.1 `TutorialDefinition` / `DefinedSection` (`types.ts`)

| Type | Fields | Meaning / control |
|------|--------|-------------------|
| `DefinedSection` | `id`, `title`, `intent`, `archetypeId?`, `depth?` | One human section. `archetypeId` selects a `SectionArchetype.recipe` via `resolveSectionRecipe`; blank → `template.recipe`. `depth` overrides global `dpth` in section plans / prompt. |
| `TutorialDefinition` | `objective`, `sections: DefinedSection[]` | Plan spine. **No** `embedPlans` or per-embed authoring state in this type. |

Helpers (`tutorialDefinition.ts`):

- `newSectionId()` — `sec-{base36}-{rand}`
- `seedSectionsFromTemplate(template)` — N placeholders from `knobDefaults.secs` (clamped 1–20)
- `emptyTutorialDefinition(template)` — empty objective + seeded sections
- `planIsReady(def)` — non-empty trimmed `objective` **and** ≥1 titled section
- `deriveTutorialDefinition(...)` — backward-compat for old drafts without `tutorialDefinition` (from clusters or seed)
- `clustersFromDefinition(def, units)` / `unassignedCluster` / `countEmptySections`

### 2.2 Template + recipe (`types.ts`, `tutorialTemplates.ts`)

| Type | Fields | Meaning |
|------|--------|---------|
| `SectionConnectionRule` | `'sequential' \| 'standalone' \| 'prerequisite_chain'` | Template “Section connection”; on save mapped to `knobDefaults.prog` (`TutorialTemplateEditor → handleSave`) |
| `AssessmentPlacement` | `'after_each_section' \| 'end_only' \| 'none' \| 'checkpoints_after_each'` | Where checks go; drives prompt + `orderTutorialParts` |
| `AtomicBlockType` | heading, explanation, worked-example, source-excerpt, instruction, try-it, principle, misconception, correction, scenario-advance, media | Inline teaching blocks |
| `EmbeddableObjectType` | quiz, flashcard-set, concept-card, scenario, assignment, reflection, reused-from-library | Nested object slots |
| `EmbeddedObjectSourceMode` | `'generate' \| 'pick_from_library' \| 'prompt_on_author'` | How the embed is sourced (UI labels: Generate new / Pick from library / Prompt when authoring — `SOURCE_MODE_OPTIONS`) |
| `BlockCondition` | `always` / `if_source_kinds` / `if_source_hint` | Whether a recipe item is kept for a section (`filterRecipeByCondition`) |
| `AtomicBlockItem` | `kind:'atomic'`, `id`, `blockType`, `required?`, `preferKinds?`, `media?`, `authoringNote?`, `condition?` | One teaching block |
| `EmbeddedGenerateMeta` | title, objective, quiz/flashcard/concept/assignment knobs, `instructions?` | Steers generate / placeholder embeds |
| `EmbeddedObjectItem` | `kind:'embedded'`, `id`, `objectType`, `sourceMode`, `required`, `authoringNote?`, `versionPin?`, `libraryTitle?`, `generateMeta?`, `condition?` | One embed slot |
| `RecipeItem` / `SectionRecipe` | union / array | Ordered per-section shape |
| `SectionArchetype` | `id`, `name`, `description?`, `recipe` | Named section type for Plan |
| `TutorialKnobLocks` | `secs?`, `prog?`, `dpth?`, `end?`, `chks?`, `scoring?` | Opt-in locks; `scoring` covers pass/hints |
| `TutorialKnobDefaults` | secs, prog, dpth, end, chks, excpts, wex, passOn, pass, hintsOn, hintN, aiExtra?, words? (retired) | Defaults applied into `fv` / generate config |
| `TutorialTemplate` | id, name, description, builtin, recipe, archetypes?, sectionBlockRecipe, usesCompositeRecipe?, structureLocked?, knobLocks?, sectionConnection, assessmentPlacement, mediaSlots, knobDefaults | Full template record |
| `VersionPin` | `objectId`, `versionId` | Live library pin |
| `MediaSlot` | id, kind, required?, afterRecipeIndex, hint? | Derived media placements |

Legacy: `SectionRecipeBlockType` / `SectionBlockRecipe` — flat recipe for non-composite path (`@deprecated` in types).

### 2.3 Markup / extract / plans

| Type | File | Role |
|------|------|------|
| Highlight (runtime object) | `MarkupWorkspace` `applyAction` | `{ idx, tag, text, page, comment, sourceId?, sourceLabel?, sectionId? }` — tags Use/Support/Ignore/Note |
| `MarkupFlag` | `types.ts` | Scan proposal: kind, groupLabel, title, rationale, startIdx/endIdx, page, excerpt, suggestedTag, status, adjustedText?, **sectionId?** |
| `ContentUnit` | `types.ts` | Grounded unit: id, kind (`ContentUnitKind`), text, from, sectionId?, authorNote?, … |
| `ConceptCluster` | `types.ts` | `{ id, name, unitIds, sectionId? }` — define-first: id = section id or Unassigned |
| `ClusteredKnowledgeBase` | `types.ts` | units + clusters + counts + optional gaps/shapeIntent |
| `TutorialSectionPlan` | `types.ts` | index, title, intent?, clusterId, archetypeId?, depth?, sectionRecipe?, recipe (flat), mediaPlacements |
| `CreatorPipelineDraft` | `types.ts` | Persisted wizard snapshot including `tutorialDefinition`, highlights, knowledgeBase, fv, step/reached, … |
| `ContentUnitKind` | `types.ts` | Definition, Key point, Example, Quote, Fact, Procedure |

### 2.4 How pieces reference each other

- Plan `DefinedSection.id` → highlight `sectionId` → unit `sectionId` → cluster `id`/`sectionId` → `TutorialSectionPlan.clusterId`.
- Plan `archetypeId` → `resolveSectionRecipe(template, archetypeId)` → `sectionRecipe` on the plan (after `filterRecipeByCondition`).
- Template `recipe` embedded `pick_from_library` + `versionPin` → post-generate `injectPinnedEmbedsIntoParts` (currently from **template.recipe only**, not per-section filtered recipe — see §5 / §9).
- `UNASSIGNED_SECTION_ID` holds units without a valid Plan section id; never dropped (`tutorialDefinition.ts`, server cluster builder).

---

## 3. The Template Editor — every control

Component: `TutorialTemplateEditor.tsx` (`TutorialTemplateEditor`). Persistence: `tutorialTemplates.ts → saveCustomTutorialTemplate`. Options constants: `ATOMIC_BLOCK_OPTIONS`, `EMBEDDED_OBJECT_OPTIONS`, `SOURCE_MODE_OPTIONS`, `CONNECTION_OPTIONS`, `ASSESSMENT_OPTIONS`, `KNOB_LOCK_OPTIONS`.

### 3.1 Identity

| Control | Effect |
|---------|--------|
| **Name** | Stored as `TutorialTemplate.name`; shown in Plan/Define template chips |
| **Description** | `TutorialTemplate.description` |
| **Close / Cancel** | `onCancel` — discard editor without save |
| **Save** | `handleSave` → `validate()` then `saveCustomTutorialTemplate`; sets `structureLocked` if any lock true; derives `sectionBlockRecipe`, `mediaSlots`, `knobDefaults` |

### 3.2 Section connection

Pills from `CONNECTION_OPTIONS` → `sectionConnection`. On save, maps to `knobDefaults.prog`:

- `sequential` → `'Linear build-up'`
- `standalone` → `'Themed clusters'`
- `prerequisite_chain` → `'Prerequisite chain'`

Prompt echoes `template.sectionConnection` (`buildGeneratePrompt` user block).

### 3.3 Assessment placement

Pills from `ASSESSMENT_OPTIONS` → `assessmentPlacement`. Affects:

- Validation (`listTemplateValidationWarnings`) — warns if after-each without Quiz/Try-it, or None/End-only with checks present
- Generation placement rules and client `orderTutorialParts(..., assessmentPlacement)`

### 3.4 Structure knobs (editor top)

| Control | State | Saved to |
|---------|--------|----------|
| Sections | `secs` (2–20) | `knobDefaults.secs` — seeds Plan section count via `seedSectionsFromTemplate` |
| Checks / section | `chks` (0–3) | `knobDefaults.chks` — generate config / quiz question count fallback |
| Depth | Overview / Standard / In-depth | `knobDefaults.dpth` |
| End with | Recap only / End quiz / End assignment / None | `knobDefaults.end` |

### 3.5 Granular locks (“Locks for course developers”)

`KNOB_LOCK_OPTIONS` keys: `secs`, `dpth`, `prog`, `end`, `chks`, `scoring`.

- Freeform builtin (`FREEFORM_TUTORIAL_TEMPLATE_ID`): locks disabled / always unlocked (`isKnobLocked` / editor).
- Locked knob → `applyKnobLocks` overwrites author `fv` with `knobDefaults` at generate; Define UI for tutorials no longer edits most knobs inline (slim summary) — locks still matter for regenerate / any remaining field paths and `isFieldKnobLocked`.
- Legacy templates without `knobLocks`: `isKnobLocked` falls back to `structureLocked !== false` (all-or-nothing).

### 3.6 Section types (archetypes)

- Default recipe tab vs archetype tabs (`editTarget`).
- **Add section type** → `addArchetype` (new id + cloned recipe).
- Remove archetype when editing one.
- Defaults from `makeDefaultArchetypes`: Teaching / Checkpoint / Capstone.
- Plan assigns via `DefinedSection.archetypeId` (`TutorialPlanPanel` “Section type” select).

### 3.7 Per-section recipe items

**Add block** palette → `addAtomic(type)` via `ATOMIC_BLOCK_OPTIONS`.  
**Add embedded object** → `addEmbedded` / `makeEmbeddedItem` via `EMBEDDED_OBJECT_OPTIONS`.

Per **atomic** item: type label, move up/down, delete, required, preferKinds, authoringNote, condition (Always / If source has kinds / If source mentions), media config for media blocks.

Per **embedded** item:

| Control | Effect |
|---------|--------|
| Object type | `objectType`; `reused-from-library` forces pick mode |
| Source mode | `generate` / `pick_from_library` / `prompt_on_author` (`setSourceMode`) |
| Required / Optional | `required` |
| Library object + version | `versionPin` + `libraryTitle`; picker via `needsLibraryPin` |
| Authoring note | `authoringNote` — prompt / inject |
| When-to-include | `condition` — filtered at plan-build with section units |
| generateMeta | Full per-type define-style controls (quiz counts, passOn/passMark, flashcard, concept, assignment fields, instructions) — formatted by `formatGenerateMetaForPrompt` |

### 3.8 Sample section preview

Editor builds a textual preview of the active recipe (`recipeSummary` / sample UI near bottom of editor) so authors see block order before save. Exact preview rendering is UI-only; generation uses the saved recipe via section plans.

### 3.9 Validation

- Hard errors in `validate()`: name required; at least one content-bearing item; required embeds need sourceMode; pick_from_library needs resolvable pin.
- Soft warnings: `listTemplateValidationWarnings` (assessment vs quiz/try-it mismatch) — shown; do not block save by themselves once hard checks pass (`handleSave` uses `warns[0]` as `warning`).

### 3.10 Why each exists (short)

| Control | Why | If toggled wrong |
|---------|-----|------------------|
| Connection / assessment | Pedagogy + prompt placement | Misplaced or duplicate checks |
| secs | Seed Plan outline length | Too few/many placeholder sections |
| Locks | Org templates constrain authors | Authors cannot (or can unexpectedly) change structure |
| Archetypes | Different sections, different shapes | Wrong recipe on a Plan section |
| Source mode | Library reuse vs AI vs defer | Silent missing embeds / AI inventing nested objects |
| Conditions | Skip blocks when source lacks kinds/hints | Missing or extra blocks after filter |
| generateMeta | Steer nested object generation | Weak or wrong quiz/assignment placeholders |

---

## 4. Step-by-step, screen by screen

### 4.1 Plan (`TutorialPlanPanel`, step `planStep === 1`)

**Purpose:** Capture define-first spine before sources.

**Controls:**

| Control | Handler / state |
|---------|-----------------|
| Learning objective textarea | `setDef({ objective })` |
| Add section | `addSection` → new `DefinedSection` |
| Title / intent inputs | `updateSection` |
| Move up/down | `moveSection` |
| Remove | `removeSection` (blocked if only one section) |
| Section type select | `archetypeId` from `template.archetypes` or Default |
| Depth select | `depth` or Template (`knobDefaults.dpth`) |

**Reads:** `tutorialDefinition`, active `TutorialTemplate` (name, archetypes, global depth).  
**Writes:** `tutorialDefinition` only (on leave Plan, `advance` also syncs `fv.obj` / `fv.topic` / `fv.aiExtra: false`).

**Gating:** `canNext` when `planIsReady(tutorialDefinition)`. Footer hint: “add an objective and at least one named section”.

**Automatic:** None. Template pick via `pickTutorialTemplate` reseeds sections only if Plan is not yet ready.

**API:** None.

---

### 4.2 Sources (`TutorialSource` / shared Sources UI, step 2)

**Purpose:** Choose material sources, prompt-only, or write-myself.

**Path modes** (`pathMode`: `material` | `prompt` | `manual`):

- **material** — PDF / paste / web / YouTube (and media); `sourceReady` when any source present
- **prompt** — `promptText` required; Next runs `expandPromptAndEnterMarkup` → `expandTutorialPrompt` then jumps to Mark up
- **manual** — Next jumps straight to Define (`advance` special case), skipping Mark up/Extract

Compat `srcMode` derived from pathMode / first material kind (`ObjectCreator` near `srcMode`).

**Gating:** `canNext` ↔ `sourceReady` for pipeline types.

**API (as used):** ingest YouTube/web (`ingestYoutube`, `ingestWeb`), PDF parse on Mark up entry, `expandTutorialPrompt` for prompt path.

---

### 4.3 Mark up (`MarkupWorkspace` via S2, step 3)

**Purpose:** Tag passages and assign them to Plan sections.

**Props of note:** `definedSections={tutorialDefinition.sections}` (when tutorial), `onScanFlags={handleScanFlags}`.

**Visible behaviors (code):**

| Control | Behavior |
|---------|----------|
| Drag-select / sentence click | Opens tag popup: Use / Support / Ignore / Note + note + **section picker** when Plan sections exist (`applyAction` writes `sectionId: pickSectionId`) |
| **Select all** | `selectAllActive` — mutually exclusive with scan (`bulkMode`); opens action for all sentences on active source |
| **Scan document** | `runScan` — if `definedSections.length`, calls `onScanFlags('')` (no free-text); else requires `scanFocus`. Disabled when `bulkMode === 'selectAll'`. Sets `bulkMode` to `'scan'` |
| Scan focus input | Shown only when **no** Plan sections; required for non–define-first |
| “Scan by N Plan sections” | Label when sections exist |
| Find + **Highlight all** | Find jumps (`jumpToFindMatch`); Highlight all opens action for matches |
| Paginated reader | Page navigation over sentences / HTML sources |
| Scan rail (`CompactScanList`) | Accept / Reject / Adjust / Accept all / Reject all / Clear; Accept uses `highlightsFromFlag` which copies `flag.sectionId` (`MarkupFlagReview.tsx → highlightsFromFlag`) |
| Highlights rail | Filter by tag; when Plan sections present, shows per-section mark counts |

**`handleScanFlags` (`ObjectCreator.tsx`):**

- Requires parsed `doc.sentences`
- Tutorial: builds `sections` from titled Plan sections; if none and no focus → error “Add named sections in Plan before scanning.”
- Calls `suggestTutorialMarkupFlags(sentences, { instruction: sections.length ? undefined : focus, objective, title, sections })`
- User-triggered only — does not auto-run on step entry

**Reads:** doc/sources, highlights, Plan sections, objective.  
**Writes:** `highlights`, `markupFlags`, `flagSummary` / `flagError`.

**Gating Next:** `!parsing && !!doc && doc.sentences.length > 0` (for pipeline). Mark up is labeled optional in the rail but Next still needs a parsed document when using material sources.

**API:** `POST /api/tutorials/suggest-markup-flags` (`api.ts → suggestTutorialMarkupFlags`).

---

### 4.4 Extract (`TutorialExtractPanel`, step 4)

**Purpose:** Build `ClusteredKnowledgeBase` and let the author move units between Plan sections + Unassigned.

**Define-first mode:** `tutorialDefinition` with ≥1 titled section → `defineFirst` true:

- Copy: clusters = Plan sections; Shape-with-AI UI hidden
- Pull builds with `tutorialDefinition` payload → server `buildClusteredKnowledgeBaseFromDefinition`
- Outcome text: “Clusters are your Plan sections. Move Unassigned units into a section before generating.”

**Controls (representative):** Pull & cluster (`runBuild`), rename cluster (non–define-first / limited), move unit, merge clusters, delete unit, seed unmarked sources into Unassigned, active cluster selection. Unassigned bucket uses `UNASSIGNED_SECTION_ID`.

**Reads:** highlights / extracts / objective / tutorialDefinition / per-source docs.  
**Writes:** `knowledgeBase`, syncs extracts via parent `syncExtractsFromUnits`.

**Gating:** Extract step itself does not special-case `canNext` (falls through to `true`). Generate later requires clusters when not prompt/manual (`runGenerate` → `needsClusters`).

**API:** `POST /api/tutorials/extract-knowledge` (`api.ts → buildTutorialKnowledgeBase`).

---

### 4.5 Define (`S4`, step 5) + Generate action

**Purpose:** Confirm Plan + template summary; set title/scope; generate.

**Tutorial UI when `tutorialDefinition` present (`S4`):**

- Title + visibility (`SCOPES`)
- **Plan (set earlier)** — read-only objective + sections (archetype name, depth); **Edit Plan** → `goTo(planStep)`
- Template chip
- **Template knobs** — collapsed one-liner (secs, depth, checks, pass, hints, length rule, AI extras Off) — **not** the full `CFG.tutorial` field groups
- Warnings for empty sections / Unassigned units
- **What will be generated** (`blueprint` string)

**Note:** Full `CFG.tutorial` structure/scoring fields render only when the tutorial branch **without** `tutorialDefinition` is taken (legacy path). With define-first state always seeded, the slim UI is the live path for new tutorials.

**Generate (`advance` when `step >= defineStep` → `runGenerate`):**

1. Confirm regenerate if draft exists  
2. `applyKnobLocks(template, fv)`  
3. Force `aiExtra: false`, `words: 0`  
4. If `planIsReady` + knowledgeBase → `buildTutorialSectionPlansFromDefinition`; else legacy `buildTutorialSectionPlans` from clusters  
5. Stream `generateTutorial(payload)`  
6. `orderTutorialParts` → hints → `injectPinnedEmbedsIntoParts(template.recipe pick_from_library slots)`  
7. Open editor

**Payload fields:** see §6.

**Gating:** Define Next always enabled by `canNext` (`true` at define); generate itself errors if clusters missing for material path.

---

## 5. Source-mode & mixed-template logic

### Modes (`EmbeddedObjectSourceMode`)

| Mode (code) | UI label | Intended behavior in code |
|-------------|----------|---------------------------|
| `generate` | Generate new | Included in recipe prompt; quiz → `section-quiz`; other types → rich-text placeholder (`formatRecipeItemForPrompt`, `buildGeneratePrompt`) |
| `pick_from_library` | Pick from library | Prompt: do NOT emit part; after stream, `injectPinnedEmbedsIntoParts` inserts `library-embed` snapshots |
| `prompt_on_author` | Prompt when authoring | Treated like generate for quiz emission rules (`sourceMode=generate (or prompt_on_author)` in compositeQuizRules); non-quiz → placeholder rich-text. **No separate runtime “prompt the developer” UI in ObjectCreator Plan** was found |

### What is actually wired for pipeline scoping

| Step | Scopes to generate-new only? | Actual behavior |
|------|------------------------------|-----------------|
| Plan | **No** | Only objective + sections (+ archetype/depth). No embed checklist / no `embedPlans` on `TutorialDefinition` |
| Mark up / Extract | **No** | Always about source passages → Plan sections; unaware of embed source modes |
| Define | **No** | Does not list generate-new vs library slots |
| Generate prompt | **Partial** | Per-section `sectionRecipe` (from archetype + conditions) includes all modes; pick_from_library lines tell model not to emit |
| Post-generate inject | **Partial** | Uses **`template.recipe` embedded pick_from_library items only** (`runGenerate` → `injectPinnedEmbedsIntoParts`), **not** per-section `sectionRecipe` / archetype recipes |

### Mixed template (e.g. library Quiz + library Concept card + generate Assignment)

- Template can store all three as `EmbeddedObjectItem`s with different `sourceMode`s.
- Plan/Mark up/Extract **do not** focus UI on the Assignment alone — author still plans teaching sections and marks sources for teaching units.
- At generate: assignment (if `generate`) becomes a placeholder rich-text per prompt rules; quiz `generate` becomes section-quiz; library pins inject if present on **default** `template.recipe`.
- `buildTutorialSectionPlans` (legacy cluster path) `console.warn`s that non-quiz embedded types are deferred for generation.

### All-library / nothing generate-new

- **Not found in code:** automatic skip of Mark up/Extract based on recipe source modes. Rail still shows those steps; only `pathMode === 'manual'` skips them (`advance`). Prompt path still enters Mark up after expand.
- Author can click optional steps forward once prior gates pass, but material generate still wants a knowledge base with clusters (`runGenerate` needsClusters).

### Multiple generate-new objects

- Each appears as a recipe line in the section plan prompt; non-quiz generate embeds ask for short rich-text placeholders, not full nested object pipelines.

---

## 6. The generation contract (server)

### Client assembly (`ObjectCreator.tsx → runGenerate`)

```
{
  title,
  config: {
    obj, topic, aud, lvl,
    secs: max(templateSecs, planSectionCount),
    prog, dpth, end,
    words: 0,
    chks, excpts, wex,
    passOn, pass, hintsOn, hintN,
    aiExtra: false,          // forced
    templateId
  },
  extracts, highlights,
  prompt?, media?,
  template, knowledgeBase, sectionPlans?,
  shapeIntent: undefined,
  tutorialDefinition?: { objective, sections[{id,title,intent,archetypeId,depth}] },
  authorInstructions
}
```

Section plans from `buildTutorialSectionPlansFromDefinition`:

- One plan per titled `DefinedSection`
- `clusterId` from matching KB cluster (or empty cluster)
- `sectionRecipe` = `filterRecipeByCondition(resolveSectionRecipe(...), sectionUnits)` when composite
- `intent`, `archetypeId`, `depth`, mediaPlacements

### Prompt builder (`server/index.mjs → buildGeneratePrompt`)

Forces `c.aiExtra = false`, `c.words = 0`.

**HARD CONSTRAINTS** (system string):

> Do NOT invent sections, do NOT reorder or add sections, do NOT introduce facts not present in that section's assigned units, do NOT decide scope — the human already did.

Also: `AI EXTRAS ARE OFF`, groundingStrict (only listed units), lengthRule (no word target; Overview/Standard/In-depth sizing; empty → missing markup note).

**Per section plan line includes:** title, human intent, archetype id, section depth, recipe (composite or flat), media slots, SOURCE UNITS ONLY (or empty missing-markup instruction).

**Embedded rules (composite):** pick_from_library → no emit; generate/prompt_on_author quiz → one `section-quiz`; other generate embeds → short rich-text placeholder.

**Output order (user):** Introduction → each section teaching then checks → End with; assessment placement modifiers for end_only / none / after_each.

**Note:** Body field `tutorialDefinition` is accepted on the generate request; the preferred template path builds from **`sectionPlans` + knowledgeBase`**. The extract endpoint uses `tutorialDefinition` for fixed clustering (`buildClusteredKnowledgeBaseFromDefinition`).

---

## 7. Full use-case walkthroughs

### (a) Plain generate-from-one-PDF tutorial

1. **Template Library** — pick e.g. Concept-Example-Practice (`DEFAULT_TUTORIAL_TEMPLATE_ID`).
2. **Plan** — objective + N sections (seeded from `secs`); optional archetype/depth.
3. **Sources** — attach PDF (`pathMode: material`).
4. **Mark up** — parse PDF; Scan by Plan sections → Accept flags (sectionId preserved) and/or manual tags with section picker.
5. **Extract** — Pull & cluster → clusters named as Plan sections + Unassigned; move units.
6. **Define** — title/scope; confirm Plan; Generate.
7. **runGenerate** — sectionPlans from definition; stream parts; inject any pick_from_library on default recipe; open editor.

### (b) Mixed “t1-like” template (library Quiz + library Concept card + generate Assignment)

1. Template recipe embeds three slots with `pick_from_library`, `pick_from_library`, `generate` (assignment).
2. **Plan** still only collects objective/sections — **does not** present an Assignment-only authoring subflow (gap vs product intent).
3. Mark up / Extract still ground **teaching units** into sections.
4. Generate prompt includes all three recipe lines per section (after conditions); library lines say do not emit; assignment → placeholder rich-text.
5. `injectPinnedEmbedsIntoParts` inserts **both** library pins from `template.recipe` into each teaching section (and strips AI `section-quiz` if a quiz pin exists).

### (c) All-library template

1. Recipe embeds only `pick_from_library` items (no generate teaching blocks beyond heading/explanation atoms — depends on author).
2. **No automatic Mark up/Extract skip** for this case — only manual path skips.
3. If author still pulls clusters and generates, AI writes teaching from units; inject adds library objects. If they skip Extract, material `runGenerate` errors: “Build clusters in Extract first…”.

### (d) Locked template

1. Editor sets e.g. `knobLocks.dpth` / `chks` / `scoring` true; saves `structureLocked` if any lock.
2. Define shows slim summary + “some knobs locked by template” when `isTutorialStructureLocked`.
3. `runGenerate` → `applyKnobLocks` forces locked fields from `knobDefaults` even if `fv` differed.

### (e) Old source-first tutorial (backward compat)

1. Open object whose `CreatorPipelineDraft` lacks `tutorialDefinition`.
2. Restore path (`ObjectCreator` draft hydrate): `deriveTutorialDefinition({ template, fv, clusters, description })` — sections from non-Unassigned clusters or template seed; objective from `fv.obj` / topic / description.
3. If clusters existed, Mark up/Extract state can still be present; Generate uses define-first builder once `planIsReady` after derivation (objective may be placeholder `'Untitled tutorial objective'`).
4. Persist writes `tutorialDefinition` on subsequent draft save (`CreatorPipelineDraft.tutorialDefinition`).

---

## 8. Defaults, options & enumerations

| Enum / set | Values | Default (as coded) |
|------------|--------|---------------------|
| Pipeline steps (tutorial) | Plan, Sources, Mark up, Extract, Define | start step 1 |
| `pathMode` | material, prompt, manual | `material` |
| Highlight tags | Use, Support, Ignore, Note | popup default Use |
| `MarkupFlagStatus` | pending, accepted, rejected, adjusted | pending from scan |
| `ContentUnitKind` / KINDS | Definition, Key point, Example, Quote, Fact, Procedure | classifier / UI |
| `SectionConnectionRule` | sequential, standalone, prerequisite_chain | sequential (builtins vary) |
| `AssessmentPlacement` | after_each_section, checkpoints_after_each, end_only, none | after_each_section (typical) |
| `TutorialDepth` / dpth | Overview, Standard, In-depth | Standard (`defaultKnobDefaults`) |
| Progression (`prog`) | Linear build-up, Prerequisite chain, Themed clusters | Linear build-up |
| End with | Recap only, End quiz, End assignment, None | Recap only |
| Source modes | generate, pick_from_library, prompt_on_author | generate (except reused-from-library → pick) |
| Block conditions | always, if_source_kinds, if_source_hint | always / omitted |
| Atomic blocks | see `ATOMIC_BLOCK_OPTIONS` | — |
| Embeddable types | see `EMBEDDED_OBJECT_OPTIONS` | — |
| Knob lock keys | secs, prog, dpth, end, chks, scoring | unlocked for new customs |
| `defaultKnobDefaults` | secs:3, prog Linear, dpth Standard, end Recap only, chks:1, excpts:0, wex:true, passOn:true, pass:70%, hintsOn:true, hintN:4, aiExtra:false | |
| Pass mark options (CFG) | 50–90% | 70% |
| Scopes (S4) | private, team, program, organization | (creator state default — see ObjectCreator init; **not re-verified here**) |
| Object statuses | elsewhere on `LearningObject` | out of pipeline wizard |
| Default template id | `concept-example-practice` | `DEFAULT_TUTORIAL_TEMPLATE_ID` |
| Freeform template id | `author-freeform` | always unlocked |
| Unassigned id | `__unassigned__` | |

Audience/level (`aud`/`lvl`) still appear in generate `config` from `fv` / defaults in prompt (“High school” / “Basic”) but are **not** in slim tutorial Define UI / `CFG.tutorial` groups.

---

## 9. Known gaps / inconsistencies / TODOs

| Item | Evidence |
|------|----------|
| `docs/tutorial-define-first-plan.md` still describes source-first step order, free-text-only scan, Define `aiExtra` UI, and cluster-named sections as “today” | Plan doc §1 vs `STEP_META_TUTORIAL`, section-driven `handleScanFlags`, slim `S4`, force-off `aiExtra` |
| Plan does **not** scope to generate-new embeds / no `embedPlans` | `TutorialDefinition` only `{objective,sections}`; `TutorialPlanPanel` has no embed UI |
| Mark up/Extract **not** skipped for all-library recipes | Only `pathMode === 'manual'` (and prompt expand→markup) special-cased in `advance` |
| Library inject uses **default** `template.recipe`, not per-section/archetype `sectionRecipe` | `runGenerate` → `injectPinnedEmbedsIntoParts(..., template.recipe.map embedded)` |
| Non-quiz embedded `generate` types deferred / placeholder-only | `buildTutorialSectionPlans` console.warn; prompt asks for rich-text summary, not full nested object |
| `prompt_on_author` has no dedicated Plan/Define resolver UI | Treated like generate in quiz rules; no ObjectCreator prompt flow found |
| Define slim UI means `CFG.tutorial` knobs are largely not editable on the happy path | Locked/unlocked knobs mainly affect `applyKnobLocks` / template library |
| Accept-all preserves `sectionId` via `highlightsFromFlag` — older notes claiming omission are outdated | `MarkupFlagReview.tsx → highlightsFromFlag` |
| Generate body `tutorialDefinition` vs prompt using `sectionPlans` | Extract uses definition; generate prompt path is sectionPlans-first |
| Word count retired but may linger on old drafts/templates | `words` ignored (`words: 0`) |
| Shape with AI hidden in define-first Extract; still exists for non–define-first / other types | `TutorialExtractPanel` |
| `structureLocked` vs granular `knobLocks` dual semantics | `isKnobLocked` legacy fallback |

---

## 10. File & symbol index

| Concern | File(s) | Key symbols |
|---------|---------|-------------|
| Step rail / advance / generate | `src/app/components/screens/ObjectCreator.tsx` | `STEP_META_TUTORIAL`, `planStep`…`defineStep`, `advance`, `runGenerate`, `handleScanFlags`, `canNext`, `pickTutorialTemplate` |
| Plan UI | same | `TutorialPlanPanel` |
| Define UI | same | `S4`, `CFG.tutorial` |
| Section plans | same | `buildTutorialSectionPlans`, `buildTutorialSectionPlansFromDefinition` |
| Definition helpers | `src/lib/tutorialDefinition.ts` | `planIsReady`, `seedSectionsFromTemplate`, `deriveTutorialDefinition`, `clustersFromDefinition`, `countEmptySections` |
| Types | `src/lib/types.ts` | `TutorialDefinition`, `DefinedSection`, `TutorialTemplate`, `RecipeItem`, `EmbeddedObject*`, `ClusteredKnowledgeBase`, `TutorialSectionPlan`, `MarkupFlag`, `CreatorPipelineDraft`, `UNASSIGNED_SECTION_ID` |
| Templates | `src/lib/tutorialTemplates.ts` | `resolveSectionRecipe`, `filterRecipeByCondition`, `applyKnobLocks`, `isKnobLocked`, `SOURCE_MODE_OPTIONS`, `formatRecipeItemForPrompt`, `BUILTIN_TUTORIAL_TEMPLATES`, `saveCustomTutorialTemplate` |
| Template editor | `src/app/components/screens/TutorialTemplateEditor.tsx` | `TutorialTemplateEditor`, `handleSave`, `validate`, locks, archetypes, recipe palettes |
| Mark up | `src/app/components/screens/MarkupWorkspace.tsx` | `runScan`, `selectAllActive`, `applyAction`, `CompactScanList` wiring |
| Flag → highlight | `src/app/components/screens/MarkupFlagReview.tsx` | `highlightsFromFlag` |
| Extract | `src/app/components/screens/TutorialExtractPanel.tsx` | `runBuild`, define-first branch, Unassigned move |
| Library inject | `src/lib/libraryEmbed.ts` | `injectPinnedEmbedsIntoParts`, `makeLibraryEmbedPart` |
| API client | `src/lib/api.ts` | `suggestTutorialMarkupFlags`, `buildTutorialKnowledgeBase`, `generateTutorial`, `expandTutorialPrompt` |
| Server scan | `server/index.mjs` | `suggestMarkupFlags`, `suggestMarkupFlagsPass` |
| Server extract | same | `buildClusteredKnowledgeBaseFromDefinition`, extract-knowledge route |
| Server generate | same | `buildGeneratePrompt` |
| Prior plan (aspirational / partly stale) | `docs/tutorial-define-first-plan.md` | — |

---

*End of code-derived tutorial pipeline documentation.*
