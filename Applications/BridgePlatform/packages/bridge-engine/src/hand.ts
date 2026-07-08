// Hand evaluation primitives, ported from the bridgebot prototype
// (src/vendor/bridge/bridge.ts). These are content-free bridge mechanics
// (standard hand-evaluation arithmetic); the predicate library exposes them
// to data-driven rules.

import {
  SUIT_RANK,
  SUITS,
  type Hand,
  type Suit,
} from "@bridge/events";

/** High-card points: A=4, K=3, Q=2, J=1. */
export function hcp(hand: Hand): number {
  let total = 0;
  for (const c of hand) {
    if (c.rank === 14) total += 4;
    else if (c.rank === 13) total += 3;
    else if (c.rank === 12) total += 2;
    else if (c.rank === 11) total += 1;
  }
  return total;
}

export function suitCounts(hand: Hand): Record<Suit, number> {
  const counts: Record<Suit, number> = { C: 0, D: 0, H: 0, S: 0 };
  for (const c of hand) counts[c.suit] += 1;
  return counts;
}

/** Suit lengths sorted descending, e.g. [5, 3, 3, 2]. */
export function shape(hand: Hand): [number, number, number, number] {
  const counts = suitCounts(hand);
  const lengths = SUITS.map((s) => counts[s]).sort((a, b) => b - a);
  return [lengths[0]!, lengths[1]!, lengths[2]!, lengths[3]!];
}

/** Balanced = 4-3-3-3, 4-4-3-2, or 5-3-3-2 (5-card major allowed). */
export function isBalanced(hand: Hand): boolean {
  const sh = shape(hand).join("-");
  return sh === "4-3-3-3" || sh === "4-4-3-2" || sh === "5-3-3-2";
}

/** All suits tied for the longest length, ordered by suit-rank (S > H > D > C). */
export function longestSuits(hand: Hand): { suit: Suit; length: number }[] {
  const counts = suitCounts(hand);
  const max = Math.max(...SUITS.map((s) => counts[s]));
  return SUITS.filter((s) => counts[s] === max)
    .map((s) => ({ suit: s, length: max }))
    .sort((a, b) => SUIT_RANK[b.suit] - SUIT_RANK[a.suit]);
}
