# @bridge/girkar-template

Standard American 2/1 Game Force as taught in Milind Girkar's **Introduction to
Bridge** deck (88 slides, 2025-08-27), authored as typed knowledge items.

## Why this package exists

The platform's normal path is extraction: upload a source, read its text, let the
extractor propose items. That path is fine for prose and **wrong for this deck**,
because the deck's meaning is in its pictures:

- Bidding tables with five columns (Points | Suit length | Bid | Note | Example).
- **Color as semantics** — orange rows are forcing, green rows are game-forcing,
  red text is a warning ("Undiscussed, DON'T USE THEM!").
- Two-dimensional decision matrices (support × strength on slide 26, opener's
  band × responder's band on slide 31).
- Card-position and four-hand deal diagrams with the recommended line annotated.
- A convention card (slide 74) whose *circled* choices are the agreements.

A text layer keeps the words and throws away every one of those. So this deck was
read slide by slide as images, and each table row was authored by hand into the
knowledge language.

## The provenance rule

**Every item cites the slide it came from.** `src/slides.ts` maps each item key to
its page numbers, and `install.ts` turns those into citations anchored `slide 49`.
The test suite fails if any item is missing from that map.

That rule is the whole point: a reviewer reading an item can open the deck at
that page and check the rule against the picture. An item nobody can trace is an
item nobody can check.

Items install as **drafts** — machine-tested, but no human has approved them.

## Layout

| File | Contents |
|---|---|
| `src/chapters/openings.ts` | The opening table and the shape flowchart (15–17) |
| `src/chapters/ntResponses.ts` | Responses to 1NT and 2NT (18–23) |
| `src/chapters/suitResponses.ts` | Responses to 1M and 1m (24–27) |
| `src/chapters/rebids.ts` | Opener's three rebid tables and the responder matrix (28–31) |
| `src/chapters/competitive.ts` | Overcalls, takeout doubles, Michaels, Drury, Lebensohl, the seven doubles (35–41, 51) |
| `src/chapters/slam.ts` | Fast arrival, Jacoby 2NT continuations, Roman keycards, fourth-suit forcing (47–50) |
| `src/chapters/leadsCarding.ts` | Fourth-best leads, honor meanings, UDCA, odd/even discards (73–78) |
| `src/chapters/prose.ts` | Scoring, evaluation, the Law, declarer play, laws and ethics (4–14, 32–34, 42–46, 52–72, 79–88) |
| `src/chapters/floor.ts` | The phase fallbacks that make the KB playable |
| `src/slides.ts` | itemKey → slide numbers |
| `src/install.ts` | Install into a fresh or existing KB, then one recompile |

The authoring DSL is **reused** from `@bridge/sayc-template/dsl` — there is only
one authoring vocabulary in the repo, not two.

## Where this deck differs from the curated SAYC template

These are the deck's own choices, encoded as written. Each is exposed as a setting
so a fellow can change it per player rather than editing the item.

- **1NT over a major is forcing**, and a new suit at the two level by responder is
  a **game force** (this is 2/1 GF, not standard SAYC).
- **Inverted minor raises**: `2m` is the *strong* raise (9+), `3m` the weak one.
- **Upside-down count and attitude**: low encourages, high discourages; low shows
  an even count. This inverts the platform's default signal item.
- **Odd/even discards**: an odd card encourages; an even card discourages and
  points at another suit.
- **Fourth-best length leads**, per the circled choices on the convention card.
- **Preempts are opened on points (6–11)**, not on playing tricks.
- **Overcalls start at 8 HCP**, which is wide; the range is a setting.

## Tests

```
pnpm vitest run packages/bridge-girkar-template
```

- `girkar.bidding.test.ts` — conformance: hand + auction → the call the deck's
  table says to make, through the real install → compile → decide pipeline. Each
  test names its slide, so a failure reads as "the deck says X here, we bid Y".
- `girkar.system.test.ts` — the KB compiles, the Full set scores 17/17 on the
  completeness checklist, 100 self-play deals finish with zero engine-floor
  events, and every item is traceable to a real slide.
