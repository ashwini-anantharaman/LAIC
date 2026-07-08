// Seeded random dealing, ported from the prototype (src/formats/random.ts).
// Constraint-aware dealing (teaching scopes, evaluator filters) builds on
// this in @bridge/dealer (Phase 6).

import {
  mulberry32,
  type Card,
  type Rank,
  type Seat,
  type Suit,
} from "@bridge/events";
import { emptyPlayers, type GameContext } from "./context";

/** Deal four distinct 13-card hands from one seeded shuffle (reproducible). */
export function randomContext(seed: number): GameContext {
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
  return {
    name: `Random deal (seed ${seed})`,
    dealer: "N",
    vul: "none",
    players: emptyPlayers(),
    hands,
    auction: [],
    source: "random",
  };
}
