import { describe, it, expect } from "vitest";
import { BridgeEvaluator } from "./BridgeEvaluator";
import { parseHand, isBalanced } from "./hand";
import type { BridgeGameState, BridgeBidAction } from "../plugin/events";
import * as C from "../plugin/constants";

const evaluator = new BridgeEvaluator();

function state(): BridgeGameState {
  return {
    dealId: "d1",
    dealer: "S",
    vulnerability: "None",
    hands: {},
    auctionSoFar: [],
    currentPhase: "bidding",
  };
}

function bid(
  hand: string,
  bidStr: string,
  auction: string[] = [],
): BridgeBidAction {
  return { bid: bidStr, position: "S", hand, auctionSoFar: auction };
}

describe("hand parsing", () => {
  it("counts HCP correctly", () => {
    const h = parseHand("S:KQ874 H:A3 D:K92 C:J54");
    expect(h.hcp).toBe(3 + 2 + 4 + 3 + 1); // KQ + A + K + J = 13
    expect(h.lengths.S).toBe(5);
    expect(h.lengths.H).toBe(2);
  });
  it("detects balanced hands", () => {
    expect(isBalanced(parseHand("S:KJ8 H:AQ4 D:KJ2 C:Q543"))).toBe(true); // 4333
    expect(isBalanced(parseHand("S:5 H:AKQ74 D:J92 C:K854"))).toBe(false); // singleton
    expect(isBalanced(parseHand("S:KQ874 H:A3 D:K92 C:J54"))).toBe(true); // 5332
  });
});

describe("opening bids", () => {
  it("opens 1M with a 5-card major (12-21)", async () => {
    const r = await evaluator.evaluate(state(), bid("S:AKJ87 H:Q4 D:K92 C:J54", "1S"));
    expect(r.correctness).toBe("correct");
    expect(r.bestAction).toBe("1S");
    expect(r.skillIds).toContain(C.SKILL_OPENING_1SUIT);
  });

  it("opens 1NT with 15-17 balanced, no 5-card major", async () => {
    const r = await evaluator.evaluate(state(), bid("S:KJ8 H:AQ4 D:KJ2 C:Q543", "1NT"));
    expect(r.correctness).toBe("correct");
    expect(r.bestAction).toBe("1NT");
    expect(r.conceptIds).toContain(C.CONCEPT_HAND_BALANCED);
  });

  it("opens 1 of a minor (longest) with no 5-card major", async () => {
    const r = await evaluator.evaluate(state(), bid("S:KQ4 H:A32 D:J985 C:Q42", "1D"));
    expect(r.correctness).toBe("correct");
    expect(r.bestAction).toBe("1D");
  });

  it("passes with under 12 HCP", async () => {
    const r = await evaluator.evaluate(state(), bid("S:K54 H:Q32 D:J85 C:Q432", "P"));
    expect(r.correctness).toBe("correct");
    expect(r.bestAction).toBe("P");
    expect(r.skillIds).toContain(C.SKILL_PASS_MINIMUM);
  });
});

describe("responses to partner's 1-of-a-suit opening", () => {
  it("simple raise with 6-9 HCP and 3+ support", async () => {
    const r = await evaluator.evaluate(
      state(),
      bid("S:Q93 H:K74 D:J852 C:T63", "2S", ["1S", "P"]),
    );
    expect(r.correctness).toBe("correct");
    expect(r.bestAction).toBe("2S");
    expect(r.skillIds).toContain(C.SKILL_SIMPLE_RAISE);
  });

  it("limit raise with 10-12 HCP and 4+ support", async () => {
    const r = await evaluator.evaluate(
      state(),
      bid("S:A52 H:KQ85 D:Q543 C:J9", "3H", ["1H", "P"]),
    );
    expect(r.correctness).toBe("correct");
    expect(r.bestAction).toBe("3H");
    expect(r.skillIds).toContain(C.SKILL_LIMIT_RAISE);
  });

  it("bids a new suit at the 1-level with 6+ HCP and 4 cards", async () => {
    const r = await evaluator.evaluate(
      state(),
      bid("S:KQ85 H:A32 D:63 C:7632", "1S", ["1D", "P"]),
    );
    expect(r.correctness).toBe("correct");
    expect(r.bestAction).toBe("1S");
    expect(r.skillIds).toContain(C.SKILL_NEW_SUIT_1LEVEL);
  });

  it("responds 1NT with 6-10 HCP, no fit, no new suit at 1-level", async () => {
    const r = await evaluator.evaluate(
      state(),
      bid("S:52 H:K843 D:Q762 C:J43", "1NT", ["1S", "P"]),
    );
    expect(r.correctness).toBe("correct");
    expect(r.bestAction).toBe("1NT");
    expect(r.skillIds).toContain(C.SKILL_RESPONSE_1M_NT);
  });

  it("passes a response with under 6 HCP", async () => {
    const r = await evaluator.evaluate(
      state(),
      bid("S:52 H:8432 D:Q762 C:J43", "P", ["1S", "P"]),
    );
    expect(r.correctness).toBe("correct");
    expect(r.bestAction).toBe("P");
  });
});

describe("common mistakes", () => {
  it("flags opening 1NT with a 5-card major", async () => {
    const r = await evaluator.evaluate(state(), bid("S:AKJ87 H:KQ D:Q92 C:J54", "1NT"));
    expect(r.correctness).toBe("incorrect");
    expect(r.bestAction).toBe("1S");
    expect(r.severity).toBe("major");
    expect(r.explanation).toMatch(/1NT/);
  });

  it("flags opening with under 12 HCP", async () => {
    const r = await evaluator.evaluate(state(), bid("S:KQ432 H:A32 D:432 C:32", "1S"));
    expect(r.correctness).toBe("incorrect");
    expect(r.bestAction).toBe("P");
  });

  it("flags responding at the 2-level with only 6 HCP", async () => {
    const r = await evaluator.evaluate(
      state(),
      bid("S:52 H:K843 D:Q762 C:J43", "2C", ["1S", "P"]),
    );
    expect(r.correctness).toBe("incorrect");
    expect(r.bestAction).toBe("1NT");
  });

  it("treats a wrong minor as a minor suboptimal error", async () => {
    // best is 1D (4 diamonds vs 3 clubs); learner opens 1C.
    const r = await evaluator.evaluate(state(), bid("S:KQ4 H:A32 D:J985 C:Q42", "1C"));
    expect(r.correctness).toBe("suboptimal");
    expect(r.severity).toBe("minor");
  });
});
