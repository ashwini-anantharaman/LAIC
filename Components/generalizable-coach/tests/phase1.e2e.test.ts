/**
 * Phase 1 — end-to-end coaching loop.
 *
 * Simulates a full Beginner 1 session: multiple hands, correct and incorrect
 * bids, hint escalation, repeated-mistake detection, and a response scenario.
 * The LLM is mocked to return level-tagged strings so we can assert the right
 * hint level flowed through the pipeline.
 */
import { describe, it, expect } from "vitest";
import {
  buildBridgeCoach,
  MockLLM,
  type BridgeCoach,
} from "../domains/bridge/coaching/index.js";
import {
  BRIDGE_DOMAIN_ID,
  SKILL_OPENING_1SUIT,
  SKILL_SIMPLE_RAISE,
  CONCEPT_OPENING_BID,
} from "../domains/bridge/plugin/constants.js";
import type { ActivityEvent } from "../platform/types/index.js";
import type {
  BridgeBidAction,
  BridgeGameState,
} from "../domains/bridge/plugin/events.js";

let eventCounter = 0;

function makeBidEvent(
  sessionId: string,
  hand: string,
  bid: string,
  auction: string[] = [],
): { event: ActivityEvent<BridgeBidAction>; state: BridgeGameState } {
  const action: BridgeBidAction = {
    bid,
    position: "S",
    hand,
    auctionSoFar: auction,
  };
  const event: ActivityEvent<BridgeBidAction> = {
    eventId: `evt_${++eventCounter}`,
    domainId: BRIDGE_DOMAIN_ID,
    eventType: "bid_made",
    timestamp: new Date().toISOString(),
    sessionId,
    actorId: "L1",
    action,
  };
  const state: BridgeGameState = {
    dealId: `deal_${eventCounter}`,
    dealer: auction.length ? "N" : "S",
    vulnerability: "None",
    hands: { S: hand },
    auctionSoFar: auction,
    currentPhase: "bidding",
  };
  return { event, state };
}

function makeHintEvent(sessionId: string): ActivityEvent<any> {
  return {
    eventId: `evt_${++eventCounter}`,
    domainId: BRIDGE_DOMAIN_ID,
    eventType: "hint_requested",
    timestamp: new Date().toISOString(),
    sessionId,
    actorId: "L1",
    action: {},
  };
}

function skill(coach: BridgeCoach, skillId: string) {
  return coach.learnerStore
    .getProfile("L1")!
    .domains[BRIDGE_DOMAIN_ID]?.skillStates.find((s) => s.skillId === skillId);
}

describe("Phase 1 end-to-end coaching loop", () => {
  it("coaches a full Beginner 1 session across five scenarios", async () => {
    // --- Setup ------------------------------------------------------------
    const coach = buildBridgeCoach({ llm: new MockLLM() });
    coach.learnerStore.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    const session = coach.sessionEngine.startSession("L1", BRIDGE_DOMAIN_ID);
    const sid = session.sessionId;

    // --- Scenario A — correct bid → coach stays silent -------------------
    {
      const { event, state } = makeBidEvent(sid, "S:AKJ87 H:Q4 D:K92 C:J54", "1S");
      const res = await coach.runtime.processEvent(event, state);
      expect(res.type).toBe("silent");
      const s = skill(coach, SKILL_OPENING_1SUIT)!;
      expect(s.exposureCount).toBe(1);
      expect(s.correctCount).toBe(1);
    }

    // --- Scenario B — incorrect bid → coach hints at level 2 -------------
    {
      const { event, state } = makeBidEvent(sid, "S:KQ874 H:A3 D:K92 C:J54", "1NT");
      const res = await coach.runtime.processEvent(event, state);
      expect(res.type).toBe("hint");
      expect(res.level).toBe(2);
      expect(res.metadata?.relatedConceptIds).toContain(CONCEPT_OPENING_BID);
      const s = skill(coach, SKILL_OPENING_1SUIT)!;
      expect(s.mistakeCount).toBe(1);
    }

    // --- Scenario C — hint escalation (2 → 3 → 4) ------------------------
    {
      const first = await coach.runtime.processEvent(makeHintEvent(sid), {});
      expect(first.level).toBe(3);
      const second = await coach.runtime.processEvent(makeHintEvent(sid), {});
      expect(second.level).toBe(4); // caps at maxHintLevel (4)
    }

    // --- Scenario D — repeated mistake detection -------------------------
    {
      // Same concept (opening bid) as Scenario B, so the engine should
      // escalate beyond the first-time default of level 2.
      const { event, state } = makeBidEvent(sid, "S:5 H:AKQ74 D:J92 C:K854", "1C");
      const res = await coach.runtime.processEvent(event, state);
      expect(res.type).toBe("hint");
      expect(res.level).toBeGreaterThan(2); // escalated due to repeated concept
    }

    // --- Scenario E — correct response to partner's opening --------------
    {
      const { event, state } = makeBidEvent(
        sid,
        "S:Q93 H:K74 D:J852 C:T63",
        "2S",
        ["1S", "P"],
      );
      const res = await coach.runtime.processEvent(event, state);
      expect(res.type).toBe("silent");
      const s = skill(coach, SKILL_SIMPLE_RAISE)!;
      expect(s.exposureCount).toBe(1);
      expect(s.correctCount).toBe(1);
    }

    // --- Teardown ---------------------------------------------------------
    const ended = coach.sessionEngine.endSession(sid);
    expect(ended.status).toBe("completed");
    // 3 bid events + 2 hint requests + 1 correct-response bid = 6 events
    expect(ended.events.length).toBe(6);
    // coach spoke for: B, C(x2), D = 4 interactions (A and E were silent)
    expect(ended.coachInteractions.length).toBe(4);

    // Cumulative learner model
    const opening = skill(coach, SKILL_OPENING_1SUIT)!;
    expect(opening.exposureCount).toBe(3); // A + B + D
    expect(opening.correctCount).toBe(1);
    expect(opening.mistakeCount).toBe(2);
  });
});
