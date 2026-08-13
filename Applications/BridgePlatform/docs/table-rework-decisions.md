# Table rework — decisions (owner, 2026-08-12)

READ THIS BEFORE CHANGING THE PHONE TABLE. Twenty questions were put to the
owner across five rounds and every line below is their answer, not an
inference. Where a choice contradicts an earlier instruction it is flagged.

These were settled in a conversation, so they are not discoverable from the
code — which is why they are written down here. The phone-tier e2e
(`apps/bridge-web/e2e/mobile-table-v3.spec.ts`) asserts several of them
directly; a change that trips those assertions is contradicting a decision,
not merely a test.

KNOWN DIVERGENCE AS OF THIS WRITING: `motion.tsx` implements the played-card
animation as a slide from the seat's direction (`btu-glide-*`, translateY
-150px for North). The owner was shown that option beside the measured flight
and chose the FLIGHT — see "Motion" below. The slide is the cheaper
alternative they turned down, so it wants replacing rather than tuning.

## Scope and order

- **Phone tier first.** Then wide + stacked, then the LP embed (which needs a
  vendor rebuild — the bundle is a COPY, not a link).
- **Visual first, then interaction.** Land trick layout, size, arrow and all
  animation; SHOW THE OWNER; then play modes, pause and settings plumbing.

## Trick area

- **Last played on top.** z-order is play order, so the lead ends up furthest
  back. No lead marker.
- **1.3× the hand card** (~73×104 against the hand's 96-tall card; cluster box
  ~146×208). Band has ~565 units, compass ~192, so this fits.
  - REVERSES an earlier instruction ("the cards in the middle shouldn't be
    larger than the cards in the hands", 2026-08-11). Owner reversed it
    explicitly: "undo the change of making the cards in the trick area the same
    size. they should be a bit larger to be visible."
- Every card's index must stay visible — the reference image is four cards
  overlapping tightly with each top-left corner clear.

## Turn indicator

- **Arrow beside the seat on turn**, pointing at it. Replaces the grey bar.
  One arrow, four possible homes, moves as the turn passes.

## Motion — "snappy", matching the 150/170ms already in motion.tsx

| what | ms |
|---|---|
| card flight | 180 |
| hand closes the gap | 140 |
| trick sweep | 200 |
| arrow moves | 160 |

- **Card flight is a true FLIP** from the tapped card's real position. Must
  unproject the stage's ~0.5 scale transform or the flight lands short.
- **Robot cards fly out of their face-down fan** and flip face-up in transit —
  same mechanism, the fan is already on screen.
- **Trick end: sweep to the winner.** The four cards gather and slide off
  toward the winning seat. Direction IS the answer to "who won".
- Kill the re-render flicker on card play.

## Play modes — ONE setting, three values

    off      tap card ──────────────► plays
    raise    tap → lifts → tap again ► plays
    suit     tap → hand becomes ♣ only → tap plays

- **Suit expand shows LEGAL cards only** (everything visible is playable) and
  **tapping the felt cancels** back to the full hand.
- **Applies to dummy's cards too**, when the human declarer is playing both
  hands. One rule, no exceptions.

## Trick pause — ONE row that cycles

    Tap to continue (default) · 1s · 2s · 3s

- While a finished trick waits: **tap anywhere on the felt clears it, and the
  hand is INERT** — impossible to lead to the next trick before seeing this one.
- **Trick 13 still waits for a tap**, then the board result.
- **A board you are only watching (all robots) runs on the timer**, never
  demanding 13 taps.

## Bidding

- **Confirm bid: BBO's single OK**, plus tapping the staged bid again un-stages
  it. Replaces the current two-button Confirm / Cancel when the toggle is on.

## Hand

- **Suit grouping: add visible seams.** Same order (♠♥♣♦, rank descending),
  same sizes — the suits become blocks instead of one continuous row of 13.

## Settings

- **Client state, saved to the profile** (table-config store). Toggling is
  instant and local — no navigation, no server re-render. This deliberately
  replaces the URL-search-param pattern the current ☰ rows use, because that
  pattern re-renders the page on every toggle and is itself a flicker source.
- **In the LP embed: props, set by the lesson author** in the block's Configure
  panel. No ☰ for the learner — a beginner lesson can REQUIRE the safe mode.

## Defaults for a new player

    play mode      raise to confirm
    confirm bid    on
    suit grouping  on
    trick pause    tap to continue

Safe by default; experienced players turn the rails off.

## Coordination

A second session is live in this repo (dummy takeover: `bridge-sessions`,
`BridgeTable.tsx`, both table pages; two e2e tests red as of 16:50). Phase 1
touches `TrickArea`, `SeatHand`, `PlayTable`, `motion` — no overlap. Revisit
before wiring dummy-hand play modes.
