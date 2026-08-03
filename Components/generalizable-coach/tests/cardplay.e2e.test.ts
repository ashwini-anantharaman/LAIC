/**
 * End-to-end card-play coaching: a wrong card during the play of the hand
 * flows through the same AdaptiveCoachRuntime, produces a hint, updates the
 * card-play skill, and escalates on hint requests.
 */
import { describe, it, expect } from "vitest";
import { buildBridgeCoach, MockLLM } from "../domains/bridge/coaching/index";
import { getScenario } from "../domains/bridge/cardplay/index";
import { BRIDGE_DOMAIN_ID, SKILL_TAKE_FINESSE } from "../domains/bridge/plugin/constants";
import type { ActivityEvent } from "../platform/types/index";

let n = 0;
function cardEvent(sessionId: string, scenarioId: string, card: string, seat: any): ActivityEvent<any> {
  return {
    eventId: `cp_${++n}`,
    domainId: BRIDGE_DOMAIN_ID,
    eventType: "card_played",
    timestamp: new Date().toISOString(),
    sessionId,
    actorId: "L1",
    action: { card, position: seat, scenarioId },
  };
}
function hintEvent(sessionId: string): ActivityEvent<any> {
  return {
    eventId: `cp_${++n}`,
    domainId: BRIDGE_DOMAIN_ID,
    eventType: "hint_requested",
    timestamp: new Date().toISOString(),
    sessionId,
    actorId: "L1",
    action: {},
  };
}

describe("Card-play coaching end to end", () => {
  it("hints on a wrong finesse card, updates the skill, escalates hints", async () => {
    const coach = buildBridgeCoach({ llm: new MockLLM() });
    coach.learnerStore.createProfile("L1", "Alice", {
      feedbackStyle: "socratic",
      explanationDepth: "short",
    });
    const session = coach.sessionEngine.startSession("L1", BRIDGE_DOMAIN_ID);
    const scenario = getScenario("cp_finesse_hearts")!;

    // Wrong play: rising with the Ace (major error) → level-2 hint.
    const res = await coach.runtime.processEvent(
      cardEvent(session.sessionId, scenario.scenarioId, "HA", scenario.playFromSeat),
      scenario,
    );
    expect(res.type).toBe("hint");
    expect(res.level).toBe(2);
    expect(res.metadata?.relatedSkillIds).toContain(SKILL_TAKE_FINESSE);

    const skill = coach.learnerStore
      .getProfile("L1")!
      .domains[BRIDGE_DOMAIN_ID].skillStates.find((s) => s.skillId === SKILL_TAKE_FINESSE);
    expect(skill?.exposureCount).toBe(1);
    expect(skill?.mistakeCount).toBe(1);

    // Hint escalation on the same decision point.
    const h1 = await coach.runtime.processEvent(hintEvent(session.sessionId), {});
    expect(h1.level).toBe(3);
    const h2 = await coach.runtime.processEvent(hintEvent(session.sessionId), {});
    expect(h2.level).toBe(4);
  });

  it("stays silent when the learner finds the recommended play", async () => {
    const mock = new MockLLM();
    const coach = buildBridgeCoach({ llm: mock });
    coach.learnerStore.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    const session = coach.sessionEngine.startSession("L1", BRIDGE_DOMAIN_ID);
    const scenario = getScenario("cp_second_hand_low")!;

    const res = await coach.runtime.processEvent(
      cardEvent(session.sessionId, scenario.scenarioId, "D3", scenario.playFromSeat),
      scenario,
    );
    expect(res.type).toBe("silent");
    expect(mock.calls.length).toBe(0);
  });
});
