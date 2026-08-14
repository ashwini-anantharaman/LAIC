# Table rework — decisions (owner, 2026-08-12)

READ THIS BEFORE CHANGING THE PHONE TABLE. Twenty questions were put to the
owner across five rounds and every line below is their answer, not an
inference. Where a choice contradicts an earlier instruction it is flagged.

These were settled in a conversation, so they are not discoverable from the
code — which is why they are written down here. The phone-tier e2e
(`apps/bridge-web/e2e/mobile-table-v3.spec.ts`) asserts several of them
directly; a change that trips those assertions is contradicting a decision,
not merely a test.

NO DIVERGENCE. An earlier revision of this file said `motion.tsx`'s glide
(`btu-glide-*`) contradicted the owner's choice and "wants replacing". IT DOES
NOT — the owner reversed that decision the same day, on seeing it: "yes i want
the glide my fault for telling you otherwise" (2026-08-12). The glide IS the
design. Do not replace it with a measured flight.

## Scope and order

- **Phone tier first.** Then wide + stacked, then the LP embed (which needs a
  vendor rebuild — the bundle is a COPY, not a link).
- **Visual first, then interaction.** Land trick layout, size, arrow and all
  animation; SHOW THE OWNER; then play modes, pause and settings plumbing.

## Trick area

- **Last played on top.** z-order is play order, so the lead ends up furthest
  back. No lead marker.
- **1.3× the hand card** — on HEIGHT. Shipped: card **89×125** against the
  hand's 56×96, cluster box **191×250**. Band has ~565 units, so this fits.
  - The width is NOT the hand's width scaled. A hand card is a tall 1:1.71
    sliver because it is only ever seen as an index strip under its neighbour;
    a trick card is seen whole and takes a real card's 1:1.4. Scaling the
    hand's ratio gives ~73×104 — the first attempt, in which a two-glyph "10"
    spanned nearly the full width and spilled out of the corner the layout
    promises to keep clear. Do not "restore" those numbers.
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

- **The played card GLIDES in from its seat's direction** (`btu-glide-N/S/E/W`
  in `motion.tsx`) — owner, 2026-08-12, SUPERSEDING the measured-FLIP-flight
  answer given earlier the same day. The flight was chosen from a description
  and the glide from the running table, so this later answer is the informed
  one. A true FLIP is not to be built.
  - The row below prices the card at 180ms because it was written for the
    flight; the glide ships at 300ms and has not been re-timed. Ask before
    changing it — the owner has seen and approved it AT 300ms.
- Robot cards glide from their seat's direction like any other. (The earlier
  "fly out of their face-down fan" answer belonged to the flight, which is
  gone; nothing in the glide needs the fan.)
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
