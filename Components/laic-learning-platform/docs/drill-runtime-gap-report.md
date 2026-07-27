# Drill learner runtime — gap report

**Status:** analysis only — no implementation yet. Awaiting go-ahead.

**Scope:** Drill learner runtime/player + interactive item-format model + Drill blueprint/generation types needed to carry those formats. Do **not** touch other object types, Course Wizard, Tutorial editor, admin/reviewer/coach surfaces, sidebar, top bar, or login (beyond drill runtime consumption already wired in `LearnerReader`).

**Related prior doc:** `docs/drill-logic-gap-report.md` (Define + compile-to-blueprint). That report’s `DrillBlueprint` / upgraded `DrillItem` types were **proposed but not landed** in `src/lib/types.ts`. This report builds on that intent and extends it for **interactive formats**.

---

## 1. How the Drill runtime behaves and is typed today

### 1.1 Where it lives

| Surface | Path |
|---|---|
| Learner / preview player | `DrillView` in `src/app/components/screens/StructuredObjectEditors.tsx` |
| Also mounted from | `LearnerReader.tsx` (`case 'drill'`) and Drill editor **Student preview** |
| Session helpers | `src/lib/drillRuntime.ts` (`orderDrillItems`, `gradeDrillCommit`, `requeueAfterMiss`, `answersMatch`) |
| Types | `DrillItem` / `DrillContent` in `src/lib/types.ts` |
| Seed object | `data.ts` `obj-13` “Level → Tricks” — **published, `blocks: []`** (empty content) |

### 1.2 Important correction vs the brief’s “Reveal answer” description

The brief describes a passive **Reveal answer → hint → Back/Next** card. That was the older player. **As of this write-up, `DrillView` no longer has “Reveal answer.”** A partial commit loop was already introduced:

- Recognition / multi-choice: click a choice → commit
- Recall / Application (no choices): type + **Commit**
- Immediate → grade + show Correct / Not quite + why / correction
- End only → commit first, then **Check answer** reveals explanation text
- Optional streak chip, timed countdown, mastery progress chip, miss re-queue when `repeatUntilMastery`
- Header subtitle pattern (still cosmetic for tiers):  
  `{format} · {difficultyCurve} · Immediate feedback|End-only feedback · Until mastery|One pass · {item.difficulty}`  
  Progress chip: `{mastered}/{total} mastered · {n} in queue` (mastery) or `{seen}/{total}` (one pass)

**What is still missing relative to this brief** (and why the player still feels like a “thin quiz,” not a Wiley-style drill):

| Required principle | Today |
|---|---|
| Physical manipulation formats (drag/place, order, sort, match, multi-step) | **None** — only typed commit or single-select buttons |
| Feedback *in the mechanic* (snap-back / lock-in) | Partial color borders on choices; typed wrong does not clear-for-retry *inside* the control; no snap/lock DnD |
| Per-item interactive format + answer-key payload | Flat `prompt` / `answer` / optional `choices` / `whyCorrect` / `corrections` |
| Tier mastery gate (Level 1 → Level 2) | **None** — Easy→hard only **sorts** items once via `orderDrillItems`; no gate, no “continue to Level 2” prompt |
| Shared flashcard queue **module** | Parallel helper `requeueAfterMiss` in `drillRuntime.ts` — **inspired by** flashcards, **not** extracted from / calling `FlashcardStudy` |
| Full completion summary (retries, time) | Best streak only; no retry count / elapsed time |
| `DrillBlueprint` typed compile artifact | **Not in codebase** (only proposed in prior gap report) |

### 1.3 Types today (`src/lib/types.ts`)

```ts
export interface DrillItem {
  id: string;
  prompt: string;
  answer: string;
  choices?: string[];
  whyCorrect?: string;
  corrections?: Record<string, string>;
  hint?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  skillTag?: string;
}

export interface DrillContent {
  skill: string;
  format: string;                 // free string (Recognition|Recall|Application)
  difficultyCurve: string;        // Flat | Easy → hard
  feedback: string;               // Immediate | End only
  timed?: boolean;
  secondsPerItem?: number;
  repeatUntilMastery?: boolean;
  requeueOffset?: number;
  level?: string;
  items: DrillItem[];
}
```

**Not present:** `DrillBlueprint`, `DrillRuntimeRules`, interactive format discriminant, regions/buckets/pairs/steps payloads, `DrillTier`, `DrillRuntimeState`, `DrillResult`.

### 1.4 Define / generation (context the runtime must consume)

From `object-creator-spec.md` + HTML prototype + `ObjectCreator` CFG — Drill Define:

- Skill · Level · Item format (Recognition / Recall / Application) · Difficulty (Flat / Easy → hard) · Feedback (Immediate / End only) · Timed · Repeat until mastery · Number of items

HTML prototype generates N “Practice item” **text parts** only — **no learner drag/place UI** in `laic-learning-platform.html`. Generation today (`server/index.mjs` `buildDrillPrompt` / `normalizeDrill`) still emits prompt/answer(+choices/why/corrections) — not interactive format payloads.

### 1.5 Quoted current interaction (commit path — not reveal)

Representative behavior from `DrillView`:

- Commit: `applyCommit(raw)` → `gradeDrillCommit(item, raw)` → Immediate `showGrade` or End-only `pendingGrade` + later **Check answer**
- Advance: correct → add to `mastered` Set, shift queue; miss + mastery → `requeueAfterMiss(q, id, requeueOffset)`; else one-pass shift
- UI actions: **Commit** / **Check answer** / **Next** / **Finish** / **Drill again** — **no** Reveal answer

---

## 2. Flashcard queue / mastery module to reuse

### 2.1 Where the pattern lives

There is **no separate shared package** today. The live session queue lives **inline** in:

**`src/app/components/screens/FlashcardStudy.tsx`**

Relevant pieces:

- Per-card stage: `'new' | 'learning' | 'review' | 'mastered'`
- Session queue: `const [queue, setQueue] = useState<number[]>(…)` — front of queue is the current card
- On grade **Again**: remove from front and **append to end of this session’s queue** (`setQueue`: `rest` then `[...rest, cardIdx]`)
- Good/Easy: leave the session queue until a future due date (SM-2 + **localStorage** persistence)

```ts
// FlashcardStudy.applyRating (session queue portion)
setQueue((q) => {
  const rest = q.filter((i) => i !== cardIdx);
  if (grade === 'again') return [...rest, cardIdx];
  return rest;
});
```

### 2.2 What Drill must reuse vs must not

| Reuse | Do **not** reuse for Drill |
|---|---|
| Live queue driven by per-item mastery state | SM-2 ease/interval math |
| Re-enqueue miss into same session | **localStorage** / persisted schedules (`loadPersist` / `patchEngine`) |
| Terminate when nothing unmastered remains in the live queue | Flip → self-rate UI |

### 2.3 Proposed reuse strategy (no parallel invention)

1. Extract the **in-session mastery queue** primitives (ids + stages + miss re-insert + “session done when queue empty of unmastered”) into a small shared module, e.g. **`src/lib/sessionMasteryQueue.ts`**, documenting that it encodes the FlashcardStudy session-queue contract.
2. Implement Drill’s re-queue / mastery gate **only** through that module (replace today’s ad-hoc `requeueAfterMiss` + `Set` in `DrillView`, or make `requeueAfterMiss` a thin wrapper over the shared helper).
3. **Do not** rewrite FlashcardStudy in this pass unless required for the extract (prefer extract + Drill adoption; FlashcardStudy can keep calling the same helpers later). Spaced-repetition **persistence** stays flashcard-only.

**Offset policy:** Flashcards append miss to **end**. Current drill inserts miss ~`requeueOffset` (default 3) slots later. Proposal: shared helper supports `requeueMode: 'end' | 'offset'` with drill defaulting to **`offset: 3`** (matches prior drill gap report) while remaining the same *pattern* (live queue + re-enqueue on miss + empty ⇒ complete).

---

## 3. Proposed interactive item-format model (types)

### 3.1 Location

Extend **`src/lib/types.ts`**. Keep persisted block content as `DrillContent`; add optional `blueprint?: DrillBlueprint` when compile lands. Prefer **additive** fields so legacy JSON still loads.

### 3.2 Discriminated union (new)

Define **cognitive** format (Define tab) separately from **interactive** format (runtime mechanic):

```ts
/** Author Define — unchanged options from object-creator-spec. */
export type DrillCognitiveFormat = 'Recognition' | 'Recall' | 'Application';

/** Learner mechanic — what the player renders. */
export type DrillInteractiveKind =
  | 'label_place'
  | 'order'
  | 'categorize'
  | 'match'
  | 'compute'
  | 'multi_step'
  | 'choice'; // safe default for legacy Recognition / MC

export type DrillItemDifficulty = 'easy' | 'medium' | 'hard';
export type DrillDifficultyMode = 'Flat' | 'Easy → hard';
export type DrillFeedbackTiming = 'Immediate' | 'End only';
```

Per-format payloads + answer keys (discriminated on `kind`):

```ts
export interface DrillRegion {
  id: string;
  label?: string;           // accessible name for the hotspot
  /** Normalized 0–1 box relative to image. */
  x: number; y: number; w: number; h: number;
}

export type DrillInteractivePayload =
  | {
      kind: 'label_place';
      imageUrl: string;           // reuse FlashcardItem.imageUrl / ImageContent.url pattern
      imageAlt?: string;
      regions: DrillRegion[];
      /** Term chips the learner drags. */
      terms: { id: string; text: string }[];
      /** Answer key: termId → regionId */
      mapping: Record<string, string>;
    }
  | {
      kind: 'order';
      steps: { id: string; text: string }[];
      /** Answer key: ordered step ids */
      correctOrder: string[];
    }
  | {
      kind: 'categorize';
      buckets: { id: string; label: string }[];
      items: { id: string; text: string }[];
      /** Answer key: itemId → bucketId */
      assignments: Record<string, string>;
    }
  | {
      kind: 'match';
      left: { id: string; text: string }[];
      right: { id: string; text: string }[];
      /** Answer key: leftId → rightId */
      pairs: Record<string, string>;
    }
  | {
      kind: 'compute';
      prompt: string;
      expected: string;
      /** Absolute numeric tolerance; omit for exact string/number match via normalizeDrillAnswer */
      tolerance?: number;
      unit?: string;
    }
  | {
      kind: 'multi_step';
      steps: {
        id: string;
        prompt: string;
        /** Nested interactive payload limited to compute | choice for v1 */
        interaction: Extract<DrillInteractivePayload, { kind: 'compute' | 'choice' }>;
        whyCorrect?: string;
        corrections?: Record<string, string>;
      }[];
    }
  | {
      kind: 'choice';
      prompt: string;
      choices: { id: string; text: string; correct: boolean; correction?: string }[];
    };
```

### 3.3 Extending `DrillItem` / `DrillContent` without breaking legacy

```ts
export interface DrillItem {
  id: string;
  /** Legacy stem — kept for compat; also used when interactive.prompt omitted. */
  prompt: string;
  /** Legacy canonical answer — kept for compute/choice fallbacks. */
  answer: string;
  choices?: string[];                 // legacy Recognition
  whyCorrect?: string;
  corrections?: Record<string, string>;
  hint?: string;
  difficulty?: DrillItemDifficulty;
  skillTag?: string;
  /** NEW — interactive mechanic + answer key. */
  interactive?: DrillInteractivePayload;
}

export interface DrillRuntimeRules {
  feedbackTiming: DrillFeedbackTiming;
  timed: boolean;
  secondsPerItem?: number;
  repeatUntilMastery: boolean;
  requeueOffset?: number;
}

export interface DrillTier {
  id: string;                         // e.g. 'tier-easy'
  label: string;                      // 'Level 1' / 'Easy'
  difficulty: DrillItemDifficulty | 'mixed';
  itemIds: string[];
}

export interface DrillBlueprint {
  skill: string;
  level: string;
  cognitiveFormat: DrillCognitiveFormat;
  difficultyMode: DrillDifficultyMode;
  itemCount: number;
  items: DrillItem[];
  tiers: DrillTier[];                 // derived from difficulty tags + mode
  runtime: DrillRuntimeRules;
  grounding?: { sourceCount: number; extractCount: number; clusterCount?: number };
}

export interface DrillContent {
  // …existing fields…
  items: DrillItem[];
  blueprint?: DrillBlueprint;
  tiers?: DrillTier[];                // optional persisted snapshot for runtime
}
```

### 3.4 Legacy → safe interactive default (no Reveal)

Normalization (client + `normalizeDrill`):

| Legacy shape | Maps to |
|---|---|
| `choices?.length >= 2` | `interactive: { kind: 'choice', … }` (correct inferred from `answer`) |
| Typed `prompt` + `answer`, no choices | `interactive: { kind: 'compute', prompt, expected: answer }` |
| Missing `interactive` entirely | Same rules as above — **never** revive Reveal |

If an interactive payload is **incomplete** for its kind (e.g. `label_place` without `imageUrl`/regions), runtime shows an **honest error state** for that item (“This item is missing diagram data”) rather than falling back to Reveal.

---

## 4. Proposed renderer components + shared contract

### 4.1 File layout (proposed)

```
src/app/components/screens/drill/
  DrillView.tsx                 # loop / tiers / streak / timer / completion (move out of StructuredObjectEditors)
  DrillItemHost.tsx             # picks renderer by interactive.kind
  formats/
    LabelPlaceItem.tsx
    OrderItem.tsx
    CategorizeItem.tsx
    MatchItem.tsx
    ComputeItem.tsx
    MultiStepItem.tsx
    ChoiceItem.tsx              # Recognition / MC default
  types.ts                      # DrillItemResult, DrillItemRendererProps (or import from lib/types)
```

Keep existing visual language (rounded-2xl cards, `#0B0F1A` primary pills, green/red feedback fills already used in `DrillView`). **No new palette/fonts.** Prefer native **HTML5 drag-and-drop** / pointer events — the app has **no** `@dnd-kit` / sortable library; only file-drop zones exist today. Do not add a DnD dependency unless you approve it on go.

### 4.2 Shared item contract

```ts
export interface DrillItemResult {
  correct: boolean;
  /** Which part failed (regionId, stepId, pair leftId, etc.). */
  wrongParts?: string[];
  /** Learner’s committed payload (for End-only logging / corrections lookup). */
  committed: unknown;
  why?: string;
  correction?: string;          // targeted mistake text when available
}

export interface DrillItemRendererProps {
  item: DrillItem;
  feedbackTiming: DrillFeedbackTiming;
  disabled?: boolean;
  /** Called when the learner has fully committed this item (or a multi-step step). */
  onResult: (result: DrillItemResult) => void;
}
```

Every format renderer must:

1. **Render** the interactive UI from `item.interactive` (or legacy-mapped payload).
2. **Capture** a committed action (drop, order submit, pair, typed enter, etc.).
3. **Evaluate locally** against the item’s answer key.
4. **Emit** `DrillItemResult` — Immediate: parent shows why/correction; End-only: mechanic may still snap/lock visually but withhold explanation copy until Check / end per rules.
5. **Mechanic feedback:** wrong → snap back / mark red / clear for retry; correct → lock green / stay placed.

### 4.3 Per-format behavior (intent)

| Format | Commit | Wrong | Correct |
|---|---|---|---|
| LABEL / PLACE | Drop term on region | Term returns to tray | Term locks on region |
| ORDER | Reorder list + Confirm (or auto-check on drop settle) | Out-of-place item flagged / returns | Order locks |
| CATEGORIZE | Drop into bucket | Returns to tray | Stays in bucket |
| MATCH | Connect / drop pair | Clears connection | Pair locks |
| COMPUTE | Enter + Commit | Mark red, clear input for retry | Lock input, green |
| MULTI-STEP | Each step via nested compute/choice | Block next step until corrected | Reveal next step; finish when all locked |
| CHOICE (default) | Select option | Red mark + correction | Green lock |

---

## 5. Proposed runtime loop (state machine)

### 5.1 States

```
idle_item → committing → reacting → (await_next | requeue) → …
            ↘ tier_complete_gate → next_tier → idle_item
            ↘ session_complete
```

React state (names illustrative): `DrillRuntimeState` with:

- `tiers`, `tierIndex`
- `queue` (item ids **in current tier only**, or global with tier filter — prefer **current-tier queue**)
- `itemState: Record<id, 'unseen' | 'learning' | 'mastered'>` via shared session queue module
- `streak`, `bestStreak`, `retries`, `startedAt`, `secondsLeft`
- `phase: 'item' | 'tier_gate' | 'complete'`
- `lastResult`, `explanationVisible` (Immediate vs End-only)

### 5.2 Loop rules

1. **COMMIT** — no Reveal; only format `onResult`.
2. **REACT** — Immediate: show why + targeted correction; mechanic already snapped/locked. End-only: record correctness; delay explanation until Check or session end; mechanic snap/lock still allowed.
3. **RE-QUEUE** — if incorrect and `repeatUntilMastery` (or always when mastery gate is on — see open Q): shared queue re-inserts id; streak resets.
4. **TIER GATE** — group items by `difficulty` into Level 1/2/3 when `difficultyCurve === 'Easy → hard'`; Flat → single tier. Learner cannot see next tier’s items until every id in current tier is `mastered`. On tier clear → interstitial: “Level N complete — Continue to Level N+1”.
5. **RAMP / MOMENTUM** — existing streak chip + mastery progress; timer only if `timed`; tier label in header instead of cosmetic-only Easy→hard.
6. **COMPLETE** — all tiers mastered (or one-pass / End-only timed run exhausted per rules). Summary: mastered count, retries, best streak, elapsed if timed — match flashcard/session summary density, same styling.

### 5.3 Mapping Define flags

| Define | Runtime effect |
|---|---|
| Feedback Immediate | Explanations on each result |
| Feedback End only | Score/mechanic now; explanations at Check / end |
| Timed | Per-item countdown (`secondsPerItem`, default 20); timeout = incorrect commit |
| Repeat until mastery | Misses re-queue; cannot complete until all mastered |
| Easy → hard | Build tiers + gate |
| Flat | One tier; still mastery-complete to finish when mastery on |

---

## 6. Proposed generation-request change

### 6.1 Goal

Generator chooses **`interactive.kind` per item** from skill + extract material, while Define’s cognitive **Item format** (Recognition / Recall / Application) remains the author bias.

### 6.2 Selection heuristics (prompt + validator)

| Source signal | Prefer kind |
|---|---|
| Diagram / image + labelable parts in extracts or attached media | `label_place` |
| Procedure / ordered steps (Extract kind Procedure) | `order` |
| Taxonomy / “belongs to” / classify | `categorize` |
| Term ↔ definition glossary | `match` |
| Quantitative / compute skill (numbers, scores, tricks) | `compute` |
| Multi-part worked procedure | `multi_step` |
| Recognition / MC bias or insufficient structure | `choice` |

### 6.3 API boundary

Keep `generateStructuredObject('drill', …)` / `POST /api/drills/generate`. Extend `buildDrillPrompt` shape to require `items[].interactive` discriminant + answer keys + `whyCorrect` / corrections. Extend `normalizeDrill` to:

- Validate per-kind required fields
- Map legacy items to `compute` / `choice`
- Build `tiers` from difficulty tags + difficulty mode
- **Honest error** if generation fails or items cannot be normalized — no silent Reveal demo content

Compile payload addition (alongside prior gap report’s `compile` object):

```ts
compile: {
  // …prior fields…
  allowInteractiveKinds: DrillInteractiveKind[];
  preferKindFromExtracts: true;
}
```

---

## 7. Gaps summary (current → required)

| Area | Current | Required |
|---|---|---|
| Commit model | Typed / choice commit (partial) | Full interactive formats with mechanic snap/lock |
| Reveal | Removed | Stay removed |
| Queue | Parallel `requeueAfterMiss` | Shared session mastery queue from FlashcardStudy pattern |
| Tiers | Sort only | Level gate + Continue prompt |
| Types | Flat DrillItem | Discriminated `interactive` + blueprint/tiers/runtime state |
| Generation | Soft prompt/answer dump | Per-item interactive kind from source |
| DnD affordances | File drops only | Native DnD renderers in existing visual language |
| Seed `obj-13` | Empty blocks | Runtime empty/error state until content exists |

---

## 8. Files likely touched on “go”

| File | Change |
|---|---|
| `src/lib/types.ts` | Interactive union, tiers, runtime/result types; extend DrillItem/Content |
| `src/lib/sessionMasteryQueue.ts` | **New** — extract flashcard session-queue pattern |
| `src/lib/drillRuntime.ts` | Grade/evaluate per interactive kind; tier builder; legacy map |
| `src/app/components/screens/drill/*` | **New** renderers + host loop |
| `StructuredObjectEditors.tsx` | Re-export / thin wrapper → new `DrillView` |
| `LearnerReader.tsx` | Import path only if needed |
| `server/index.mjs` | Prompt + `normalizeDrill` for interactive kinds |
| `src/lib/api.ts` | Typed compile fields if needed |

**Out of scope unless you say otherwise:** FlashcardStudy full refactor, Define UI redesign, other object types, Course Wizard, admin, login.

---

## 9. Open questions for go-ahead

1. **Mastery always on for drills?** Brief’s Level gate implies misses always return until mastered. Define still has `Repeat until mastery` Off by default — keep the flag, or force mastery (and treat the flag as author intent for timed one-pass tests only)?
2. **DnD dependency:** Native HTML5 only (default proposal), or approve adding `@dnd-kit` for smoother mobile drag?
3. **LABEL/PLACE without image in source:** Skip generating that kind, or allow author-uploaded diagram in editor (touches Define/editor slightly)?
4. **Extract FlashcardStudy now** vs drill-only shared module that mirrors its queue API (FlashcardStudy unchanged this pass)?
5. **Prior Define gap report:** implement interactive generation in the same pass as runtime, or runtime + legacy map first and generation in a follow-up?

---

## 10. Decisions (go) + next steps

**Decided on go:** mastery respects Define toggle; `@dnd-kit` for DnD formats; label_place without image falls back to categorize/match (logged); extract FlashcardStudy session queue into `sessionMasteryQueue`; generation deferred.

**Next task (generation — not this pass):** Update `/api/drills/generate` so the generator consumes the landed `DrillBlueprint` / `DrillInteractivePayload` discriminated union, chooses an interactive kind per item from source material, and **only picks `label_place` when the source provides a diagram/image with definable regions**.

---

**STOP.** No implementation until you review this report and say **go**.
