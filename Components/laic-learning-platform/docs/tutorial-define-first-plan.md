# Tutorial define-first migration plan

**Scope:** Tutorial object pipeline only. Reuse existing screens; rewire data flow; cut over-autonomous AI. **No implementation until approved.**

---

## 1) How the Tutorial pipeline works today

### Order (source-first)

`ObjectCreator` `STEP_META` (all pipeline types, including tutorial):

1. **Sources** → 2. **Mark up** → 3. **Extract** → 4. **Define** → Generate

Relevant wiring in `ObjectCreator.tsx`:

| Step | Component / props | State |
|------|-------------------|--------|
| 1 | `TutorialSource` | `pdfSources` / `textSources` / `webSources` / `ytSources`, `media`, `pathMode` |
| 2 | `S2` → `MarkupWorkspace` | `highlights`, `markupFlags`, `doc` / `markupSources`; `onScanFlags={handleScanFlags}` |
| 3 | `TutorialExtractPanel` | `knowledgeBase`, `shapeIntent`, `markHighlights` |
| 4 | `S4` (`CFG.tutorial`) | `fv` (obj, topic, structure knobs from template, **`aiExtra`**) |

Generate (`generateTutorial`) builds `sectionPlans` from **`knowledgeBase.clusters`** via `buildSectionPlansFromClusters` — **cluster names become section titles**. Template `recipe` is applied *per* section; section *count* comes from clusters (capped by `fv.secs`).

### Where AI invents clusters

`server/index.mjs` → `buildClusteredKnowledgeBase` (called from `POST /api/tutorials/extract-knowledge`):

- Dedupes highlight/extract passages into units.
- **`clusterNameFromText(u.text)`** groups units into named clusters (heuristic titles — e.g. a citation footer becomes “Citation Notice”).
- Caps at 20 clusters; assigns `unit.clusterId`.
- Optional `shapeIntent` filters/shortens units (“Shape with AI”).

UI: `TutorialExtractPanel` **→ Pull & cluster** and the **Shape with AI** input call this path (`runBuild({ refineWithLlm, intent: shapeIntent })`).

### Where free-text scan focus drives Mark up

`MarkupWorkspace.tsx`:

- State: `scanFocus` (required).
- Toolbar: placeholder **“Scan focus (required)…”** + **Scan document**.
- `runScan()` → `onScanFlags(scanFocus)`.

`ObjectCreator.handleScanFlags`:

- Requires non-empty focus; calls `suggestTutorialMarkupFlags(sentences, { instruction: focus, objective: fv.obj, title })`.
- `fv.obj` is usually still empty at Mark up time (Define is last).

Server: `POST /api/tutorials/suggest-markup-flags` → `suggestMarkupFlags(..., { instruction, objective, title })` — groups by freeform scan focus, not by a human section outline.

### Where “add extra info” lives

- Define CFG (`ObjectCreator` `CFG.tutorial` → group **AI generation**): field `aiExtra` — *“Allow AI to add extra information it thinks should be included”*.
- Template knobs: `TutorialKnobDefaults.aiExtra` in `types.ts` / `tutorialTemplates.ts`.
- Prompt: `buildGeneratePrompt` — when `c.aiExtra === true`, uses `groundingExtra` (“AI EXTRAS ALLOWED…”) instead of strict unit-only grounding.

### Template vs “sections” today

- Composite template **`recipe`** = ordered **per-section block types** (e.g. CEP: heading → explanation → worked-example → media → embedded quiz), not a list of named tutorial sections.
- Section **count** / length / progression / checks come from **`knobDefaults`** (`secs`, `words`, `prog`, `dpth`, `end`, `chks`, …), locked when `structureLocked`.
- Emergent **clusters** currently supply the *named* section list at generate time.

### Define today (after recent cuts)

- Intent: Learning objective (`obj`), Overall topic (`topic`) — Audience/Level already removed from UI.
- Structure / Per section / Checks: mostly read-only “set by template” when locked.
- Template picker removed from Define; library default / “Use template” sets `fv.templateId`.
- Still shows full structure field blocks + **AI generation / aiExtra**.

---

## 2) Types to add (`src/lib/types.ts`)

```ts
export interface DefinedSection {
  id: string;
  title: string;
  /** One-line: what this section teaches */
  intent: string;
}

export interface TutorialDefinition {
  objective: string;
  sections: DefinedSection[]; // ordered
}
```

**`sectionId` linkages** (additive, optional for back-compat):

| Shape | Field | Notes |
|-------|--------|--------|
| Highlight / mark (pipeline `highlights[]` items) | `sectionId?: string` | Set on accept (scan or manual popup) |
| `MarkupFlag` | `sectionId?: string` | Scan proposals pre-tagged per section |
| `ContentUnit` | `sectionId?: string` | Copied from highlight; also keep `clusterId` |
| `ConceptCluster` | `sectionId?: string` | For define-first: `cluster.id === sectionId` (or stable map) |

**`CreatorPipelineDraft`:** add `tutorialDefinition?: TutorialDefinition` (React wizard state persisted only via existing object `pipelineDraft` on save — **no new localStorage/sessionStorage**).

**Seeding sections from the template:**  
`N = template.knobDefaults.secs` (fallback 3). Create `N` `DefinedSection`s with placeholder titles (`Section 1`… or “Concept 1” for CEP) and empty/short default intents. The **recipe** stays the per-section *block* shape at generate time; it does **not** become one DefinedSection per recipe item. Author renames / add / remove / reorder rows (add/remove updates the working section list; template `secs` remains the structural default for *new* seeds only).

---

## 3) Stage 0 placement (least disruptive)

**Choice: new first step “Plan” for `typeId === 'tutorial'` only.**

Rail becomes:

**1 Plan → 2 Sources → 3 Mark up → 4 Extract → 5 Define** (then Generate)

- **Plan** = small new panel reusing existing Define field styling (textarea + editable section rows). Not a redesign of Sources/Mark up/Extract/Define visuals.
- Non-tutorial types keep the current 4-step rail untouched.
- Why not top-of-Sources: Plan is a gate (objective + outline) before attaching sources; a panel buried in Sources is easier to skip and harder to gate `canNext`.
- Why not reusing full Define as step 1: Stage 4 still needs a slim Confirm/Define before Generate (title, visibility, template summary). Splitting Plan vs slim Define avoids stuffing two jobs into one reused screen.

Gate: Plan → Sources requires non-empty `objective` and ≥1 section with a non-empty title.

---

## 4) Screen-by-screen: move / rewire / cut / untouched

### Plan (NEW, tutorial only) — Stage 0

| | |
|--|--|
| **Add** | Learning objective (single field). Ordered section list seeded from template `secs` + placeholders; rename / add / remove / reorder; each row title + intent. |
| **Untouched** | Template Library, template `recipe` / knobs (still owned by template). |

### Sources — Stage 1

| | |
|--|--|
| **Untouched** | Entire `TutorialSource` UI (tabs, media, modals, multi-source). |
| **Rewire** | None beyond existing Next gate. Definition already in state. |

### Mark up — Stage 2 (`MarkupWorkspace` reused)

| | |
|--|--|
| **Untouched** | Paginated reader, page nav, Find / Highlight all, Select all, selection popup tags + note, Scan/Highlights rail chrome. |
| **Rewire** | Replace free-text **Scan focus** as the scan *driver*: scan button runs against **defined sections** (pass `tutorialDefinition.sections` + objective into API). Proposals return **grouped by `sectionId`**; accept/reject/adjust unchanged. Manual highlight popup: **section picker** (default = focused section / first section). Highlights store `sectionId`. Rail groups marks **by DefinedSection** (coverage counts). |
| **Cut** | Required free-text scan-focus string as the sole scan target (keep optional “extra note” only if needed; default = section-driven). |
| **API** | Extend `suggestTutorialMarkupFlags` / server to accept `sections: { id, title, intent }[]` and emit flags with `sectionId` + groupLabel = section title. |

### Extract — Stage 3 (`TutorialExtractPanel` reused)

| | |
|--|--|
| **Untouched** | Two-pane layout, unit rows (kind dropdown, from-highlight badge, Merge/Move UI patterns), Pull & cluster button chrome. |
| **Rewire** | Clusters **fixed** = DefinedSections (id/title/order). Pull & cluster **sorts** units by highlight/`sectionId` into those clusters. Unassigned → explicit **Unassigned** holding cluster; Move into a real section only. `clusterOutcome` copy: clusters *are* sections. |
| **Cut (tutorial)** | Emergent `clusterNameFromText` clustering for tutorials. **Shape with AI** box + Extract-from-intent path (**remove** for tutorial — template + Plan already set shape; avoid redundant AI reshaping). |
| **API** | Tutorial extract path: accept `tutorialDefinition`; return clusters = sections + assignment by `sectionId` (no invented names). Keep old path for non-tutorial / legacy if shared endpoint. |

### Define — Stage 4 (`S4` reused, slimmed for tutorial)

| | |
|--|--|
| **Keep** | Title, Visibility, “What will be generated” (wording updated). |
| **Rewire** | Objective + section outline **read-only confirmation** (“set in Plan”) + **Edit** → jump to Plan step. Merge old **Overall topic** into the single objective (drop `topic` from tutorial Define UI; migrate `topic` into objective on old drafts if objective empty). Collapse Structure / Per section / Checks & scoring read-only blocks into **one summary line** (template knobs) + “Edit in Template Library”. |
| **Cut** | `aiExtra` control (remove from CFG; hard-lock Off in generate payload / prompt). Duplicate objective+topic fields. Full screens of locked template fields. |

### Generate — Stage 5 (`server/index.mjs` tutorial branch only)

| | |
|--|--|
| **Rewire** | Payload built from `TutorialDefinition`: for each DefinedSection, title + intent + **approved units for that `sectionId`**. `sectionPlans` keyed by definition order (not emergent clusters). Prompt: write grounded, cited prose per section; follow template recipe (incl. embedded quiz); **no invent sections / reorder / unsourced facts**; empty section → short “no units” note, not invention. |
| **Cut** | All `aiExtra` / “AI EXTRAS ALLOWED” branches for tutorial generate. |

### Explicitly untouched

- Visual design system, shadcn, colors, fonts, spacing.
- Non-tutorial object pipelines, Course Wizard, drill, admin/reviewer/coach/student surfaces (except tutorial student preview if a payload field is required — avoid if possible).
- Sidebar, top bar, login.
- Composite template editor / embedded per-section Quiz machinery (consume as today).
- Sources screen UI; Mark up reader/popup/rail chrome; Extract list/editor chrome (logic only).

---

## 5) New server prompt shape (tutorial)

**Input (conceptual):**

```
objective
sections[]: { id, title, intent, units[]: { kind, text, from, authorNote } }
template: { id, name, recipe, assessmentPlacement, … }
config knobs from template (depth, words, chks, pass, hints) — aiExtra always false
```

**System constraints (hard):**

- Output JSON parts only; one teaching sequence **exactly** matching `sections` order.
- Each section: heading = defined title; body from **that section’s units only**; honor template recipe (composite embedded quiz stays section-scoped).
- Do **not** invent sections, reorder, add topics, or add facts absent from that section’s units.
- If units empty: emit a short rich-text noting missing markup — do not invent content.
- No “AI extras” / bridging beyond units.

**User block:** objective; then for each section: title, intent, recipe line, unit list with cites.

`buildSectionPlansFromClusters` becomes (tutorial): `buildSectionPlansFromDefinition(definition, knowledgeBase, template, media)`.

---

## 6) Backward compatibility

On open / generate when `pipelineDraft.tutorialDefinition` is missing:

1. **objective** ← `fv.obj` or `fv.topic` or object description.
2. **sections** ← if `knowledgeBase.clusters.length`: map each cluster → `{ id: cluster.id, title: cluster.name, intent: '' }`; else seed from template `secs` placeholders.
3. Backfill `sectionId` on units from `clusterId` when present; highlights without `sectionId` stay unassigned until edited.
4. **Do not** rewrite stored drafts on load; only write `tutorialDefinition` when the author edits Plan or saves after using the new flow.
5. Generate: if definition was derived, same strict prompt; legacy `aiExtra: true` in old `fv` ignored (forced Off).

Non-tutorial extract/generate paths unchanged.

---

## 7) Files expected to change (when implementing)

| Area | Files |
|------|--------|
| Types | `src/lib/types.ts` |
| Plan UI + rail (tutorial) | `ObjectCreator.tsx` |
| Mark up wiring | `MarkupWorkspace.tsx`, `ObjectCreator.handleScanFlags`, `src/lib/api.ts` |
| Extract wiring | `TutorialExtractPanel.tsx` (tutorial branch / props), extract API client |
| Define slim | `ObjectCreator` `S4` / `CFG.tutorial` |
| Server | `server/index.mjs` — suggest-markup-flags, extract-knowledge (tutorial), `buildGeneratePrompt` |
| Docs | this plan |

**Out of scope unless you approve:** shared template model changes; other object types; Course Wizard.

---

## 8) Checkpoint

This plan reuses Sources, Mark up, Extract, and Define screens; adds a small Plan step; rewires scan → section-driven, clusters → defined sections, generate → definition spine; cuts aiExtra, Shape with AI (tutorial), and emergent clustering.

**Stopping here for your go-ahead before any implementation.**
