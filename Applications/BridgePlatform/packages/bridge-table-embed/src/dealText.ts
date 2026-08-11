// Text form of hands — a port of apps/bridge-web/lib/dealText.ts, which the
// create wizard's pack editor and its ♠.♥.♦.♣ serialization both need.
//
// It travels with the package for the same reason benDecider.ts does: the app
// module lives behind a Next path alias inside an application, and an embedded
// component may not reach into one. Kept deliberately literal so a reader can
// diff the two.

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
export function suitTextsFromCards(hand: readonly Card[]): Record<Suit, string> {
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

/** A whole hand in the ♠.♥.♦.♣ serialization the draft carries. */
export function serializeHand(hand: readonly Card[]): string {
  const texts = suitTextsFromCards(hand);
  return SUIT_ORDER.map((suit) => texts[suit]).join(".");
}
