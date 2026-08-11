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
// with exactly one copy. The durations are deliberately short — 150/170ms is
// long enough to read as movement and short enough that a fast player never
// waits on it.

const CSS = `
@keyframes btu-deal {
  from { opacity: 0; transform: translateY(-10px) scale(.88); }
  to   { opacity: 1; transform: none; }
}
.btu-lift { transition: transform 150ms cubic-bezier(.2,.9,.3,1); }
.btu-deal { animation: btu-deal 170ms cubic-bezier(.2,.9,.3,1) both; }
@media (prefers-reduced-motion: reduce) {
  .btu-lift { transition: none; }
  .btu-deal { animation: none; }
}
`;

/** Class on a hand card: its playable lift eases instead of snapping. */
export const LIFT = "btu-lift";
/** Class on a card entering the trick: it deals in instead of popping. */
export const DEAL = "btu-deal";

export function TableMotion() {
  return (
    <style href="bridge-table-ui-motion" precedence="default">
      {CSS}
    </style>
  );
}
