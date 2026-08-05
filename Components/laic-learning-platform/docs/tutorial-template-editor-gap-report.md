# Tutorial Template Editor — Composite Recipe Gap Report

**Status:** Proposal only. No implementation until explicit “go.”  
**Scope allowed for later work:** `TutorialTemplateEditor.tsx`, `src/lib/types.ts` (tutorial-template types only), and the minimal `src/lib/tutorialTemplates.ts` changes required so builtins / blank draft / save / normalize understand the new recipe shape.  
**Out of scope:** Other object-type editors, Course Wizard, admin / reviewer / coach / student chrome, sidebar, top bar, login, ObjectCreator generate pipeline (consume later), LearnerReader.

**Guiding principle:** A Tutorial is a **composite** learning object. Its per-section recipe must distinguish **atomic inline blocks** (authored inside the section) from **embedded learning objects** (whole nested objects: quiz, flashcard set, concept card, scenario, assignment, reflection, or a reused library object). Treating “write a paragraph” and “embed a quiz object” as the same flat row type is the root defect.

---

## 1. How the editor and recipe behave today

### 1.1 Entry point and chrome

- Hosted from `TemplateLibrary.tsx` in focused-editor mode (`editingTutorial === 'new' | TutorialTemplate`).
- Component: `src/app/components/screens/TutorialTemplateEditor.tsx`.
- Data helpers: `src/lib/tutorialTemplates.ts` (`BUILTIN_TUTORIAL_TEMPLATES`, `RECIPE_BLOCK_OPTIONS`, `blankCustomTemplateDraft`, `saveCustomTutorialTemplate`, `listTutorialTemplates`, …).
- Types: `src/lib/types.ts` (`TutorialTemplate`, `SectionBlockRecipeItem`, `SectionRecipeBlockType`, `MediaSlot`, `SectionConnectionRule`, `AssessmentPlacement`, `TutorialKnobDefaults`).

Top of the editor (structure/styling to **keep**):

| Control | UI pattern | State |
| --- | --- | --- |
| Name | text input | `name` |
| Description | textarea | `description` |
| Section connection | pill group (`CONNECTION_OPTIONS`) | `sectionConnection` |
| Assessment | pill group (`ASSESSMENT_OPTIONS`) | `assessmentPlacement` |
| Default sections / Checks per section / End with | number inputs + select | `secs`, `chks`, `end` |
| Footer | green “Save template” + “Cancel” | `handleSave` / `onCancel` |

### 1.2 Current recipe model (flat list)

Every recipe row is the same type:

```ts
// src/lib/types.ts (today)
export type SectionRecipeBlockType =
  | 'section-heading'
  | 'explanation'
  | 'worked-example'
  | 'source-excerpt'
  | 'instruction'
  | 'try-it'
  | 'principle'
  | 'misconception'
  | 'correction'
  | 'scenario-advance'
  | 'knowledge-check'   // ← treated as an atomic block, not an embedded quiz object
  | 'media';            // ← treated as an atomic block; also mirrored into mediaSlots

export interface SectionBlockRecipeItem {
  type: SectionRecipeBlockType;
  preferKinds?: ContentUnitKind[];
  required?: boolean;
}

export type SectionBlockRecipe = SectionBlockRecipeItem[];

export interface MediaSlot {
  id: string;
  kind: 'image' | 'video' | 'either';
  required?: boolean;
  afterRecipeIndex: number;
  hint?: string;
}

export interface TutorialTemplate {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  sectionBlockRecipe: SectionBlockRecipe;
  sectionConnection: SectionConnectionRule;
  assessmentPlacement: AssessmentPlacement;
  mediaSlots: MediaSlot[];
  knobDefaults: TutorialKnobDefaults;
}
```

**Quoted chip / add list** (`RECIPE_BLOCK_OPTIONS` in `tutorialTemplates.ts`):

| `type` | Label |
| --- | --- |
| `section-heading` | Section heading |
| `explanation` | Explanation |
| `worked-example` | Worked example |
| `source-excerpt` | Source excerpt |
| `instruction` | Instruction |
| `try-it` | Try it |
| `principle` | Principle |
| `misconception` | Misconception |
| `correction` | Correction |
| `scenario-advance` | Scenario advance |
| `knowledge-check` | Knowledge check |
| `media` | Media slot |

One flat chip row at the bottom; `addBlock(type)` appends `{ type, required: type !== 'media' && type !== 'source-excerpt' }`.

Each row UI is identical: index · label · ↑ · ↓ · trash. No object type, source mode, version pin, or authoring note.

### 1.3 Save / validation today

`handleSave` only checks:

1. Name non-empty.
2. Recipe length ≥ 1.
3. At least one non-`media` item.

Then it **derives** `mediaSlots` from every `type === 'media'` row (`kind: 'either'`, `afterRecipeIndex`, generic hint) and calls `saveCustomTutorialTemplate(...)`.

`saveCustomTutorialTemplate` persists customs under `localStorage` key `laic-tutorial-templates` (merge/override builtins by id). Editor React state itself does not read/write storage directly, but custom templates only survive via that module.

There is **no** assessment↔check consistency check, no required-slot configuration check, and no library/version reference validation.

### 1.4 Current default “Concept, Example, Practice”

From `BUILTIN_TUTORIAL_TEMPLATES[0]` (`id: 'concept-example-practice'`):

| Knob | Value |
| --- | --- |
| `sectionConnection` | `sequential` |
| `assessmentPlacement` | `after_each_section` |
| `secs` | 3 |
| `chks` | 1 |
| `end` | `Recap only` |

Recipe (flat):

1. `section-heading` (required)  
2. `explanation` (required, preferKinds Definition/Key point)  
3. `worked-example` (required, preferKinds Example)  
4. `media` (optional by omission of `required`)  
5. `knowledge-check` (required) — **inline block type, not an embedded Quiz object**

Plus a parallel `mediaSlots` entry `{ id: 'worked-diagram', kind: 'image', afterRecipeIndex: 2 }`.

### 1.5 Conceptual failure (why redesign)

| Row today | What it actually is | How editor treats it |
| --- | --- | --- |
| Explanation, Worked example, Principle, … | Atomic inline content | Same row as everything else |
| Knowledge check | Should be a nested **Quiz** learning object | Fake atomic `knowledge-check` block |
| Media slot | Optional matched asset / source media | Flat `media` row + derived `MediaSlot[]` |

The template cannot express composite nesting (Tutorial → section → embedded Quiz / Flashcard set / … / reused library object), so generation and Define-step consumption cannot treat checks as real reusable objects.

---

## 2. Proposed recipe split: atomic vs embedded (discriminated union)

### 2.1 Discriminated union

Replace the flat `SectionBlockRecipeItem` with:

```ts
RecipeItem =
  | AtomicBlockItem      // kind: 'atomic'
  | EmbeddedObjectItem   // kind: 'embedded'
```

- **Atomic** = content the tutorial authors **inline** inside the section.
- **Embedded** = a **whole learning object** nested in the section because Tutorial is composite.

These must never be silently converted into each other. `kind` is the discriminant; TypeScript narrows settings by `kind`.

### 2.2 Atomic block vocabulary (category A)

Exact set (replaces the mixed list; **drops** `knowledge-check` as an atomic type):

| `blockType` | Label | Notes |
| --- | --- | --- |
| `section-heading` | Section heading | Structural; alone does not satisfy “content-bearing” |
| `explanation` | Explanation | |
| `worked-example` | Worked example | |
| `source-excerpt` | Source excerpt | |
| `instruction` | Instruction | |
| `try-it` | Try it | Atomic checkpoint-style probe (not a Quiz object) |
| `principle` | Principle | |
| `misconception` | Misconception | |
| `correction` | Correction | |
| `scenario-advance` | Scenario advance | |
| `media` | Media slot | **Always optional by nature**; never blocks generation when empty |

Optional fields on atomic items (keep for extract grounding): `preferKinds?: ContentUnitKind[]`, `required?: boolean` (media defaults `required: false` and UI locks that).

### 2.3 Embedded object vocabulary (category B)

| `objectType` | Meaning |
| --- | --- |
| `quiz` | Embed a Quiz object |
| `flashcard-set` | Embed a Flashcard set |
| `concept-card` | Embed a Concept card |
| `scenario` | Embed a Scenario |
| `assignment` | Embed an Assignment |
| `reflection` | Embed a Reflection |
| `reused-from-library` | Any published/approved object from the Object Library |

Per embedded row settings:

| Field | Values / meaning |
| --- | --- |
| `objectType` | One of the above |
| `sourceMode` | `generate` \| `pick_from_library` \| `prompt_on_author` |
| `required` | Required vs optional slot |
| `versionPin` | When source is library / reused: pin `objectId` + `versionNumber` (stable tutorial) |
| `authoringNote` | Short instruction into generation (e.g. “test only this section’s concept”) |
| `libraryRef` | When `pick_from_library` / `reused-from-library`: selected object identity (behind typed boundary) |

**Source modes:**

- `generate` — create a new object for this slot at tutorial-generation time, grounded in the section’s source cluster.  
- `pick_from_library` — developer selects an existing reusable object now (template stores the pin).  
- `prompt_on_author` — leave the slot empty until a specific tutorial instance is authored.

### 2.4 Reuse of platform library + version pinning

**Existing platform facts:**

- `LearningObject` (`id`, `type`, `status`, `reuseCount`, …) and `Version` (`objectId`, `versionNumber`, `status`, `isLive`, …) already exist in `types.ts`.
- Course Wizard gap report proposed `ReusableObject` + `getReusableObjects()` / “Use object from library” (amber reused panel) — **not implemented** in the Course Wizard UI yet; no `VersionPin` type exists today.
- There is **no** shared `VersionPin` helper in `src/` today.

**Reuse plan (Tutorial templates only):**

1. Introduce `VersionPin` next to the tutorial-template types in `types.ts`, aligned with `Version`:

   ```ts
   export interface VersionPin {
     objectId: string;
     versionNumber: number;
   }
   ```

2. Introduce a **typed function boundary** (new small export in `tutorialTemplates.ts` or a tiny `src/lib/tutorialEmbedLibrary.ts` — still Tutorial-template scoped) such as:

   ```ts
   export interface LibraryObjectChoice {
     id: string;
     title: string;
     type: ObjectType;
     status: ObjectStatus;
     versions: { versionNumber: number; status: ObjectStatus; isLive: boolean }[];
   }

   /** Wire to real Object Library / API later. Must not fabricate rows. */
   export function listEmbeddableLibraryObjects(
     filter?: { types?: ObjectType[]; search?: string },
   ): Promise<LibraryObjectChoice[]>;
   ```

3. Until the real library/API is wired, the function returns `[]` or rejects with a typed error; the editor shows the **existing empty/error style** (“No reusable objects available yet”), never mock quizzes.

4. Validation: if `sourceMode === 'pick_from_library'` (or objectType `reused-from-library`) and `required`, a pin must resolve (`objectId` + `versionNumber` present). Dangling pins (id/version not returned by the boundary) → inline error. Optional unfilled slots are fine.

5. Do **not** change Course Wizard, Object Library screens, or `LearningObject` persistence in this pass — only model the pin the same way the platform already thinks about versions.

### 2.5 Media dual-model cleanup

Today: recipe `media` **and** top-level `mediaSlots[]` derived on save.

**Proposal:** Fold media config into the atomic media item so the ordered recipe is the single source of truth:

```ts
export interface MediaSlotConfig {
  kind: 'image' | 'video' | 'either';
  hint?: string;
}
```

Keep `TutorialTemplate.mediaSlots` temporarily as a **derived/compat** field computed on save from atomic `media` items (same as today) so older readers of the template don’t break — or deprecate it once only the editor+types consumers matter. Prefer: store config on the atomic item; still emit `mediaSlots` for backward compatibility during the transition. **No separate editor UI for the old parallel list.**

### 2.6 Migration of `knowledge-check`

- Remove `knowledge-check` from the atomic vocabulary.
- On load of legacy templates that still contain `{ type: 'knowledge-check' }`, normalize once in `tutorialTemplates.ts` to an `EmbeddedObjectItem` with `objectType: 'quiz'`, `sourceMode: 'generate'`, `required: true`, and a default authoring note. This keeps existing customs usable without a separate migration UI.
- Builtins that used `knowledge-check` are rewritten to the embedded Quiz shape in data.

---

## 3. Exact new TypeScript types (where they go)

**File:** `src/lib/types.ts` — replace/extend the Tutorial templates block (~lines 50–132). Keep `ContentUnitKind`, `SectionConnectionRule`, `AssessmentPlacement`, `TutorialKnobDefaults` (alias `SectionConnection = SectionConnectionRule` if desired for naming parity with the brief).

```ts
/* ─── Tutorial templates (composite-aware recipe) ───────────────── */

export type SectionConnection = SectionConnectionRule; // alias; keep SectionConnectionRule

export type AtomicBlockType =
  | 'section-heading'
  | 'explanation'
  | 'worked-example'
  | 'source-excerpt'
  | 'instruction'
  | 'try-it'
  | 'principle'
  | 'misconception'
  | 'correction'
  | 'scenario-advance'
  | 'media';

export type EmbeddableObjectType =
  | 'quiz'
  | 'flashcard-set'
  | 'concept-card'
  | 'scenario'
  | 'assignment'
  | 'reflection'
  | 'reused-from-library';

export type EmbeddedObjectSourceMode =
  | 'generate'
  | 'pick_from_library'
  | 'prompt_on_author';

export interface VersionPin {
  objectId: string;
  versionNumber: number;
}

export interface MediaSlotConfig {
  kind: 'image' | 'video' | 'either';
  hint?: string;
}

export interface AtomicBlockItem {
  kind: 'atomic';
  id: string;                 // stable row id for React keys / reorder
  blockType: AtomicBlockType;
  required?: boolean;         // media always false
  preferKinds?: ContentUnitKind[];
  media?: MediaSlotConfig;    // only when blockType === 'media'
}

export interface EmbeddedObjectItem {
  kind: 'embedded';
  id: string;
  objectType: EmbeddableObjectType;
  sourceMode: EmbeddedObjectSourceMode;
  required: boolean;
  authoringNote?: string;
  /** When picking / reusing from library — pin for stability. */
  versionPin?: VersionPin;
  /** Display title cached at pick time (optional; not a substitute for the pin). */
  libraryTitle?: string;
}

export type RecipeItem = AtomicBlockItem | EmbeddedObjectItem;

export type SectionRecipe = RecipeItem[];

export interface TutorialTemplate {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  /** Ordered per-section recipe (atomic + embedded). */
  recipe: SectionRecipe;
  sectionConnection: SectionConnectionRule;
  assessmentPlacement: AssessmentPlacement;
  /**
   * Compat: derived from atomic media items on save.
   * Prefer reading media config from recipe items.
   */
  mediaSlots: MediaSlot[];
  knobDefaults: TutorialKnobDefaults;
}
```

**Deprecate / remove from public recipe surface:**

- `SectionRecipeBlockType` including `knowledge-check` (keep a private legacy union only inside normalizer if needed).
- `SectionBlockRecipeItem` / `sectionBlockRecipe` field name → rename to `recipe` on `TutorialTemplate`.  
  **Compat:** normalizer accepts either `sectionBlockRecipe` (legacy flat) or `recipe` (new) when loading customs from storage.

**Also update** `TutorialSectionPlan.recipe` later if generation consumes it — **out of scope** for this editor pass; leave as-is or type-alias carefully so we don’t break Structure/generate yet. If renaming forces a compile break outside the allowed files, **stop and ask** before touching ObjectCreator.

**Constants** in `tutorialTemplates.ts`:

- `ATOMIC_BLOCK_OPTIONS` — chips for category A.  
- `EMBEDDED_OBJECT_OPTIONS` — chips for category B (incl. “Reused object from library”).  
- `SOURCE_MODE_OPTIONS` — labels for the three source modes.  
- Rewrite `BUILTIN_TUTORIAL_TEMPLATES` (at least default; other builtins migrate `knowledge-check` → embedded quiz or `try-it` as pedagogically appropriate).  
- `blankCustomTemplateDraft` / `normalizeCustom` / `isRecipeItem` updated for the union.  
- **Storage:** continue using existing `saveCustomTutorialTemplate` persistence API so customs survive; do **not** add new `localStorage` / `sessionStorage` calls inside the editor component. Editor state remains React-only. (Existing module already uses `localStorage`; migrating customs off browser storage is a separate platform decision — flag below.)

---

## 4. Redesigned UI (component by component)

Preserve outer card, fonts, palette, spacing, pill styles, field styles, Save/Cancel. Only replace the recipe region and chip region.

### 4.1 Unchanged (do not restyle)

- Name, Description, Section connection pills, Assessment pills.  
- Default sections / Checks per section / End with.  
- Save template / Cancel footer and existing error color (`#B91C1C`).

### 4.2 Recipe list header

Keep label tone: **“Per-section recipe (order = teaching order)”** with a one-line helper under it (same muted 12.5px grey as empty states):  
“Atomic blocks are written inline; embedded objects nest whole learning objects in the section.”

### 4.3 Row: Atomic block (category A)

Reuse current row shell (`rounded-xl border`, grey fill, mono index, ↑↓ trash):

- **Left accent:** 3px solid bar in a cool slate (e.g. `#94A3B8`) — subtle, not a new palette family.  
- **Type tag:** small uppercase/muted chip `Block` (11px, same grey system as existing labels).  
- **Label:** from `ATOMIC_BLOCK_OPTIONS`.  
- For `media`: secondary text “Optional — skip if no matching media” + `required` locked off (no toggle needed, or disabled Optional badge).  
- Controls: ↑ ↓ delete only (same as today). No object-type dropdown.

### 4.4 Row: Embedded object (category B)

Richer row, same card shell, differentiated:

- **Left accent:** 3px bar in the app’s existing green accent family (e.g. `#059669`) so it reads as “object,” not “paragraph.”  
- **Type tag:** chip `Embedded object`.  
- **Title line:** object type label (Quiz, Flashcard set, …, Reused from library).  
- **Expanded settings** (stacked inside the row, same field styles as Name/Description — no new card nesting):

  1. **Object type** — `<select>` of embeddable types (or pill subgroup if space; select matches “End with”).  
  2. **Source mode** — three pills (reuse Assessment/Connection pill pattern):  
     “Generate new” / “Pick from library” / “Prompt when authoring”.  
  3. **Required** — two pills Required | Optional (or existing bool pattern if one exists nearby; prefer pills for consistency with Assessment).  
  4. **Version pin** — visible when `pick_from_library` or `reused-from-library`: object picker trigger + version `<select>`. Picker calls `listEmbeddableLibraryObjects`; empty → honest empty copy.  
  5. **Authoring note** — single-line input / short textarea (placeholder e.g. “Quiz should test only this section’s concept”).

- Controls: ↑ ↓ delete on the header strip of the row.

### 4.5 Empty recipe

Same empty copy style: “No items yet — add a block or an embedded object below.”

### 4.6 Two add-chip groups (replace single chip row)

Match existing chip styling (`rounded-full border`, Plus icon, 11.5px):

**Add block** (label 11.5px muted above):  
chips for all atomic types in §2.2.

**Add embedded object** (separate group, small top margin):  
chips for Quiz, Flashcard set, Concept card, Scenario, Assignment, Reflection, Reused object from library.

Defaults when adding an embedded chip:

| Field | Default |
| --- | --- |
| `sourceMode` | `generate` (for typed objects); `pick_from_library` for “Reused object from library” |
| `required` | `true` for Quiz when assessment is after-each / checkpoints; else `true` for typed embeds, `false` optional only if product later prefers — **ship:** Quiz/Assignment `required: true`; Reflection `required: false`; others `required: true` |
| `authoringNote` | Quiz: `"test only this section's concept"`; others empty |
| `versionPin` | undefined until pick |

### 4.7 Inline validation surface

Reuse the existing single `error` string **plus** optional per-row muted/red helper under the row (12px `#B91C1C` or amber `#92400E` for warnings). Prefer:

- **Hard errors** (block Save): name, empty recipe, no content-bearing item, required embedded slot unconfigured, dangling pin.  
- **Warnings** (show inline, allow Save with confirm-or-still-save — **recommend:** allow Save but show warning banner so templates can be drafted; assessment contradictions are warnings unless we decide hard — see §6).

---

## 5. New good default template (main deliverable)

**Replace** builtin `concept-example-practice` with:

| Field | Value |
| --- | --- |
| `id` | `concept-example-practice` (unchanged id so Define step / `DEFAULT_TUTORIAL_TEMPLATE_ID` keep working) |
| `name` | Concept, Example, Practice |
| `description` | Each section explains one concept, shows a worked example, optionally attaches matched media, then embeds a real Quiz object to check understanding. |
| `sectionConnection` | `sequential` |
| `assessmentPlacement` | `after_each_section` |
| `knobDefaults.secs` | **6** |
| `knobDefaults.chks` | **2** (hint for how many items the generated quiz should target; the check itself is the embedded Quiz) |
| `knobDefaults.end` | `Recap only` |
| `knobDefaults.prog` | `Linear build-up` |
| `knobDefaults.dpth` | `Standard` |
| `knobDefaults.wex` | `true` |

**Per-section recipe (teaching order):**

| # | Kind | Spec |
| --- | --- | --- |
| 1 | Atomic | `section-heading`, required |
| 2 | Atomic | `explanation`, required, preferKinds `['Definition','Key point']` |
| 3 | Atomic | `worked-example`, required, preferKinds `['Example']` |
| 4 | Atomic | `media`, **required: false**, `media: { kind: 'either', hint: 'Optional media matched to this section' }` |
| 5 | Embedded | `objectType: 'quiz'`, `required: true`, `sourceMode: 'generate'`, `authoringNote: 'test only this section\'s concept'` |

No legacy `knowledge-check` row. Media never blocks generation. The check is a **real nested Quiz object**, not an inline question block.

Other builtins: migrate `knowledge-check` → embedded Quiz (`generate`) with a short note; keep their pedagogical order otherwise. Scenario-driven / reference templates without checks stay without embedded Quiz unless assessment requires it.

`blankCustomTemplateDraft`: seed the same composite shape as the new default (or a minimal heading + explanation + embedded quiz) so “Create template” starts composite-aware.

---

## 6. Validation rules and surfacing

| # | Rule | Severity | Surface |
| --- | --- | --- | --- |
| V1 | Recipe must contain ≥1 **content-bearing** item (any atomic except `section-heading` alone, **or** any embedded object). Heading-only → hard error. | Error | Footer error; Save blocked |
| V2 | If Assessment is `after_each_section` or `checkpoints_after_each`, recipe must include ≥1 **knowledge-check-style** item: embedded `quiz` **or** atomic `try-it`. If missing → warn. | Warning | Amber banner under Assessment / above recipe |
| V3 | If Assessment is `none` and recipe contains embedded `quiz` or atomic `try-it` → warn (contradiction). | Warning | Same |
| V4 | Every **required** embedded item must have a resolvable `sourceMode` (`generate` \| `pick_from_library` \| `prompt_on_author` always set). If `pick_from_library` / `reused-from-library`, must also have `versionPin`. Missing → error on that row + Save blocked for required slots. | Error | Per-row red helper |
| V5 | Atomic `media` is optional by nature; UI shows Optional; unfilled media never blocks Save/generation. | Info | Row subtitle only |
| V6 | `versionPin` present → must resolve via library boundary (object exists + version exists). Dangling → error on row. If library unavailable, show empty state and treat required pick as unconfigured (V4). | Error | Per-row + picker empty/error |
| V7 | Name non-empty (existing). | Error | Footer |
| V8 | Recipe non-empty (existing, subsumed by V1). | Error | Footer |

**Knowledge-check-style** definition for V2/V3:  
`item.kind === 'embedded' && item.objectType === 'quiz'` **OR** `item.kind === 'atomic' && item.blockType === 'try-it'`.

Warnings do not block Save (draft templates remain editable); errors do.

---

## 7. Custom template saving (persist full composite shape)

On Save, persist:

- `name`, `description`
- `sectionConnection`, `assessmentPlacement`
- `knobDefaults` (secs / chks / end / prog derived from connection as today / dpth / wex from recipe presence of worked-example / existing hint fields)
- `recipe: RecipeItem[]` — each item records `kind: 'atomic' | 'embedded'` and the full embedded settings
- `mediaSlots` derived from atomic media items for compat

Structure so **program-defined custom templates** (same `TutorialTemplate` shape, `builtin: false`) need no later refactor: builtins and customs share one type; `listTutorialTemplates()` continues to merge.

**Open decision — localStorage:**  
`tutorialTemplates.ts` already persists customs in `localStorage`. The brief forbids browser storage APIs for this work’s **state**. Plan: editor keeps React state only; continue calling `saveCustomTutorialTemplate` so Save still works without inventing a new store. If you want customs moved entirely off `localStorage` in the same pass, say so on “go” — that is a persistence migration, not a UI redesign, and may deserve a follow-up.

---

## 8. File touch list (when implementing)

| File | Change |
| --- | --- |
| `src/lib/types.ts` | New union types; update `TutorialTemplate` |
| `src/lib/tutorialTemplates.ts` | Options, builtins, default, normalize, blank draft, library boundary stub |
| `src/app/components/screens/TutorialTemplateEditor.tsx` | Two-category recipe UI + validation |

**Do not touch** unless compile forces it (then STOP and ask): `ObjectCreator.tsx`, Course Wizard, other editors, sidebar, etc.

---

## 9. Implementation order (after “go”)

1. Types + normalizer (legacy flat → union) + rewrite default builtin.  
2. Editor recipe rows + two chip groups + embedded settings.  
3. Validation V1–V8.  
4. Library boundary stub + empty/error for pick/pin.  
5. Manual pass: create/edit/save/reload custom; confirm default recipe shape in Template Library.

---

## 10. Summary

| Today | After redesign |
| --- | --- |
| One flat `SectionBlockRecipeItem[]` mixing paragraphs and “knowledge check” | `RecipeItem` discriminated union: atomic vs embedded |
| Knowledge check = fake atomic block | Embedded Quiz object with source mode + note |
| Media = flat row + parallel `mediaSlots` | Atomic optional media with `MediaSlotConfig`; slots derived for compat |
| One chip row | “Add block” + “Add embedded object” |
| Weak Save validation | Content-bearing, assessment↔check, required source, pin integrity |
| Default CEP with inline check | Heading → Explain → Example → Optional media → **Generated Quiz object** |

**Waiting for your review and “go” before writing implementation code.**
