import { describe, it, expect } from "vitest";
import { generatePostmortem } from "./postmortem.js";
import type { WeakSkill } from "./index.js";
import type { Session } from "../session/SessionEngine.js";

function session(): Session {
  return {
    sessionId: "s1",
    learnerId: "L1",
    domainId: "bridge_gameplay",
    startedAt: "",
    status: "completed",
    events: [
      { eventId: "e1", eventType: "bid_made", timestamp: "", payload: {} },
      { eventId: "e2", eventType: "bid_made", timestamp: "", payload: {} },
      { eventId: "e3", eventType: "bid_made", timestamp: "", payload: {} },
    ],
    coachInteractions: [
      {
        interactionId: "i1",
        triggerEventId: "e2",
        timestamp: "",
        response: { type: "hint", level: 2, metadata: { relatedConceptIds: ["CONCEPT_OPENING_BID"] } },
      },
      {
        interactionId: "i2",
        triggerEventId: "e3",
        timestamp: "",
        response: { type: "nudge", level: 1, metadata: { relatedConceptIds: ["CONCEPT_OPENING_BID"] } },
      },
    ],
  };
}

describe("generatePostmortem", () => {
  it("summarizes actions, interventions, concepts, and suggestions", () => {
    const weak: WeakSkill[] = [
      { skillId: "SKILL_OPENING_1SUIT", accuracy: 0.3, exposureCount: 10, mistakeCount: 7, mastery: "practicing", score: 84 },
    ];
    const pm = generatePostmortem(session(), weak);
    expect(pm.actionsCount).toBe(3);
    expect(pm.interventionsCount).toBe(2);
    expect(pm.coachedConcepts).toContain("CONCEPT_OPENING_BID");
    expect(pm.byType.hint).toBe(1);
    expect(pm.byType.nudge).toBe(1);
    expect(pm.suggestions[0]).toContain("SKILL_OPENING_1SUIT");
    expect(pm.summary).toMatch(/coach stepped in 2/);
  });

  it("celebrates a clean session with no interventions", () => {
    const s = session();
    s.coachInteractions = [];
    const pm = generatePostmortem(s);
    expect(pm.interventionsCount).toBe(0);
    expect(pm.summary).toMatch(/Clean session/i);
  });
});
