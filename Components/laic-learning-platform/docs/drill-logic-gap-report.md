# Drill Define logic — gap report

**Status:** analysis only — no implementation yet. Awaiting go-ahead.

**Scope:** Drill object Define tab + generation/blueprint path + related types only.

---

## 1. How Drill Define and generation behave today

### 1.1 Define fields (authoritative + code)

From `object-creator-spec.md` and `CFG.drill` in `ObjectCreator.tsx`:

| Group | Field id | Label | Control | Spec / code default |
|---|---|---|---|---|
| Intent | `skill` | Skill to drill | text | *(empty)* — “the one narrow skill this reinforces” |
| Intent | `lvl` | Level | pick | **Basic** — Intro / Basic / Intermediate / Advanced |
| Practice design | `fmt` | Item format | pick | Spec lists Recognition · **Recall** · Application; code default **`Recall`** |
| Practice design | `diff` | Difficulty | pick | **Easy → hard** (also Flat) |
| Practice design | `fb` | Feedback | pick | **Immediate** (also End only) |
| Practice design | `timed` | Timed | bool | **Off** |
| Practice design | `rep` | Repeat until mastery | bool | **Off** |
| Practice design | `ni` | Number of items | num 5–30 | **15** |

Shared Define chrome (all types): Title, Visibility when created, **What will be generated** summary card, primary **✦ Generate drill**.

Builtin templates (`objectTemplates.ts`):

- **Recall ramp** — `fmt: Recall`, Easy→hard, Immediate, `rep: false`, `ni: 15`
- **Timed mastery** — `fmt: Recognition`, Flat, Immediate, `timed: true`, `rep: true`, `ni: 20`

### 1.2 Types today (`src/lib/types.ts`)

```ts
export interface DrillItem {
  id: string;
  prompt: string;
  answer: string;
  choices?: string[];
  hint?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface DrillContent {
  skill: string;
  format: string;              // free string, not a union
  difficultyCurve: string;
  feedback: string;
  timed?: boolean;
  repeatUntilMastery?: boolean;
  level?: string;
  items: DrillItem[];
}
```

**Missing relative to the brief:** skill tag per item, “why correct,” per-distractor / per-error corrections, compile-time blueprint distinct from content, typed format/difficulty/feedback enums, runtime rules object, mastery/queue state.

Reusable neighbors (do **not** invent parallel shapes):

- `QuestionContent` — `question`, `options`, `correct` / `correctIndices`, `explanation`, `hint` / `hints`, `difficulty`
- Quiz builder (course-wizard-spec) — stem + options + **per-option feedback** + mark-correct
- Flashcard study (`FlashcardStudy.tsx`) — **in-session due queue**: miss → re-append / re-due; session ends when nothing remains unmastered in the live queue (SM-2 schedules; Again ≈ same-session re-queue)

### 1.3 Generation path today

1. Define → `structuredConfig()` builds:

```ts
{ skill, lvl, fmt, diff, fb, timed, rep, ni }
```

2. `generateStructuredObject('drill', { title, config, extracts, prompt, knowledgeBase, shapeIntent })` → `POST /api/drills/generate` (`src/lib/api.ts`).

3. Server `buildDrillPrompt` (`server/index.mjs`):

   - Asks for JSON with `items[{ id, prompt, answer, choices?, hint?, difficulty? }]`
   - Mentions skill, format, difficulty curve, feedback, timed, rep, count
   - Grounds via `groundingFromExtracts` / extract lines (optional; can proceed with “No marked-up units…”)
   - **Does not** require: single-skill validation, application framing, why-correct, wrong-option corrections, Easy→hard **ordering**, or reject/regenerate loop

4. `normalizeDrill`:

   - Keeps prompt/answer; optional choices for Recognition (synthesizes distractors from *other items’ answers* if missing)
   - Slices to `ni`
   - Copies `timed` / `repeatUntilMastery` onto content
   - **Does not** sort by difficulty, validate skill focus, or attach explanations/corrections

5. Editor (`DrillEditor`): edits skill + prompt/answer only. Preview (`DrillView`): linear index `0…n-1`; Immediate reveals answer string; **no** why/corrections; **`repeatUntilMastery` is ignored** (no re-queue); End-only only delays reveal until Check; Timed unused.

### 1.4 “What will be generated” today

Generic structured-object summary in `DefineStep`:

> Drawing on N source(s) · M extract(s) · …chips from **num** fields only…

For drill, the only numeric chip is typically **“15 number of items”**. It does **not** name skill, format, Easy→hard, feedback, mastery, or source-unit grounding.

### 1.5 Seed / prototype

- `data.ts` `obj-13` “Level → Tricks” — published drill with **empty `blocks`**.
- HTML prototype treats drill Define as N “Practice item” text parts — not a typed blueprint.

---

## 2. Gaps vs required drill logic

### CLEAR FOCUS
| Required | Today |
|---|---|
| Skill is retrieval/generation anchor; every item an instance of that skill | Prompt mentions skill once; no per-item skill tag; no reject/regenerate |
| Gentle warning if skill text implies multiple skills | None |
| Level changes complexity of instances, not which skill | Passed through as string only; not enforced in item generation |

### ACTIVE FEEDBACK
| Required | Today |
|---|---|
| Immediate strong default + helper text why | Immediate is default; **no** helper explaining tight-loop / when End only is appropriate |
| Correct answer + short “why” + targeted correction per wrong option / common error | Only `answer` (+ optional `hint`); Recognition distractors are other answers, not diagnosed errors |
| Repeat until mastery → miss re-enters queue; complete only when all mastered | Flag stored on content; **DrillView never re-queues** |

### DIRECT APPLICATION
| Required | Today |
|---|---|
| Default bias toward **Application** | Default **Recall** (and Recall ramp template) |
| Frame Recognition/Recall as applying the skill | Prompt says format name only |
| Ground in source procedures/facts; no free-write from general knowledge | Extracts preferred but optional; no answerability validation |

### SEQUENCING & VOLUME
| Required | Today |
|---|---|
| Flat vs Easy→hard **distribution + ascending order** | Curve string stored; items not ordered by `difficulty` |
| Timed attaches time expectation; pairs with End-only | Boolean only; no per-item/drill seconds; no UI coupling |

### COMPILE-TO-BLUEPRINT
| Required | Today |
|---|---|
| Compile settings → typed blueprint + runtime rules before/with generation | Flat `DrillContent` dump from LLM |
| Validate each item; regenerate failures | Soft normalize; drop empty prompt/answer only |
| Live summary reflecting compiled intent | Generic source/extract chip line |

### ENGINEERING CONSTRAINTS (for implementation phase)
- Types in `src/lib/types.ts`; reuse question/answer/feedback + flashcard **queue pattern** (session state in React — **no new localStorage** for drill mastery).
- Generation behind `src/lib/api.ts` / existing stream; **honest error**, no silent demo fallback.
- Drill Define + drill generate/blueprint (+ minimal runtime so mastery rules are real) only — stop and ask before other surfaces.

---

## 3. Proposed TypeScript types (`src/lib/types.ts`)

### New (drill-specific)

```ts
export type DrillItemFormat = 'Recognition' | 'Recall' | 'Application';
export type DrillDifficultyMode = 'Flat' | 'Easy → hard';
export type DrillFeedbackTiming = 'Immediate' | 'End only';
export type DrillItemDifficulty = 'easy' | 'medium' | 'hard';

/** Runtime rules compiled from Define — drive learner session, not just labels. */
export interface DrillRuntimeRules {
  feedbackTiming: DrillFeedbackTiming;
  timed: boolean;
  /** Seconds per item when timed; omit when untimed. */
  secondsPerItem?: number;
  repeatUntilMastery: boolean;
  /** How many items later to re-insert a miss (default ~2–3). */
  requeueOffset?: number;
}

export interface DrillItemChoice {
  id: string;
  text: string;
  correct: boolean;
  /** Targeted correction when this wrong option is chosen. */
  correction?: string;
}

export interface DrillItem {
  id: string;
  /** Always the Define skill (single shared tag). */
  skillTag: string;
  format: DrillItemFormat;
  difficulty: DrillItemDifficulty;
  stem: string;                 // was prompt
  /** Canonical correct response (Recall/Application) or correct choice text. */
  correctAnswer: string;
  whyCorrect: string;
  choices?: DrillItemChoice[];  // Recognition (and optional Application MC)
  hint?: string;
  /** Source extract / unit ids used to ground this item. */
  sourceUnitIds?: string[];
}

export interface DrillBlueprint {
  skill: string;
  level: string;
  format: DrillItemFormat;
  difficultyMode: DrillDifficultyMode;
  itemCount: number;
  items: DrillItem[];           // ordered for presentation
  runtime: DrillRuntimeRules;
  /** Snapshot used for the Define summary + provenance. */
  grounding: {
    sourceCount: number;
    extractCount: number;
    clusterCount?: number;
  };
  multiSkillWarning?: string;   // author-facing, from skill-text check
}

/** Persisted block content = blueprint fields flattened for editor/runtime. */
export interface DrillContent {
  skill: string;
  level?: string;
  format: DrillItemFormat | string; // migrate toward union
  difficultyCurve: DrillDifficultyMode | string;
  feedback: DrillFeedbackTiming | string;
  timed?: boolean;
  repeatUntilMastery?: boolean;
  secondsPerItem?: number;
  requeueOffset?: number;
  items: DrillItem[];           // upgraded shape (compat: map prompt→stem)
  blueprint?: DrillBlueprint;   // optional explicit compile artifact
}
```

### Reuse (do not duplicate)

| Need | Reuse |
|---|---|
| Stem / options / explanation patterns | Align field names conceptually with `QuestionContent` (`explanation` ↔ `whyCorrect`; options ↔ `DrillItemChoice`) |
| Per-option feedback | Same idea as Quiz Builder “per-option feedback” (course-wizard-spec) |
| Mastery queue | **Pattern** from `FlashcardStudy`: live queue array + per-item state (`new` / `learning` / `mastered`); on miss, splice item back `requeueOffset` slots later; terminate when queue empty of unmastered — **React state only**, not flashcard localStorage schedules |

### Compat migration

- Accept legacy `prompt` → `stem` in normalize.
- If `choices: string[]`, wrap to `DrillItemChoice[]` with `correct` inferred from `answer`.

---

## 4. Compile-to-blueprint flow (proposed)

### 4.1 Client (Define → Generate)

1. **Preflight skill text**
   - Trim; require non-empty skill (block generate with visible error).
   - Heuristic multi-skill check (conjunctions / “and” / slash lists / multiple verb phrases) → set `multiSkillWarning` and show amber banner: suggest splitting into separate drills; still allow generate.
2. **Compile intent object** (typed config for API + summary):

```ts
{
  skill, level, format, difficultyMode, feedbackTiming,
  timed, repeatUntilMastery, itemCount,
  secondsPerItem: timed ? (default 20 or level-based) : undefined,
  requeueOffset: repeatUntilMastery ? 3 : undefined,
  grounding: { sourceCount, extractCount, clusterCount }
}
```

3. **Default nudges (UI only, non-breaking)**
   - Change default `fmt` → **Application** (update CFG + preferred builtin; keep Recognition/Recall available).
   - Helper under Feedback: Immediate = tight loop; End only for timed/test-like runs.
   - When `timed` turns on, soft-suggest End only (do not force).
4. Call existing `generateStructuredObject('drill', …)` with enriched payload (below). Surface stream errors honestly.
5. On `result`: run **client validate** (same rules as server); if failures, show count + keep partial only if server already filtered — prefer fail closed with regenerate request when API supports it.
6. Persist as `DrillContent` (+ optional `blueprint`) into editor.

### 4.2 Server (`/api/drills/generate`)

1. **Retrieve / attach grounding** — require extracts or knowledgeBase clusters when available; if none, return **error** (or explicit `code: 'no_grounding'`) rather than free-writing from general knowledge when Sources were expected. (Prompt-only path: allow only when `srcMode === 'prompt'` and document that in the error/UX.)
2. **Generate N items** with prompt constraints: one skill; format framing; difficulty tags; why + corrections; source-grounded.
3. **Validate each item** (reject → regenerate up to K times per slot or batch fill):
   - Non-empty stem, correctAnswer, whyCorrect
   - `skillTag ===` normalized Define skill
   - Difficulty in `{easy,medium,hard}`; for Flat, all in one band; for Easy→hard, mix then **sort ascending**
   - Recognition: ≥3 choices, exactly one correct, every incorrect has `correction`
   - Recall/Application: answer unambiguous; optional choices follow same correction rules if present
   - Answerability: answer/stem must be supportable from provided extract text (overlap / cite `sourceUnitIds`)
4. **Order** per Difficulty mode.
5. **Emit** blueprint JSON including `runtime` rules.

### 4.3 Learner runtime (`DrillView`) — minimal change in scope

So “repeat until mastery” is not a dead flag:

- Build initial queue = ordered item ids.
- On correct → mark mastered, advance.
- On miss (Immediate) → show why + correction; if `repeatUntilMastery`, re-insert id at `idx + requeueOffset` (or end); else advance once.
- Complete when queue exhausted of unmastered items.
- Timed: countdown using `secondsPerItem` (optional phase 1: show timer UI only).

*(If runtime change is considered out of “Define + generation” only, flag in go-ahead — without it mastery cannot be demonstrated.)*

---

## 5. Proposed “What will be generated” copy

Template (live, updates as fields change):

> **{N} {format} items on “{skill}”, {difficultyMode}, {feedbackTiming} feedback{timed?`, timed (~{secondsPerItem}s/item)`:``}{rep?`, repeat until mastery`:``}, grounded in {extractCount} source unit{s}{clusterCount?` · ${clusterCount} clusters`:``}{sourceCount?` · ${sourceCount} sources`:``}.**

Examples:

- `15 application items on “compute tricks needed from contract level”, Easy → hard, immediate feedback, repeat until mastery, grounded in 8 source units · 2 clusters · 1 source.`
- `12 recognition items on “identify trump suit from auction”, Flat, end-only feedback, timed (~20s/item), grounded in 5 source units.`

If multi-skill warning: append  
`Warning: skill text may describe more than one skill — consider separate drills.`

If no extracts / clusters yet:  
`… Not yet grounded — finish Extract (or add sources) so items can be application instances of the skill.`

---

## 6. Proposed generation request payload

Extend the existing structured generate body (still `generateStructuredObject`):

```ts
{
  title: string;
  config: {
    skill: string;
    lvl: string;                    // Level
    fmt: DrillItemFormat;           // default Application
    diff: DrillDifficultyMode;
    fb: DrillFeedbackTiming;
    timed: boolean;
    rep: boolean;                   // repeatUntilMastery
    ni: number;
    secondsPerItem?: number;
    requeueOffset?: number;
    /** Author-facing; echoed into blueprint */
    multiSkillWarning?: string | null;
  };
  extracts: { kind: string; text: string; from?: string; id?: string }[];
  knowledgeBase?: ClusteredKnowledgeBase | null;
  shapeIntent?: string;
  prompt?: string;                  // prompt-only authoring mode
  /** Compile hints for the model / validator */
  compile: {
    requireGrounding: boolean;
    requireWhyCorrect: boolean;
    requireWrongCorrections: boolean;
    singleSkillTag: string;
    order: 'flat' | 'easy_to_hard';
  };
}
```

**Response `content`:** `DrillContent` (upgraded) or `{ blueprint: DrillBlueprint }` normalized into `DrillContent` by `normalizeDrill`.

Stream events unchanged: `progress` | `result` | `error` | `done`.

---

## 7. Files likely touched on “go” (preview)

| File | Change |
|---|---|
| `src/lib/types.ts` | New drill blueprint / item / runtime types; evolve `DrillItem` / `DrillContent` |
| `src/app/components/screens/ObjectCreator.tsx` | CFG defaults/helpers; drill-specific summary; skill warning; richer `structuredConfig` / compile |
| `src/lib/api.ts` | Typed drill config/payload if needed (path stays `/api/drills/generate`) |
| `server/index.mjs` | `buildDrillPrompt`, `normalizeDrill`, validate/order/regenerate |
| `src/app/components/screens/StructuredObjectEditors.tsx` | `DrillView` queue for mastery; show why/corrections; optional timer |
| `src/lib/objectTemplates.ts` | Prefer Application default on recommended template |

**Out of scope unless you say otherwise:** Quiz, flashcard persistence, Course Wizard, tutorial editor, admin, sidebar/login, other object types.

---

## 8. Open questions for go-ahead

1. **Default format:** Confirm switch from Recall → **Application** (spec bias vs current CFG/template).
2. **Ungrounded generate:** Hard-fail without extracts, or allow prompt-only with explicit banner?
3. **Runtime in this pass:** Implement mastery re-queue in `DrillView` now, or Define/generate-only first?
4. **Timed duration:** Fixed 20s/item, or derive from Level?

---

**STOP.** No implementation until you review this report and say **go**.
