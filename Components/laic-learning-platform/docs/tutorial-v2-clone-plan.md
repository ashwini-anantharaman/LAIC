# Tutorial V2 clone plan (checkpoint — do not implement until “go”)

**Status:** PLAN ONLY  
**Goal:** Register a new object type `tutorial-v2` (“Tutorial V2”) that is behaviorally identical to today’s `tutorial`, with **full isolation** so future V2 work cannot change the original Tutorial.  
**Authority:** `docs/tutorial-pipeline-end-to-end.md` §10 + codebase grep (2026-08-04).

---

## 1) Recommendation: Strategy B (real fork)

| Strategy | Verdict |
|----------|---------|
| **A — shared pipeline, branch on type id** | Reject for this product goal. `ObjectCreator.tsx` alone has dozens of `typeId === 'tutorial'` branches (Plan, Define, generate, drafts). Later “section-by-section” V2 will rewrite Plan/Generate/UI. Shared components would force every V2 change to risk the original path. |
| **B — forked components + namespaced config** | **Choose this.** Duplicate the tutorial-specific surface under V2 modules/storage; leave original tutorial files **untouched** except minimal registry wiring (type enum + Create tile + route switch). |

**Justification (tied to your intent):** You will evolve V2 into a different section-by-section flow. Strategy A cannot guarantee that without forever threading `if (typeId === 'tutorial-v2')` through every tutorial screen. Strategy B pays duplication now so V2 can diverge without editing `tutorial` code.

**Hybrid allowed on purpose (still Strategy B):** Pure utilities with no tutorial identity (e.g. generic `libraryEmbed` inject helpers, `pastel.ts`, PDF parse) may be **imported** by both. Anything that knows “tutorial outline / templates / Plan / generate orchestration” is forked.

**Server:** Today `POST /api/tutorials/generate` is driven by template + `sectionPlans`, not by `ObjectType`. For **parity**, V2 may call the **same** endpoint with identical payloads (no server fork required in this pass). Document a future `tutorials-v2` route when V2 generation diverges.

---

## 2) Full clone surface — every file/symbol that implements or references Tutorial

### 2.1 Core identity & types

| File | Symbols / role |
|------|----------------|
| `src/lib/types.ts` | `ObjectType` includes `'tutorial'`; `TutorialTemplate`, `TutorialDefinition`, `DefinedSection`, `EmbedPlanOverride`, `RecipeItem`, `EmbeddedObject*`, `TutorialSectionPlan`, `CreatorPipelineDraft.tutorialDefinition`, `LearningObject.type` |
| `src/lib/data.ts` | Seed objects with `type: 'tutorial'` |
| `src/lib/learningAreas.ts` | Capability / area lists including `'tutorial'` |
| `src/app/components/screens/AdminPeopleRoles.tsx` | Role-type filters mentioning `tutorial` |

### 2.2 Create / catalog / routing

| File | Symbols / role |
|------|----------------|
| `src/app/components/screens/CDCreate.tsx` | `TILES` entry `{ id: 'tutorial', … }`; routes via `setCreatorObjectType` → `cd-creator` |
| `src/app/App.tsx` | `creatorObjectType`, `navigate('cd-creator')`, object open/edit by type |
| `src/app/components/screens/ObjectLibrary.tsx` | `canEdit` includes `tutorial`; type icons/labels |
| `src/app/components/LibraryPickerModal.tsx` | Type filter `{ type: 'tutorial', label: 'Tutorials' }` |
| `src/app/components/screens/LearnerReader.tsx` | `obj.type === 'tutorial'` pagination / cumulative quiz / label |

### 2.3 Pipeline driver (largest surface)

| File | Symbols / role |
|------|----------------|
| `src/app/components/screens/ObjectCreator.tsx` | `STEP_META_TUTORIAL`; `isTutorial = typeId === 'tutorial'`; `TutorialPlanPanel`; `buildTutorialSectionPlans*`; `scaffoldTutorialFromTemplate`; `S4` / Define tutorial branch; `runGenerate` → `generateTutorial`; embed inject; draft restore for `obj.type === 'tutorial'`; `pickTutorialTemplate`; countless `typeId === 'tutorial'` gates |

### 2.4 Template system (must namespace for V2)

| File | Symbols / role |
|------|----------------|
| `src/lib/tutorialTemplates.ts` | `BUILTIN_TUTORIAL_TEMPLATES`, `STORAGE_KEY = 'laic-tutorial-templates'`, `list/save/duplicate/getTutorialTemplate`, locks, recipe helpers, `SOURCE_MODE_OPTIONS`, … |
| `src/lib/tutorialDefinition.ts` | Plan helpers, `listEmbedsForDefinition*`, `patchEmbedPlan`, section seeding |
| `src/lib/templateDefaults.ts` | `getDefaultTemplateId('tutorial')`, shared `laic-default-template-ids` map |
| `src/lib/objectTemplates.ts` | `TemplateObjectType` includes `'tutorial'` but **defers** tutorial templates to `tutorialTemplates.ts` |
| `src/app/components/screens/TutorialTemplateEditor.tsx` | Full editor; saves via `saveCustomTutorialTemplate` |
| `src/app/components/screens/TutorialTemplatePicker.tsx` | Inline picker + editor |
| `src/app/components/screens/TemplateLibrary.tsx` | `typeFilter === 'tutorial'` → tutorial template list/editor/duplicate |

### 2.5 Mark up / Extract / embeds / API

| File | Symbols / role |
|------|----------------|
| `src/app/components/screens/MarkupWorkspace.tsx` | Scan / highlights (tutorial Plan sections via props) |
| `src/app/components/screens/MarkupFlagReview.tsx` | `highlightsFromFlag` |
| `src/app/components/screens/TutorialExtractPanel.tsx` | Define-first extract; `tutorialDefinition` |
| `src/lib/libraryEmbed.ts` | `injectEmbedsIntoParts`, `injectPinnedEmbedsIntoParts`, `makeLibraryEmbedPart` |
| `src/lib/tutorialEmbedGenerate.ts` | Client generate for non-quiz embeds |
| `src/lib/api.ts` | `generateTutorial`, `suggestTutorialMarkupFlags`, `buildTutorialKnowledgeBase` / extract-knowledge, ingest/expand/edit-block |
| `src/lib/assistant.ts` | `objectType === 'tutorial' ? aiExtra: false` |
| `server/index.mjs` | `/api/tutorials/*`, `buildGeneratePrompt`, composite recipe, section-quiz, extract-knowledge |

### 2.6 Docs (reference only — not runtime)

- `docs/tutorial-pipeline-end-to-end.md`
- `docs/tutorial-define-first-plan.md`
- `docs/tutorial-embed-generation-plan.md`
- gap reports mentioning tutorial

---

## 3) What will be created vs edited vs untouched

### 3.1 Created (Strategy B forks)

| New artifact | Cloned from / purpose |
|--------------|------------------------|
| `src/lib/tutorialV2/tutorialTemplates.ts` | Copy of `tutorialTemplates.ts`; **`STORAGE_KEY = 'laic-tutorial-v2-templates'`**; builtin ids prefixed e.g. `v2-concept-example-practice` (or same recipe content, distinct ids); all exports suffixed or namespaced (`listTutorialV2Templates`, …) |
| `src/lib/tutorialV2/tutorialDefinition.ts` | Copy of `tutorialDefinition.ts` importing V2 templates module |
| `src/lib/tutorialV2/tutorialEmbedGenerate.ts` | Copy of `tutorialEmbedGenerate.ts` (or thin re-export if still identical — prefer copy for isolation) |
| `src/app/components/screens/tutorialV2/TutorialTemplateEditorV2.tsx` | Copy of `TutorialTemplateEditor.tsx` → saves to V2 store |
| `src/app/components/screens/tutorialV2/TutorialTemplatePickerV2.tsx` | Copy of picker |
| `src/app/components/screens/tutorialV2/TutorialExtractPanelV2.tsx` | Copy of extract panel (even if props-identical today) |
| `src/app/components/screens/tutorialV2/ObjectCreatorTutorialV2.tsx` | **Forked creator** for `typeId === 'tutorial-v2'` only — start as a copy of `ObjectCreator.tsx` with non-tutorial branches stripped **or** a full copy that only mounts when V2 is selected. Imports only `tutorialV2/*` helpers. Hard-code / default `typeId` to `'tutorial-v2'`. |
| Optional: `TutorialPlanPanel` | If left inside ObjectCreator today, move/copy into V2 creator file so V1 Plan UI stays in the original ObjectCreator |

**Shared OK (no fork this pass):** `MarkupWorkspace.tsx`, `MarkupFlagReview.tsx`, `libraryEmbed.ts` (generic), `api.ts` tutorial endpoints, `server/index.mjs` generate branch — V2 calls the same HTTP APIs with the same shapes for parity.

### 3.2 Edited (minimal registry / routing only)

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `'tutorial-v2'` to `ObjectType` (and any unions that exhaust ObjectType) |
| `src/app/components/screens/CDCreate.tsx` | New tile: id `tutorial-v2`, label **“Tutorial V2”**, same icon language as Tutorial, desc hinting future (“section-by-section” OK in **copy only**; behavior identical) |
| `src/lib/objectTemplates.ts` | Extend `TemplateObjectType` / labels / `TEMPLATE_OBJECT_TYPES` with `tutorial-v2`; treat like tutorial (delegate to V2 template module, not knob-only object templates) |
| `src/lib/templateDefaults.ts` | Fallback default id for `tutorial-v2` → V2 CEP builtin id |
| `src/app/components/screens/TemplateLibrary.tsx` | When `typeFilter === 'tutorial-v2'`, list/edit via V2 template APIs + `TutorialTemplateEditorV2` |
| `src/app/App.tsx` | When `creatorObjectType === 'tutorial-v2'`, render `ObjectCreatorTutorialV2` instead of `ObjectCreator` |
| `src/app/components/screens/ObjectLibrary.tsx` | `canEdit` / icons / labels for `tutorial-v2` (same as tutorial) |
| `src/app/components/LibraryPickerModal.tsx` | Optional filter entry for Tutorials V2 (or map under Tutorials) |
| `src/app/components/screens/LearnerReader.tsx` | Treat `tutorial-v2` like `tutorial` for pagination / cumulative quiz (parity) |
| `src/lib/assistant.ts` | `tutorial-v2` → same `aiExtra: false` rule |
| `src/lib/learningAreas.ts` / admin filters | Add `tutorial-v2` wherever object types are enumerated so V2 is creatable/visible under same perms |

### 3.3 Explicitly UNTOUCHED (original Tutorial path)

These must remain byte-for-byte as today (no behavior edits in this pass):

- `src/app/components/screens/ObjectCreator.tsx` — **no** new V2 logic inside; at most App stops routing V2 into it  
- `src/lib/tutorialTemplates.ts` — storage key `laic-tutorial-templates` unchanged  
- `src/lib/tutorialDefinition.ts`  
- `src/lib/tutorialEmbedGenerate.ts`  
- `src/app/components/screens/TutorialTemplateEditor.tsx`  
- `src/app/components/screens/TutorialTemplatePicker.tsx`  
- `src/app/components/screens/TutorialExtractPanel.tsx`  
- Existing tutorial drafts / custom templates in `laic-tutorial-templates`  
- Server tutorial routes (shared call only; no rewrite of original branch semantics)

**Proof of isolation after implement:** `git diff` on the untouched list is empty (or only whitespace-free). V2 lives only under `tutorialV2/` + registry edits.

---

## 4) Templates & draft namespacing (no collision)

| Concern | Tutorial (V1) | Tutorial V2 |
|---------|---------------|-------------|
| Custom templates localStorage | `laic-tutorial-templates` | `laic-tutorial-v2-templates` |
| Builtin template ids | e.g. `concept-example-practice` | Distinct ids e.g. `v2-concept-example-practice` (same recipe content) |
| Default template map | `laic-default-template-ids.tutorial` | `laic-default-template-ids['tutorial-v2']` |
| Learning objects | `LearningObject.type === 'tutorial'` | `type === 'tutorial-v2'` |
| Creator drafts | Existing draft keys / `CreatorPipelineDraft` with `type: 'tutorial'` | Same draft machinery but `type: 'tutorial-v2'` so drafts never overwrite V1 |
| Embed plan keys | Inside V1 definition | Inside V2 definition only |

Editing a V2 template must call **only** V2 save APIs; V1 Template Library filter `tutorial` must never read `laic-tutorial-v2-templates`.

---

## 5) Behavioral parity requirements (this pass)

V2 must match V1 for:

- Step rail: Plan → Sources → Mark up → Extract → Define → Generate (`STEP_META_TUTORIAL` equivalent)  
- Plan: objective, sections, object tagging, prompt_on_author / library slot resolution  
- Sources / Mark up / Extract / Define controls, defaults, validation soft-blocks  
- Template editor: structure, locks, recipe, embeds (metadata-only library slots), preview  
- Generation: same `generateTutorial` payload shape → same `buildGeneratePrompt` path → same part types (including section-quiz + client embed inject)  
- Learner preview behavior for produced objects  

**Label-only difference:** Create catalog name “Tutorial V2” (and optional subtitle). No other wording/UI deltas.

---

## 6) Verification plan (after implement)

1. **Registry:** Create menu shows Tutorial and Tutorial V2 as separate tiles.  
2. **Isolation:** Open Template Library → Tutorial → edit CEP; open Tutorial V2 templates → confirm separate list/storage; editing one does not change the other.  
3. **Parity walkthrough:** Same PDF/source + equivalent CEP template on V1 and V2 → same Plan fields, same Mark up/Extract UI, same Define summary, Generate → compare part structure (types/order/section-quiz/embeds).  
4. **Regression:** Existing V1 draft opens and generates as before.  
5. **Build:** `npm run build` passes.  
6. **Diff guard:** Confirm listed “untouched” files have no intentional logic changes.

---

## 7) Out of scope (later prompt)

- Any Approach-2 / section-by-section / manual-authoring redesign  
- New V2-only screens or prompt changes  
- Forking server generate until V2 generation must diverge  
- Changing original Tutorial behavior

---

## 8) Stop

This document is the checkpoint. **No implementation until explicit “go”.**
