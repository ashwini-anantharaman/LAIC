import { describe, it, expect } from "vitest";
import { DealGenerator } from "./DealGenerator";
import { BridgeEvaluator } from "./evaluator/BridgeEvaluator";
import * as C from "./plugin/constants";
import type { BridgeGameState } from "./plugin/events";

const evaluator = new BridgeEvaluator();
const gen = new DealGenerator(evaluator);

function state(hands: Record<string, string>, auction: string[]): BridgeGameState {
  return {
    dealId: "d",
    dealer: "N",
    vulnerability: "None",
    hands,
    auctionSoFar: auction,
    currentPhase: "bidding",
  };
}

describe("DealGenerator", () => {
  it("generates an opening deal whose expectedBid the evaluator confirms", async () => {
    const deal = await gen.generateOpeningBidDeal();
    const res = await evaluator.evaluate(state(deal.hands, []), {
      bid: deal.expectedBid,
      position: "S",
      hand: deal.hands.S,
      auctionSoFar: [],
    });
    expect(res.correctness).toBe("correct");
  });

  it("generates a deal targeting SKILL_OPENING_1SUIT", async () => {
    const deal = await gen.generateOpeningBidDeal(C.SKILL_OPENING_1SUIT);
    expect(deal.targetSkill).toBe(C.SKILL_OPENING_1SUIT);
    expect(deal.expectedBid).toMatch(/^1(NT|[CDHS])$/); // opening skill covers 1m/1M/1NT families
    const res = await evaluator.evaluate(state(deal.hands, []), {
      bid: deal.expectedBid,
      position: "S",
      hand: deal.hands.S,
      auctionSoFar: [],
    });
    expect(res.correctness).toBe("correct");
    expect(res.skillIds).toContain(C.SKILL_OPENING_1SUIT);
  });

  it("generates a response deal to 1S the evaluator confirms", async () => {
    const deal = await gen.generateResponseDeal("1S");
    const auction = ["1S", "P"];
    // North really opens 1S
    const north = await evaluator.evaluate(state(deal.hands, []), {
      bid: "1S",
      position: "N",
      hand: deal.hands.N,
      auctionSoFar: [],
    });
    expect(north.bestAction).toBe("1S");
    // South's expected response is correct
    const south = await evaluator.evaluate(state(deal.hands, auction), {
      bid: deal.expectedBid,
      position: "S",
      hand: deal.hands.S,
      auctionSoFar: auction,
    });
    expect(south.correctness).toBe("correct");
  });
});
