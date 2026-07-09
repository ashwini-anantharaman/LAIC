// Phase 2 acceptance: a board plays headlessly with 4 AI seats running the
// test package, producing full decision traces with rule ids and fallback
// flags — engine runs entirely outside React.

import { createBus, createEventLog, isActionEvent } from "@bridge/events";
import { describe, expect, it } from "vitest";
import { BOARD_G1 } from "./fixtures/goldenBoards";
import { TEST_PACKAGE, TEST_VALUES } from "./fixtures/testPackage";
import { createGame, type AsyncDecider } from "./game";
import { createPackageDecider } from "./rules/decider";
import { initialState } from "./state";

async function playBoard() {
  const bus = createBus();
  const log = createEventLog(bus);
  const decider = createPackageDecider({ pkg: TEST_PACKAGE, values: TEST_VALUES });
  const deciders: Record<"N" | "E" | "S" | "W", AsyncDecider> = {
    N: decider,
    E: decider,
    S: decider,
    W: decider,
  };
  const game = createGame(
    bus,
    deciders,
    initialState(BOARD_G1.name, BOARD_G1.dealer, BOARD_G1.vul, BOARD_G1.hands),
  );
  let guard = 0;
  while (game.getState().phase !== "complete" && guard++ < 400) await game.step();
  return { game, log };
}

describe("headless full board (G1, four AI seats)", () => {
  it("bids the expected auction and plays all 52 cards", async () => {
    const { game, log } = await playBoard();
    const state = game.getState();

    expect(state.phase).toBe("complete");
    expect(state.auction.map((c) => c.call)).toEqual(["1S", "P", "2S", "P", "P", "P"]);
    expect(state.contract).toMatchObject({ level: 2, strain: "S", declarer: "N" });
    expect(log.filter("play-event").length).toBe(52);
    expect(state.trickCount.NS + state.trickCount.EW).toBe(13);
    // Every hand fully played.
    for (const seat of ["N", "E", "S", "W"] as const) expect(state.hands[seat].length).toBe(0);
  });

  it("emits ordered events with rule-id traces and honest fallback flags", async () => {
    const { log } = await playBoard();
    const events = log.getAll();

    // Single-writer seq invariant: strictly increasing.
    for (let i = 1; i < events.length; i++) expect(events[i]!.seq).toBeGreaterThan(events[i - 1]!.seq);

    // Every action event carries a fallback flag; matched bids cite rules.
    const bidLogic = log.filter("bid-logic-event");
    const opening = bidLogic[0]!;
    expect(opening.fallback).toBe(false);
    expect(opening.trace.some((r) => r.ruleId === "tp_open_major" && r.matched)).toBe(true);

    // East's pass over 1S is a flagged fallback (no rule covers "other" role).
    const eastPass = bidLogic[1]!;
    expect(eastPass.seat).toBe("E");
    expect(eastPass.fallback).toBe(true);

    // Play decisions cite the play rules; none fall back (lead+follow covered).
    const playLogic = log.filter("play-logic-event");
    expect(playLogic.length).toBe(52);
    expect(playLogic.every((e) => typeof e.fallback === "boolean")).toBe(true);
    expect(playLogic.filter((e) => e.fallback).length).toBe(0);
    expect(
      playLogic[0]!.trace.some((r) => r.ruleId === "tp_lead_top_longest" && r.matched),
    ).toBe(true);

    // Log mirrors the bus faithfully: alternating logic/action pairs.
    expect(events.filter(isActionEvent).length).toBe(6 + 52);
  });
});
