/**
 * Bridge integration test for the platform pipeline.
 *
 * Lives in the bridge domain (not platform/) on purpose: it wires the generic
 * AdaptiveCoachRuntime together with the *bridge* plugin/evaluator/knowledge
 * and asserts end-to-end behavior. The platform core itself is proven
 * domain-agnostic by platform/coach-runtime/genericDomain.test.ts, which
 * imports no domain. Keeping this here is what lets platform/ depend on no
 * domain at all.
 */
import { describe, it, expect } from "vitest";
import { buildBridgeCoach, MockLLM } from "./index";
import { BRIDGE_DOMAIN_ID, SKILL_OPENING_1SUIT } from "../plugin/constants";
import type { ActivityEvent } from "../../../platform/types/index";
import type { BridgeBidAction, BridgeGameState } from "../plugin/events";

let counter = 0;
function bidEvent(
  sessionId: string,
  hand: string,
  bid: string,
  auction: string[] = [],
): ActivityEvent<BridgeBidAction> {
  return {
    eventId: `e${++counter}`,
    domainId: BRIDGE_DOMAIN_ID,
    eventType: "bid_made",
    timestamp: new Date().toISOString(),
    sessionId,
    actorId: "L1",
    action: { bid, position: "S", hand, auctionSoFar: auction },
  };
}

function hintEvent(sessionId: string): ActivityEvent<any> {
  return {
    eventId: `e${++counter}`,
    domainId: BRIDGE_DOMAIN_ID,
    eventType: "hint_requested",
    timestamp: new Date().toISOString(),
    sessionId,
    actorId: "L1",
    action: {},
  };
}

function gameState(hand: string, auction: string[] = []): BridgeGameState {
  return {
    dealId: "d1",
    dealer: "S",
    vulnerability: "None",
    hands: { S: hand },
    auctionSoFar: auction,
    currentPhase: "bidding",
  };
}

describe("AdaptiveCoachRuntime (pipeline)", () => {
  it("runs one event through the full pipeline and updates the learner model", async () => {
    const coach = buildBridgeCoach({ llm: new MockLLM() });
    coach.learnerStore.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    const session = coach.sessionEngine.startSession("L1", BRIDGE_DOMAIN_ID);

    // Incorrect: 1NT with a 5-card major → level-2 hint.
    const hand = "S:KQ874 H:A3 D:K92 C:J54";
    const res = await coach.runtime.processEvent(
      bidEvent(session.sessionId, hand, "1NT"),
      gameState(hand),
    );
    expect(res.type).toBe("hint");
    expect(res.level).toBe(2);
    expect(res.message).toContain("level 2");

    // Learner model recorded the mistake.
    const skill = coach.learnerStore
      .getProfile("L1")!
      .domains[BRIDGE_DOMAIN_ID].skillStates.find(
        (s) => s.skillId === SKILL_OPENING_1SUIT,
      );
    expect(skill?.exposureCount).toBe(1);
    expect(skill?.mistakeCount).toBe(1);

    // Hint request escalates to level 3.
    const hintRes = await coach.runtime.processEvent(
      hintEvent(session.sessionId),
      gameState(hand),
    );
    expect(hintRes.type).toBe("hint");
    expect(hintRes.level).toBe(3);

    // Another hint request escalates to level 4.
    const hintRes2 = await coach.runtime.processEvent(
      hintEvent(session.sessionId),
      gameState(hand),
    );
    expect(hintRes2.level).toBe(4);

    // Session logged the events + interactions.
    const logged = coach.sessionEngine.getSession(session.sessionId)!;
    expect(logged.events.length).toBe(3); // 1 bid + 2 hint requests
    expect(logged.coachInteractions.length).toBe(3);
  });

  it("stays silent on a correct bid and does not call the LLM", async () => {
    const mock = new MockLLM();
    const coach = buildBridgeCoach({ llm: mock });
    coach.learnerStore.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    const session = coach.sessionEngine.startSession("L1", BRIDGE_DOMAIN_ID);

    const hand = "S:AKJ87 H:Q4 D:K92 C:J54"; // 14 HCP, 5 spades → 1S
    const res = await coach.runtime.processEvent(
      bidEvent(session.sessionId, hand, "1S"),
      gameState(hand),
    );
    expect(res.type).toBe("silent");
    expect(mock.calls.length).toBe(0);

    const skill = coach.learnerStore
      .getProfile("L1")!
      .domains[BRIDGE_DOMAIN_ID].skillStates.find(
        (s) => s.skillId === SKILL_OPENING_1SUIT,
      );
    expect(skill?.correctCount).toBe(1);
  });
});
