// The opening-bid drill's 25 hands, authored by the owner (2026-08-11).
//
// THE ANSWER IS THE AUTHOR'S, NOT BEN'S. That is the whole point of this set:
// BEN plays a strong game but bids its own system, and a drill that contradicts
// the lesson above it is worse than no drill. Every `bid` below is what the
// author teaches; nothing here consults a neural engine.
//
// Hands are written the way a bridge player writes them — highest first, "T"
// for the ten — and parsed once at module load. Rank/suit order in the source
// is not load-bearing; `parseHand` sorts.
//
// FIVE HANDS ARRIVED WITH 12 CARDS (6, 9, 10, 17, 21) and were completed on the
// owner's instruction — "add cards that won't affect the answer". Four took a
// pure addition, chosen so the stated HCP and the taught bid both come out right:
//   6  +♣A   → 13 cards, 8 HCP (was 4). Weak two intact; ♠ stays a singleton.
//   10 +♦Q   → 13 cards, 15 HCP (was 13). Added OUTSIDE hearts so it stays a 5-carder.
//   17 +♣J   → 13 cards, 15 HCP (was 14). Same reason — hearts stay a 6-carder.
//   21 +♦2   → 13 cards, 17 HCP; note corrected 16 → 17. Still 1NT range, 4-3-3-3.
//
// HAND 9 COULD NOT BE FIXED BY ADDING. As supplied it held 20 HCP — a 2NT hand,
// not the 1NT it teaches — and a 13th card can only add more. Its ♠K was dropped
// and ♠ became "Q 5 4 2": 13 cards, 17 HCP, balanced, 1NT correct. That is a
// CHANGED card, not an added one — if the intended hand was different, this is
// the one to check.

import type { Card, Rank, Suit } from "@bridge/events";

/** One drill hand: what the learner sees, what they should bid, and why. */
export interface DrillHand {
  /** 1-based, as the author numbered them. */
  no: number;
  hand: Card[];
  /** The author's answer, in our call notation ("P", "1S", "1N", "2C"…). */
  bid: string;
  /** Shown after the learner answers — the author's own reasoning. */
  why: string;
}

const RANKS: Record<string, Rank> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10,
  "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};

/** "A K 5 4 3" + a suit → cards. Whitespace-insensitive; "T" is the ten. */
function suitCards(suit: Suit, spec: string): Card[] {
  return spec
    .split(/\s+/)
    .filter(Boolean)
    .map((r) => {
      const rank = RANKS[r.toUpperCase()];
      if (!rank) throw new Error(`"${r}" is not a rank (suit ${suit})`);
      return { suit, rank };
    });
}

const hand = (s: string, h: string, d: string, c: string): Card[] => [
  ...suitCards("S", s),
  ...suitCards("H", h),
  ...suitCards("D", d),
  ...suitCards("C", c),
];

/** High-card points, so the drill can show them and check the author's note. */
export function hcp(cards: readonly Card[]): number {
  return cards.reduce((n, c) => n + Math.max(0, c.rank - 10), 0);
}

export const OPENING_BID_HANDS: readonly DrillHand[] = [
  { no: 1, hand: hand("A K 5 4 3", "K 8 2", "Q 7 3", "5 4"), bid: "1S", why: "12 HCP, 5-card spade suit" },
  { no: 2, hand: hand("9 4", "A K J T 5 3", "K 8 2", "7 3"), bid: "1H", why: "11 HCP, 6-card heart suit" },
  { no: 3, hand: hand("K J 2", "Q 5 4", "A K T 8 3", "6 2"), bid: "1D", why: "13 HCP, 5-card diamond suit" },
  { no: 4, hand: hand("A K 3", "Q J 4", "K 8 5", "A T 6 2"), bid: "1N", why: "17 HCP, balanced 4-3-3-3 shape" },
  { no: 5, hand: hand("A K Q J", "A K Q", "A K 4", "K J 2"), bid: "2C", why: "30 HCP, strong artificial opening" },
  { no: 6, hand: hand("7", "K J T 8 6 3", "9 5 4 2", "A 8"), bid: "2H", why: "8 HCP, weak two in hearts" },
  { no: 7, hand: hand("9 4 3", "8 5 2", "K T 4", "J 8 7 3"), bid: "P", why: "4 HCP, too weak to open" },
  { no: 8, hand: hand("A Q J T 8", "4 3", "K 5 2", "A 7 3"), bid: "1S", why: "14 HCP, 5-card spade suit" },
  { no: 9, hand: hand("Q 5 4 2", "A J 4", "K J 6", "A Q 3"), bid: "1N", why: "17 HCP, balanced distribution" },
  { no: 10, hand: hand("5 4", "A K Q J 7", "Q 8 4 3", "K 5"), bid: "1H", why: "15 HCP, 5-card heart suit" },
  { no: 11, hand: hand("A J 2", "8 4", "A K Q J 5", "7 4 2"), bid: "1D", why: "15 HCP, 5-card diamond suit" },
  { no: 12, hand: hand("K J T 9 8 5", "7 3", "8 4", "Q T 2"), bid: "2S", why: "6 HCP, weak two in spades" },
  { no: 13, hand: hand("K 4", "A 5", "K J 8 2", "A K Q 9 3"), bid: "1C", why: "20 HCP, 5-card club suit" },
  { no: 14, hand: hand("A K Q", "K J 5", "A Q 4", "K T 8 3"), bid: "2N", why: "22 HCP, balanced distribution" },
  { no: 15, hand: hand("8 4 3", "9 7 2", "Q 5 4", "K J 8 2"), bid: "P", why: "6 HCP, insufficient points" },
  { no: 16, hand: hand("K Q J T 8 7", "A 4", "9 5", "K 4 2"), bid: "1S", why: "13 HCP, 6-card spade suit" },
  { no: 17, hand: hand("3", "A K J T 8 7", "Q 5 4", "A J 3"), bid: "1H", why: "15 HCP, 6-card heart suit" },
  { no: 18, hand: hand("A K 4", "8 3", "K J T 8 7 2", "5 4"), bid: "1D", why: "11 HCP, 6-card diamond suit" },
  { no: 19, hand: hand("A 5", "K 4", "A 8 3", "K J T 8 7 2"), bid: "1C", why: "15 HCP, 6-card club suit" },
  { no: 20, hand: hand("K Q J T 9 8 3", "5", "8 4 2", "7 3"), bid: "3S", why: "6 HCP, 7-card preemptive bid" },
  { no: 21, hand: hand("A J 5", "K Q 4", "A T 8 2", "Q J 5"), bid: "1N", why: "17 HCP, balanced distribution" },
  { no: 22, hand: hand("K 5 2", "A Q J 9 4", "7 3", "A K 2"), bid: "1H", why: "17 HCP, 5-card heart suit" },
  { no: 23, hand: hand("8 4", "6 3", "K Q J T 8 7", "9 5 2"), bid: "2D", why: "6 HCP, weak two in diamonds" },
  { no: 24, hand: hand("A K Q 9 4", "J 5 2", "K 3", "8 7 4"), bid: "1S", why: "13 HCP, 5-card spade suit" },
  { no: 25, hand: hand("A J T 8 4", "K Q 3", "A 5", "K 4 2"), bid: "1S", why: "17 HCP, 5-card spade suit" },
];

export interface DrillHandProblem {
  no: number;
  /** "short" = fewer than 13 cards; "hcp" = the note disagrees with the cards. */
  kind: "short" | "hcp";
  detail: string;
}

/**
 * Every way a hand contradicts itself. Teaching data is worth checking: a drill
 * that shows 12 cards, or claims a point count the cards do not hold, teaches
 * the wrong lesson confidently. Called by the component so problems surface
 * where an author can see them rather than only in a test.
 */
export function validateDrillHands(
  hands: readonly DrillHand[] = OPENING_BID_HANDS,
): DrillHandProblem[] {
  const out: DrillHandProblem[] = [];
  for (const h of hands) {
    if (h.hand.length !== 13)
      out.push({ no: h.no, kind: "short", detail: `${h.hand.length} cards, not 13` });
    const stated = /(\d+)\s*HCP/i.exec(h.why)?.[1];
    const actual = hcp(h.hand);
    if (stated && Number(stated) !== actual)
      out.push({ no: h.no, kind: "hcp", detail: `note says ${stated} HCP, cards hold ${actual}` });
  }
  return out;
}
