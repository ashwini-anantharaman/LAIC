import { describe, it, expect } from "vitest";
import { LiveCardPlayEvaluator, type LiveCardPlayState } from "../LiveCardPlayEvaluator.js";
import { LocalDoubleDummyOracle } from "./LocalDoubleDummyOracle.js";

// End-game (2 cards each), spades trump. South holds HA H2; dummy North has a
// small trump. Cashing HA then giving North a ruff wins 2 tricks; leading the
// low heart first lets a defender win and kills the ruff (1 trick).
const state: LiveCardPlayState = {
  contract: "4S",
  trump: "S",
  declarer: "S",
  learnerSeat: "S",
  role: "declarer",
  dummySeat: "N",
  hands: {
    S: "S: H:A2 D: C:",
    N: "S:3 H:4 D: C:",
    W: "S: H:65 D: C:",
    E: "S: H:87 D: C:",
  },
  playFromSeat: "S",
  toLead: true,
  trickSoFar: [],
  legalCards: ["HA", "H2"],
  tricksPlayed: 11,
};

describe("LiveCardPlayEvaluator + LocalDoubleDummyOracle", () => {
  const evaluator = new LiveCardPlayEvaluator(new LocalDoubleDummyOracle());

  it("marks the double-dummy-best play correct", async () => {
    const r = await evaluator.evaluate(state, { card: "HA", position: "S", live: true });
    expect(r.correctness).toBe("correct");
  });

  it("flags a trick-losing play as not correct, and points to the best card", async () => {
    const r = await evaluator.evaluate(state, { card: "H2", position: "S", live: true });
    expect(r.correctness).not.toBe("correct");
    expect(r.correctness).not.toBe("acceptable");
    expect(r.bestAction).toBe("HA");
    expect(r.explanation).toMatch(/trick/i);
  });
});
