// Normalized board shape, ported from the bridgebot prototype
// (src/formats/context.ts). Every input source (LIN, PBN, manual, random)
// produces this, so downstream UI/engine is source-agnostic.

import type {
  AuctionCall,
  Card,
  Contract,
  Seat,
  Vul,
} from "@bridge/events";

export interface PlayedCard {
  seat: Seat;
  card: Card;
  trickIndex: number;
}

export interface GameContext {
  name: string;
  dealer: Seat;
  vul: Vul;
  players: Record<Seat, string>;
  hands: Record<Seat, Card[]>;
  auction: AuctionCall[];
  play?: PlayedCard[];
  contract?: Contract | null;
  source: "lin" | "pbn" | "manual" | "random";
}

export type ParseResult =
  | { ok: true; contexts: GameContext[] }
  | { ok: false; error: string };

export const emptyPlayers = (): Record<Seat, string> => ({ N: "", E: "", S: "", W: "" });

/** Validate that the four hands together form a legal 52-unique-card deal (when full). */
export function validateDeal(hands: Record<Seat, Card[]>): string | null {
  const seen = new Set<string>();
  let total = 0;
  for (const seat of ["N", "E", "S", "W"] as Seat[]) {
    for (const c of hands[seat]) {
      const id = `${c.suit}${c.rank}`;
      if (seen.has(id)) return `Duplicate card ${id}.`;
      seen.add(id);
      total++;
    }
    if (hands[seat].length > 13) return `${seat} has more than 13 cards.`;
  }
  if (total === 52 && seen.size !== 52) return "Deal does not contain 52 unique cards.";
  return null;
}
