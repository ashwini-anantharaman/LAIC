"use client";

// Table motion — the ONE stylesheet the animated leaves share.
//
// Everything else in this family styles itself inline, and inline styles cannot
// carry a @keyframes rule or a `prefers-reduced-motion` query. Both are needed:
// selecting a card used to SNAP (the lift landed instantly and the played card
// appeared in the trick with no transition at all), and a reader who has asked
// their OS for less motion must get none of it.
//
// React 19 dedupes a <style href precedence> and hoists it to <head>, so every
// leaf can render <TableMotion/> unconditionally and the document still ends up
// with exactly one copy.
//
// A played card GLIDES IN FROM ITS HAND (owner, 2026-08-12): the travel vector
// is the seat's direction reversed — North's card arrives from above, East's
// from the right — so the eye reads "that card left that hand" rather than
// "a card appeared". One keyframe set per seat because the vector is the only
// thing that differs; the travel is longer than the trick box on purpose, so
// the card visibly starts OUTSIDE the trick, where the hand is.
//
// TIMINGS WERE SLOWED (owner, 2026-08-13) from 300/150 to 440/240. The first
// set was chosen as "snappy" from a description; watching real boards, the
// motion read as a flicker rather than a move. Slower is not sloppier here —
// the point of the animation is that the eye can FOLLOW the card, and at 300ms
// it could only notice that something had happened.
//
// `btu-fly` is the same 440ms travel for a card whose start position was
// MEASURED — see TrickArea's origin FLIP. The seat-direction keyframes remain
// for every card whose origin cannot be known (a robot's face-down fan).

const CSS = `
@keyframes btu-glide-N { from { opacity: .25; transform: translateY(-150px) scale(.95); } to { opacity: 1; transform: none; } }
@keyframes btu-glide-S { from { opacity: .25; transform: translateY(150px) scale(.95); } to { opacity: 1; transform: none; } }
@keyframes btu-glide-W { from { opacity: .25; transform: translateX(-170px) scale(.95); } to { opacity: 1; transform: none; } }
@keyframes btu-glide-E { from { opacity: .25; transform: translateX(170px) scale(.95); } to { opacity: 1; transform: none; } }
.btu-lift { transition: transform 240ms cubic-bezier(.2,.9,.3,1); }
.btu-glide-N { animation: btu-glide-N 440ms cubic-bezier(.22,.8,.3,1) both; }
.btu-glide-S { animation: btu-glide-S 440ms cubic-bezier(.22,.8,.3,1) both; }
.btu-glide-W { animation: btu-glide-W 440ms cubic-bezier(.22,.8,.3,1) both; }
.btu-glide-E { animation: btu-glide-E 440ms cubic-bezier(.22,.8,.3,1) both; }
/* A card whose ORIGIN was measured travels from the hand rather than from its
   seat's direction: the offset is applied with motion off, then released. */
/* The trick being gathered: every card leaves TOWARDS the seat that won it, so
   the sweep itself says who took the trick. */
@keyframes btu-gather-N { to { opacity: 0; transform: translateY(-130px) scale(.86); } }
@keyframes btu-gather-S { to { opacity: 0; transform: translateY(130px) scale(.86); } }
@keyframes btu-gather-W { to { opacity: 0; transform: translateX(-150px) scale(.86); } }
@keyframes btu-gather-E { to { opacity: 0; transform: translateX(150px) scale(.86); } }
.btu-gather-N { animation: btu-gather-N 240ms cubic-bezier(.4,0,.7,.3) both; }
.btu-gather-S { animation: btu-gather-S 240ms cubic-bezier(.4,0,.7,.3) both; }
.btu-gather-W { animation: btu-gather-W 240ms cubic-bezier(.4,0,.7,.3) both; }
.btu-gather-E { animation: btu-gather-E 240ms cubic-bezier(.4,0,.7,.3) both; }
.btu-fly { transition: transform 440ms cubic-bezier(.22,.8,.3,1), opacity 240ms linear; }
@media (prefers-reduced-motion: reduce) {
  .btu-lift { transition: none; }
  .btu-glide-N, .btu-glide-S, .btu-glide-W, .btu-glide-E { animation: none; }
  .btu-fly { transition: none; }
  .btu-gather-N, .btu-gather-S, .btu-gather-W, .btu-gather-E { animation: none; opacity: 0; }
}
`;

/** Class on a hand card: its playable lift eases instead of snapping. */
export const LIFT = "btu-lift";
/** Class on a card entering the trick: it glides in from its seat's hand. */
/** Class on every card of a trick being gathered, chosen by the WINNER's seat. */
export const GATHER: Record<"N" | "E" | "S" | "W", string> = {
  N: "btu-gather-N",
  E: "btu-gather-E",
  S: "btu-gather-S",
  W: "btu-gather-W",
};
/** How long the gather runs — the host holds the cards for exactly this long. */
export const GATHER_MS = 240;

export const FLY = "btu-fly";
/** How long a card takes to reach the trick — shared by the CSS and the FLIP. */
export const FLY_MS = 440;
export const GLIDE: Record<"N" | "E" | "S" | "W", string> = {
  N: "btu-glide-N",
  E: "btu-glide-E",
  S: "btu-glide-S",
  W: "btu-glide-W",
};

export function TableMotion() {
  return (
    <style href="bridge-table-ui-motion" precedence="default">
      {CSS}
    </style>
  );
}
