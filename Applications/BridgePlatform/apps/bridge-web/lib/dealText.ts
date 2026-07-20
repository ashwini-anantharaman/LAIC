// Text form of hands for the deal editor: each suit is a run of rank
// characters ("AKQ2", "T4", "10 9 4"…), a whole hand is the four suits joined
// with dots in ♠.♥.♦.♣ order ("AKQ2.987.T4.QJ32" — the PBN convention).
// Shared by the client editor (live validation) and the server action
// (authoritative re-parse).

import type { Card, Rank, Suit } from "@bridge/events";
import { rankLabel } from "@bridge/events";

/** Editor/display suit order (also the dot order in serialized hands). */
export const SUIT_ORDER: Suit[] = ["S", "H", "D", "C"];

const RANK_OF: Record<string, Rank> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

/** "ak q2" / "AKQ2" / "10 9" → [14,13,12,2]… (or a readable error). */
export function ranksFromText(text: string): Rank[] | { error: string } {
  const norm = text.toUpperCase().replaceAll("10", "T").replace(/[\s,.]/g, "");
  const out: Rank[] = [];
  for (const ch of norm) {
    const rank = RANK_OF[ch];
    if (!rank) return { error: `"${ch}" is not a card rank` };
    out.push(rank);
  }
  return out;
}

/** "AKQ2.987.T4.QJ32" (♠.♥.♦.♣) → a hand (or a readable error). */
export function handFromSerialized(serialized: string): Card[] | { error: string } {
  const parts = serialized.split(".");
  if (parts.length !== 4) return { error: "expected four dot-separated suits" };
  const cards: Card[] = [];
  for (let i = 0; i < 4; i++) {
    const ranks = ranksFromText(parts[i] ?? "");
    if ("error" in ranks) return ranks;
    for (const rank of ranks) cards.push({ suit: SUIT_ORDER[i]!, rank });
  }
  return cards;
}

/** A hand → per-suit display strings (highest first), for prefill. */
export function suitTextsFromCards(hand: Card[]): Record<Suit, string> {
  const out = { S: "", H: "", D: "", C: "" } as Record<Suit, string>;
  for (const suit of SUIT_ORDER) {
    out[suit] = hand
      .filter((c) => c.suit === suit)
      .sort((a, b) => b.rank - a.rank)
      .map((c) => rankLabel(c.rank))
      .join("");
  }
  return out;
}
