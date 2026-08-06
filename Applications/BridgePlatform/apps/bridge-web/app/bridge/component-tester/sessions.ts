// Server-only deterministic in-memory sessions for the component tester.
//
// Every cell in the tester is a REAL GameState snapshot at a named moment, not
// a fixture. We deal a fixed board (seed 7 — a real 1♠ contract that plays to
// completion), seat four deterministic KB deciders (first_match + fixed seed
// strings ⇒ fully replayable), and step the engine once from the deal to the
// end, snapshotting the state the first time each moment predicate holds. Two
// cells that differ only in game role are therefore the SAME deal at the SAME
// moment — the visibility recipe is applied later, per cell, in the client.
//
// The compile + full run is memoised per request with react `cache`, so the
// grid renders one board however many cells and axes it fans into.

import "server-only";
import { createBus } from "@bridge/events";
import type { Seat } from "@bridge/events";
import {
  createGame,
  createKbDecider,
  initialState,
  resultLabel,
  scoreBoard,
  seededDeal,
  type GameState,
} from "@bridge/engine";
import { compileKb, FIXTURE_EDGES, FIXTURE_ITEMS, fixturePacks } from "@bridge/kb";
import { cache } from "react";
import type { MomentId, MomentResult, MomentSnapshot } from "./types";

export const MOMENTS: { id: MomentId; label: string; note: string }[] = [
  { id: "opening", label: "Opening", note: "Auction opens" },
  { id: "midAuction", label: "Mid auction", note: "Mid auction" },
  { id: "lead", label: "Opening lead", note: "Opening lead" },
  { id: "midPlay", label: "Mid play", note: "Mid play" },
  { id: "complete", label: "Board over", note: "Board over" },
];

const BOARD_SEED = 7;
const BOARD_REF = `seeded-${BOARD_SEED}`;
const DEALER: Seat = "N";
const KB_ID = "kb_tester";
const SEATS: Seat[] = ["N", "E", "S", "W"];
const GLYPH: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" };

/** The tiny SAYC fixture KB, compiled once for the whole process. */
const compiled = (() => {
  const { compiled, errors } = compileKb({
    kbId: KB_ID,
    version: 1,
    compiledAt: "2026-08-04T00:00:00.000Z",
    items: FIXTURE_ITEMS,
    edges: FIXTURE_EDGES,
    packs: fixturePacks(KB_ID),
  });
  if (!compiled) throw new Error(`tester KB failed to compile: ${JSON.stringify(errors)}`);
  return compiled;
})();

function contractText(state: GameState): string {
  const c = state.contract;
  if (c)
    return `${c.level}${GLYPH[c.strain]}${c.doubled === 1 ? "X" : c.doubled === 2 ? "XX" : ""} by ${c.declarer}`;
  return state.phase === "auction" ? "Auction in progress" : "Passed out";
}

function resultFor(state: GameState): MomentResult {
  const score = scoreBoard(state);
  return {
    line: score ? resultLabel(score) : contractText(state),
    score: score ? `${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}` : "",
    detail: `NS ${state.trickCount.NS} · EW ${state.trickCount.EW}`,
  };
}

const completedTricks = (s: GameState) => s.trickCount.NS + s.trickCount.EW;

/** First-satisfaction moment predicates (predicates on state, not step counts). */
function firstHolds(id: MomentId, s: GameState): boolean {
  switch (id) {
    case "opening":
      return s.auction.length >= 1;
    case "midAuction":
      return s.auction.length >= 3;
    case "lead":
      return s.phase === "play";
    case "midPlay":
      return s.phase === "play" && completedTricks(s) >= 4;
    case "complete":
      return s.phase === "complete";
  }
}

/**
 * Deal the fixed board, seat four deterministic KB deciders, and step to the
 * end once, snapshotting each moment the first time its predicate holds. Any
 * moment that never fires (e.g. a passed-out board has no play) falls back to
 * the nearest earlier snapshot, then to the final state, so the grid always
 * has five real states to show.
 */
export const momentStates = cache(async (): Promise<Record<MomentId, MomentSnapshot>> => {
  const hands = seededDeal(BOARD_SEED);
  const deciders = {} as Record<Seat, ReturnType<typeof createKbDecider>>;
  for (const seat of SEATS)
    deciders[seat] = createKbDecider({
      compiled,
      player: {
        enabledPackIds: ["pk_conventions"],
        settingOverrides: {},
        decisionPolicyId: "first_match",
      },
      seed: `tester-${BOARD_SEED}-${seat}`,
    });

  const game = createGame(createBus(), deciders, initialState(BOARD_REF, DEALER, "none", hands));

  const snaps: Partial<Record<MomentId, GameState>> = {};
  const order: MomentId[] = ["opening", "midAuction", "lead", "midPlay", "complete"];
  const capture = (s: GameState) => {
    for (const id of order) if (!snaps[id] && firstHolds(id, s)) snaps[id] = structuredClone(s);
  };

  capture(game.getState());
  let guard = 0;
  while (game.getState().phase !== "complete" && guard++ < 400) {
    await game.step();
    capture(game.getState());
  }
  const final = structuredClone(game.getState());
  snaps.complete ??= final;

  // Fill any moment that never fired with the nearest earlier snapshot, else
  // the final state — the grid never shows a hole.
  let last: GameState = snaps.opening ?? final;
  const filled = {} as Record<MomentId, MomentSnapshot>;
  for (const id of order) {
    const state = snaps[id] ?? last;
    last = state;
    filled[id] = { state, result: resultFor(state) };
  }
  return filled;
});

/** One moment (board seed fixed). Memoised via momentStates. */
export async function stateAt(moment: MomentId): Promise<MomentSnapshot> {
  return (await momentStates())[moment];
}
