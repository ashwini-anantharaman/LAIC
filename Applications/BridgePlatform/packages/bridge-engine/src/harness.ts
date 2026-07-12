// Golden-board harness (execution plan Phase 2 task 7): runs a rule package
// headlessly over a set of boards and reports decisions + fallback rates —
// the successor to the prototype's tools/benchmark.ts fallback-rate probe.
// Package regeneration in later phases must keep golden-board reports
// explainable: flagged diffs against a recorded baseline need a reason.

import {
  contractLabel,
  createBus,
  createEventLog,
  type Card,
  type Seat,
  type Vul,
} from "@bridge/events";
import { createGame, type AsyncDecider } from "./game";
import { initialState } from "./state";

/** Structurally compatible with @bridge/formats' GameContext. */
export interface BoardInput {
  name: string;
  dealer: Seat;
  vul: Vul;
  hands: Record<Seat, Card[]>;
}

export interface BoardReport {
  name: string;
  /** Human label, or null when the board is passed out. */
  contract: string | null;
  tricksNS: number;
  tricksEW: number;
  bidDecisions: number;
  playDecisions: number;
  bidFallbacks: number;
  playFallbacks: number;
  /** Unique rule ids exercised on this board (§19.3 test-hand linkage). */
  matchedRuleIds: string[];
}

export interface HarnessReport {
  boards: BoardReport[];
  totals: {
    boards: number;
    decisions: number;
    bidFallbackRate: number;
    playFallbackRate: number;
  };
}

const MAX_STEPS = 400; // hard stop: a board is ≤ ~90 actions (38 calls + 52 cards)

/**
 * Play every board to completion with the given decider in all four seats
 * (or a per-seat decider factory) and report fallback rates.
 */
export async function runBoards(
  boards: BoardInput[],
  decider: AsyncDecider | ((seat: Seat) => AsyncDecider),
): Promise<HarnessReport> {
  const reports: BoardReport[] = [];

  for (const board of boards) {
    const bus = createBus();
    const log = createEventLog(bus);
    const deciders: Record<Seat, AsyncDecider> = {
      N: typeof decider === "function" ? decider("N") : decider,
      E: typeof decider === "function" ? decider("E") : decider,
      S: typeof decider === "function" ? decider("S") : decider,
      W: typeof decider === "function" ? decider("W") : decider,
    };
    const game = createGame(
      bus,
      deciders,
      initialState(board.name, board.dealer, board.vul, board.hands),
    );

    let steps = 0;
    while (game.getState().phase !== "complete" && steps < MAX_STEPS) {
      const progressed = await game.step();
      if (!progressed) break;
      steps++;
    }
    if (game.getState().phase !== "complete")
      throw new Error(`Board "${board.name}" did not complete within ${MAX_STEPS} steps`);

    const state = game.getState();
    const bidLogic = log.filter("bid-logic-event");
    const playLogic = log.filter("play-logic-event");
    reports.push({
      name: board.name,
      contract: state.contract ? contractLabel(state.contract) : null,
      tricksNS: state.trickCount.NS,
      tricksEW: state.trickCount.EW,
      bidDecisions: bidLogic.length,
      playDecisions: playLogic.length,
      bidFallbacks: bidLogic.filter((e) => e.fallback).length,
      playFallbacks: playLogic.filter((e) => e.fallback).length,
      matchedRuleIds: [
        ...new Set(
          [...bidLogic, ...playLogic]
            .map((e) => e.matchedRuleId)
            .filter((id): id is string => Boolean(id)),
        ),
      ],
    });
    log.dispose();
  }

  const sum = (f: (b: BoardReport) => number) => reports.reduce((a, b) => a + f(b), 0);
  const bidDecisions = sum((b) => b.bidDecisions);
  const playDecisions = sum((b) => b.playDecisions);
  return {
    boards: reports,
    totals: {
      boards: reports.length,
      decisions: bidDecisions + playDecisions,
      bidFallbackRate: bidDecisions ? sum((b) => b.bidFallbacks) / bidDecisions : 0,
      playFallbackRate: playDecisions ? sum((b) => b.playFallbacks) / playDecisions : 0,
    },
  };
}
