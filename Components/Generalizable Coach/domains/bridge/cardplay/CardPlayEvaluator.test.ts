import { describe, it, expect } from "vitest";
import { CardPlayEvaluator } from "./CardPlayEvaluator.js";
import { getScenario, CARD_PLAY_SCENARIOS } from "./scenarios.js";
import { RouterEvaluator } from "../evaluator/RouterEvaluator.js";
import * as C from "../plugin/constants.js";
import type { CardPlayScenario, CardPlayAction } from "./types.js";

const evaluator = new CardPlayEvaluator();

function playCard(scenario: CardPlayScenario, card: string): CardPlayAction {
  return { card, position: scenario.playFromSeat, scenarioId: scenario.scenarioId };
}

describe("CardPlayEvaluator", () => {
  it("grades the recommended finesse card as correct", async () => {
    const s = getScenario("cp_finesse_hearts")!;
    const r = await evaluator.evaluate(s, playCard(s, "HQ"));
    expect(r.correctness).toBe("correct");
    expect(r.skillIds).toContain(C.SKILL_TAKE_FINESSE);
    expect(r.bestAction).toBe("HQ");
  });

  it("flags rising with the ace as incorrect (major)", async () => {
    const s = getScenario("cp_finesse_hearts")!;
    const r = await evaluator.evaluate(s, playCard(s, "HA"));
    expect(r.correctness).toBe("incorrect");
    expect(r.severity).toBe("major");
    expect(r.explanation).toMatch(/finesse/i);
  });

  it("accepts an acceptable alternative (second-hand-low: any small card)", async () => {
    const s = getScenario("cp_second_hand_low")!;
    const best = await evaluator.evaluate(s, playCard(s, "D3"));
    const alt = await evaluator.evaluate(s, playCard(s, "D6"));
    expect(best.correctness).toBe("correct");
    expect(alt.correctness).toBe("acceptable");
  });

  it("flags second-hand King as incorrect", async () => {
    const s = getScenario("cp_second_hand_low")!;
    const r = await evaluator.evaluate(s, playCard(s, "DK"));
    expect(r.correctness).toBe("incorrect");
    expect(r.skillIds).toContain(C.SKILL_SECOND_HAND_LOW);
  });

  it("normalizes ten as T (draw-trumps accepts the ten of trumps)", async () => {
    const s = getScenario("cp_draw_trumps")!;
    const r = await evaluator.evaluate(s, playCard(s, "S10"));
    expect(r.correctness).toBe("correct");
  });

  it("every scenario's declared best card grades as correct", async () => {
    for (const s of CARD_PLAY_SCENARIOS) {
      const r = await evaluator.evaluate(s, playCard(s, s.bestCards[0]));
      expect(r.correctness, s.scenarioId).toBe("correct");
      // and the best card must be one of the legal cards
      expect(s.legalCards.map((c) => c.toUpperCase()), s.scenarioId).toContain(
        s.bestCards[0].toUpperCase(),
      );
    }
  });
});

describe("RouterEvaluator", () => {
  const router = new RouterEvaluator();

  it("routes a card action to the card-play evaluator", async () => {
    const s = getScenario("cp_finesse_hearts")!;
    const r = await router.evaluate(s, playCard(s, "HQ"));
    expect(r.skillIds).toContain(C.SKILL_TAKE_FINESSE);
  });

  it("routes a bid action to the bidding evaluator", async () => {
    const r = await router.evaluate(
      { auctionSoFar: [] },
      { bid: "1S", position: "S", hand: "S:AKJ87 H:Q4 D:K92 C:J54", auctionSoFar: [] },
    );
    expect(r.skillIds).toContain(C.SKILL_OPENING_1SUIT);
    expect(r.correctness).toBe("correct");
  });
});
