// Golden boards for the harness (Bridge plan §19.2). G1 is hand-built with a
// known expected auction under the test package; the seeded boards pin
// determinism (same seed -> same deal -> same decisions, forever).

import {
  mulberry32,
  type Card,
  type Rank,
  type Seat,
  type Suit,
} from "@bridge/events";
import type { BoardInput } from "../harness";

const RANK_BY_CHAR: Record<string, Rank> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10,
  "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};

/** Parse "AKQ54.A32.K32.32" (spades.hearts.diamonds.clubs) into 13 cards. */
export function parseHandShdc(s: string): Card[] {
  const suits: Suit[] = ["S", "H", "D", "C"];
  const parts = s.split(".");
  if (parts.length !== 4) throw new Error(`Bad hand "${s}"`);
  const cards: Card[] = [];
  parts.forEach((part, i) => {
    for (const ch of part) {
      const rank = RANK_BY_CHAR[ch.toUpperCase()];
      if (!rank) throw new Error(`Bad rank "${ch}" in "${s}"`);
      cards.push({ suit: suits[i]!, rank });
    }
  });
  if (cards.length !== 13) throw new Error(`Hand "${s}" has ${cards.length} cards`);
  return cards;
}

function deal(
  name: string,
  dealer: Seat,
  hands: Record<Seat, string>,
): BoardInput {
  const parsed: Record<Seat, Card[]> = {
    N: parseHandShdc(hands.N),
    E: parseHandShdc(hands.E),
    S: parseHandShdc(hands.S),
    W: parseHandShdc(hands.W),
  };
  const seen = new Set<string>();
  for (const seat of ["N", "E", "S", "W"] as Seat[])
    for (const c of parsed[seat]) {
      const id = `${c.suit}${c.rank}`;
      if (seen.has(id)) throw new Error(`Duplicate card ${id} in board "${name}"`);
      seen.add(id);
    }
  if (seen.size !== 52) throw new Error(`Board "${name}" is not a full deal`);
  return { name, dealer, vul: "none", hands: parsed };
}

/**
 * G1 under the test package: N opens 1♠ (16 HCP, 5 spades), E has no rule
 * (fallback pass), S raises to 2♠ (6 HCP), then three fallback passes.
 * Contract: 2♠ by N; E leads.
 */
export const BOARD_G1 = deal("G1 major raise", "N", {
  N: "AKQ54.A32.K32.32",
  E: "JT8.QJT9.AJT.KQT",
  S: "963.K54.Q54.J654",
  W: "72.876.9876.A987",
});

/** Deterministic seeded deals (mulberry32, N deals, seats in N-E-S-W order). */
export function seededBoard(seed: number): BoardInput {
  const rng = mulberry32(seed);
  const deck: Card[] = [];
  for (const s of ["S", "H", "D", "C"] as Suit[])
    for (const r of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as Rank[])
      deck.push({ suit: s, rank: r });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  const order: Seat[] = ["N", "E", "S", "W"];
  deck.forEach((c, i) => hands[order[Math.floor(i / 13)]!]!.push(c));
  return { name: `seeded-${seed}`, dealer: "N", vul: "none", hands };
}

export const GOLDEN_BOARDS: BoardInput[] = [
  BOARD_G1,
  seededBoard(1),
  seededBoard(2),
  seededBoard(3),
  seededBoard(4),
];
