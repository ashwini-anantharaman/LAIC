/**
 * Zone 3 — Bridge implementation: hand parsing & bid utilities.
 * Pure functions, no coaching logic. Used by the evaluator and deal generator.
 */

export type SuitLetter = "S" | "H" | "D" | "C";
export const SUIT_ORDER: SuitLetter[] = ["S", "H", "D", "C"];

/** Bidding rank: NT highest, then S > H > D > C. */
const STRAIN_RANK: { [k: string]: number } = { C: 0, D: 1, H: 2, S: 3, NT: 4 };

export interface ParsedHand {
  suits: Record<SuitLetter, string>;
  lengths: Record<SuitLetter, number>;
  hcp: number;
  /** sorted descending suit lengths, e.g. [5,3,3,2] */
  shape: number[];
}

const HCP_VALUE: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

/** Normalize a card-rank character (T or 10 → T). */
function countHcpInSuit(cards: string): number {
  let total = 0;
  for (const ch of cards.toUpperCase()) {
    total += HCP_VALUE[ch] ?? 0;
  }
  return total;
}

/** Number of card glyphs in a suit string, treating "10" as one card. */
function countCards(cards: string): number {
  // Replace "10" with "T" so it counts as a single card.
  const normalized = cards.toUpperCase().replace(/10/g, "T");
  // Only count valid rank characters.
  const matches = normalized.match(/[AKQJT98765432]/g);
  return matches ? matches.length : 0;
}

/**
 * Parse a hand string like "S:KQ874 H:A3 D:K92 C:J54".
 * Order of suit tokens does not matter. Missing suits are treated as void.
 */
export function parseHand(hand: string): ParsedHand {
  const suits: Record<SuitLetter, string> = { S: "", H: "", D: "", C: "" };
  const tokens = hand.trim().split(/\s+/);
  for (const token of tokens) {
    const m = token.match(/^([SHDC]):(.*)$/i);
    if (!m) continue;
    const suit = m[1].toUpperCase() as SuitLetter;
    suits[suit] = m[2];
  }

  const lengths: Record<SuitLetter, number> = {
    S: countCards(suits.S),
    H: countCards(suits.H),
    D: countCards(suits.D),
    C: countCards(suits.C),
  };

  const hcp =
    countHcpInSuit(suits.S) +
    countHcpInSuit(suits.H) +
    countHcpInSuit(suits.D) +
    countHcpInSuit(suits.C);

  const shape = SUIT_ORDER.map((s) => lengths[s]).sort((a, b) => b - a);

  return { suits, lengths, hcp, shape };
}

/**
 * Balanced = no void, no singleton, at most one doubleton.
 * Patterns: 4-3-3-3, 4-4-3-2, 5-3-3-2.
 */
export function isBalanced(hand: ParsedHand): boolean {
  const [a, b, c, d] = hand.shape;
  if (d === 0 || d === 1) return false; // void or singleton
  // at most one doubleton
  const doubletons = hand.shape.filter((n) => n === 2).length;
  return doubletons <= 1 && a <= 5;
}

export function longestMajor(hand: ParsedHand): {
  suit: SuitLetter | null;
  length: number;
} {
  const s = hand.lengths.S;
  const h = hand.lengths.H;
  if (s < 5 && h < 5) return { suit: null, length: Math.max(s, h) };
  // spades if equal length, else the longer
  if (s >= h) return { suit: "S", length: s };
  return { suit: "H", length: h };
}

/** Normalize a bid: uppercase, map suit symbols, collapse pass variants to "P". */
export function normalizeBid(bid: string): string {
  const b = bid.trim().toUpperCase();
  if (b === "P" || b === "PASS") return "P";
  const symbolMap: { [k: string]: string } = {
    "♠": "S",
    "♥": "H",
    "♦": "D",
    "♣": "C",
  };
  let out = "";
  for (const ch of b) {
    out += symbolMap[ch] ?? ch;
  }
  // "1NT" stays, "1N" → "1NT"
  out = out.replace(/^(\d)N$/, "$1NT");
  return out;
}

export interface ParsedBid {
  isPass: boolean;
  level: number;
  strain: string; // "C" | "D" | "H" | "S" | "NT"
}

export function parseBid(bid: string): ParsedBid {
  const b = normalizeBid(bid);
  if (b === "P") return { isPass: true, level: 0, strain: "" };
  const m = b.match(/^(\d)(NT|[SHDC])$/);
  if (!m) return { isPass: false, level: 0, strain: "" };
  return { isPass: false, level: parseInt(m[1], 10), strain: m[2] };
}

export function strainRank(strain: string): number {
  return STRAIN_RANK[strain] ?? -1;
}

/** True if `strain` can be introduced at the 1-level over `openerStrain`. */
export function biddableAtOneLevel(
  strain: string,
  openerStrain: string,
): boolean {
  return strainRank(strain) > strainRank(openerStrain);
}
