// Self-play simulation (Knowledge Rework §3): N seeded deals, the player at
// all four seats, on the real game-law engine. Produces the report attached
// to a player's validationReport, and doubles as the closed-loop acceptance
// check for constrained dealing (spec §5) — a deal is safe for an incomplete
// player exactly when its simulation completes with zero engine-floor events.

import { createBus, SEATS, type Card, type Seat, type Suit } from "@bridge/events";
import type { SimulationReport } from "@bridge/kb";
import { createGame } from "../game";
import { initialState, type GameState } from "../state";
import { createKbDecider, type KbDeciderOptions } from "./decider";
import { mulberry32 } from "./rng";

export function seededDeal(seed: number): Record<Seat, Card[]> {
  const random = mulberry32(seed);
  const suits: Suit[] = ["S", "H", "D", "C"];
  const cards: Card[] = suits.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({ suit, rank: (i + 2) as Card["rank"] })),
  );
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  cards.forEach((card, i) => hands[SEATS[i % 4]!].push(card));
  return hands;
}

export interface SimulateOptions extends Omit<KbDeciderOptions, "seed"> {
  deals: number;
  seed: number;
  /** Called after each completed deal (progress reporting). */
  onDeal?: (index: number, result: SimulatedDeal) => void;
}

export interface SimulatedDeal {
  seed: number;
  completed: boolean;
  floorEvents: number;
  fallbackEvents: number;
  finalContract: string | null;
  /** matchedRuleId → times it decided an action in this deal (bid + play + lead). */
  ruleUsage: Record<string, number>;
}

/** SimulationReport plus per-rule usage counts (coverage check). */
export interface SelfPlayReport extends SimulationReport {
  ruleUsage: Record<string, number>;
}

const MAX_STEPS = 400; // hard stop far above any legal deal's action count

export async function simulateDeal(
  options: KbDeciderOptions,
  dealSeed: number,
): Promise<SimulatedDeal> {
  const hands = seededDeal(dealSeed);
  let floorEvents = 0;
  let fallbackEvents = 0;
  const ruleUsage: Record<string, number> = {};

  const decider = createKbDecider({ ...options, seed: `sim_${dealSeed}` });
  const count = (d: { fallback: boolean; reason: string; matchedRuleId?: string }) => {
    if (d.fallback) {
      if (d.reason.startsWith("ENGINE FLOOR")) floorEvents++;
      else fallbackEvents++;
    }
    if (d.matchedRuleId) ruleUsage[d.matchedRuleId] = (ruleUsage[d.matchedRuleId] ?? 0) + 1;
  };
  const counting = {
    decideBid: async (state: GameState, seat: Seat) => {
      const d = await decider.decideBid(state, seat);
      count(d);
      return d;
    },
    decidePlay: async (state: GameState, seat: Seat) => {
      const d = await decider.decidePlay(state, seat);
      count(d);
      return d;
    },
  };

  const game = createGame(
    createBus(),
    { N: counting, E: counting, S: counting, W: counting },
    initialState(`sim_${dealSeed}`, SEATS[dealSeed % 4]!, "none", hands),
  );

  let steps = 0;
  while (game.getState().phase !== "complete" && steps < MAX_STEPS) {
    await game.step();
    steps++;
  }

  const state = game.getState();
  return {
    seed: dealSeed,
    completed: state.phase === "complete",
    floorEvents,
    fallbackEvents,
    finalContract: state.contract
      ? `${state.contract.level}${state.contract.strain}`
      : state.phase === "complete"
        ? "passed out"
        : null,
    ruleUsage,
  };
}

export async function simulateSelfPlay(options: SimulateOptions): Promise<SelfPlayReport> {
  let completed = 0;
  let floorTotal = 0;
  let fallbackTotal = 0;
  const ruleUsage: Record<string, number> = {};

  for (let i = 0; i < options.deals; i++) {
    const result = await simulateDeal(
      { compiled: options.compiled, player: options.player },
      options.seed + i,
    );
    if (result.completed) completed++;
    floorTotal += result.floorEvents;
    fallbackTotal += result.fallbackEvents;
    for (const [ruleId, n] of Object.entries(result.ruleUsage))
      ruleUsage[ruleId] = (ruleUsage[ruleId] ?? 0) + n;
    options.onDeal?.(i, result);
  }

  return {
    deals: options.deals,
    seed: options.seed,
    completed,
    engineFloorEvents: floorTotal,
    fallbackUsage: { any: fallbackTotal },
    ruleUsage,
    generatedAt: new Date().toISOString(),
  };
}
