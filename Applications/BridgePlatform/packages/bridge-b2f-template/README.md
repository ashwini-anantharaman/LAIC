# @bridge/b2f-template

The "Bridge 2 Fun Training" notes (32 pages) as typed knowledge items.

## Why this is a separate knowledge base

Both this and `@bridge/girkar-template` are Standard American 2/1 Game Force, so
the obvious move would be to merge them. Don't. They disagree on numbers a player
has to bid by, and a merged KB would produce rules that contradict each other:

| | girkar deck | these notes |
|---|---|---|
| Opener's bands | 12-14 / 15-17 / 18-21 | **12-15 / 16-19 / 20-21** |
| 1NT with a five-card major | denied (slides 18, 19) | **opened** — page 10 says "even with 5M" |
| Texas transfers | none | **4♦→♥, 4♥→♠** |
| Minor-suit transfer | 2♠→3♣, 3♣→3♦ | **2♠→3♣, 2NT→3♦** |
| Inverted minor raise (2m) | 9+ | **10+** |
| Signals | upside-down count and attitude | **standard** — high-low from a doubleton |
| Discards | odd/even | first discard is attitude |
| Gerber | none | **4♣ over 1NT/2NT** |
| Under interference | Lebensohl, support doubles | **limit raise, Jacoby 2NT, inverted minors and forcing 1NT all OFF; cuebid instead** |

That last row is the most distinctive thing in the document and has no
counterpart in the other template at all.

## The provenance rule

**Every item cites the page it was authored from.** `src/pages.ts` maps each item
key to its page numbers and `install.ts` turns those into citations anchored
`page 16`. The test suite fails if any item is missing from that map.

Items install as **drafts** — machine-tested, but no human has approved them.

## The deal review is checked, not trusted

Pages 18-24 review fifteen real deals with full four-hand diagrams. Reading hand
diagrams off a page is the least reliable step in authoring a KB like this, and
the mistakes are silent: a dropped card or an invented one produces a layout that
reads perfectly well.

So `src/deals.json` is validated by `src/b2f.deals.test.ts` on every test run:

1. **structural** — 52 distinct cards, 13 per seat, 13 per suit, legal ranks;
2. **external checksum** — the HCP derived from the transcribed cards must equal
   the HCP *printed beside that seat on the page*. This is the strong check,
   because the page's numbers are evidence nobody here generated;
3. the printed HCP sums to 40.

Check 2 earned its place immediately: it caught two errors in deal 5 on the first
pass — a diamond dropped from West and a ♦9 invented in East.

The deals are authored as `concept` items only. A rule that fires on one specific
hand is overfitting, so none of them produces a call.

## Layout

| File | Contents |
|---|---|
| `src/chapters/openings.ts` | The opening list and the sacrifice/preempt discipline (1, 3, 5, 10) |
| `src/chapters/ntResponses.ts` | Responses to 1NT, 2NT and 2♣, including Texas and the minor transfer (1-2, 10-11, 16) |
| `src/chapters/suitResponses.ts` | Responses to 1M and 1m, the six 2/1 sequences, the ranked bid logic (1, 3, 4, 10) |
| `src/chapters/rebids.ts` | Opener's rebids band by band, and the forcing-1NT rebids (11-14, 4, 31) |
| `src/chapters/competitive.ts` | Takeout doubles, overcalls, the interference system, Michaels, redouble (4-5, 15, 25, 26) |
| `src/chapters/conventions.ts` | Roman keycards, Gerber, splinters, and the conventions reference (16-17) |
| `src/chapters/play.ts` | Declarer play and the eleven-position suit-combination table (6-9, 30) |
| `src/chapters/carding.ts` | Standard signals, leads, second and third hand (28-29) |
| `src/chapters/deals.ts` | The December 2025 deal review, fifteen worked boards (18-24) |
| `src/chapters/floor.ts` | The phase fallbacks that make the KB playable |
| `src/deals.json` | The validated four-hand layouts |
| `src/pages.ts` | itemKey → page numbers |

The authoring DSL is **reused** from `@bridge/sayc-template/dsl` — there is one
authoring vocabulary in this repo, not three.

## Where the notes contradict themselves

Three places. Each is encoded with the reading that has more pages behind it, the
conflict is named in the item's own text with both page numbers, and a setting
exposes the other reading.

1. **Minor-suit transfer.** Pages 2 and 10 say 2♠→3♣ and 2NT→3♦. Page 16's table
   says 2♠→♣ and 3♣→♦. Encoded per pages 2 and 10.
2. **Opener's bands.** Page 3's prose says 16-18 / 19-21; pages 11, 14 and 31 all
   say 16-19 / 20-21. Encoded per the majority.
3. **1NT range.** The 1NT *opening* is 15-17 (page 10, confirmed by page 23's
   deal-28 remark). Page 4 and page 21 both describe a 1NT *overcall* as 15-18 —
   a different bid, so both stand.

## Tests

```
pnpm vitest run packages/bridge-b2f-template
```

- `b2f.bidding.test.ts` — conformance, weighted toward the rows where this system
  differs from its sibling, since that is where a rule copied from the wrong
  template would slip through.
- `b2f.system.test.ts` — the KB compiles, the Full set scores 17/17, 100 self-play
  deals finish with zero engine-floor events, every item traces to a real page.
- `b2f.deals.test.ts` — the deal validation described above.
