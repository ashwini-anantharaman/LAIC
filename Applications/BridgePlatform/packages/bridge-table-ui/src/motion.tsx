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
// the card visibly starts OUTSIDE the trick, where the hand is. 300ms is long
// enough to read as flight and short enough that a fast player never waits.

const CSS = `
@keyframes btu-glide-N { from { opacity: .25; transform: translateY(-150px) scale(.95); } to { opacity: 1; transform: none; } }
@keyframes btu-glide-S { from { opacity: .25; transform: translateY(150px) scale(.95); } to { opacity: 1; transform: none; } }
@keyframes btu-glide-W { from { opacity: .25; transform: translateX(-170px) scale(.95); } to { opacity: 1; transform: none; } }
@keyframes btu-glide-E { from { opacity: .25; transform: translateX(170px) scale(.95); } to { opacity: 1; transform: none; } }
.btu-lift { transition: transform 150ms cubic-bezier(.2,.9,.3,1); }
.btu-glide-N { animation: btu-glide-N 300ms cubic-bezier(.22,.8,.3,1) both; }
.btu-glide-S { animation: btu-glide-S 300ms cubic-bezier(.22,.8,.3,1) both; }
.btu-glide-W { animation: btu-glide-W 300ms cubic-bezier(.22,.8,.3,1) both; }
.btu-glide-E { animation: btu-glide-E 300ms cubic-bezier(.22,.8,.3,1) both; }
@media (prefers-reduced-motion: reduce) {
  .btu-lift { transition: none; }
  .btu-glide-N, .btu-glide-S, .btu-glide-W, .btu-glide-E { animation: none; }
}
`;

/** Class on a hand card: its playable lift eases instead of snapping. */
export const LIFT = "btu-lift";
/** Class on a card entering the trick: it glides in from its seat's hand. */
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
