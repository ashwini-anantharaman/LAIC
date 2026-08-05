import { describe, it, expect } from "vitest";
import { SessionEngine } from "./SessionEngine";
import type { ActivityEvent, AdaptiveCoachResponse } from "../types/index";

function event(eventId: string, eventType: string): ActivityEvent<any> {
  return {
    eventId,
    domainId: "bridge_gameplay",
    eventType,
    timestamp: new Date().toISOString(),
    sessionId: "s",
    actorId: "L1",
    action: { bid: "1S" },
  };
}

function response(): AdaptiveCoachResponse {
  return { type: "hint", level: 2, message: "think about your longest suit" };
}

describe("SessionEngine", () => {
  it("logs events and coach interactions across a session", () => {
    const engine = new SessionEngine();
    const session = engine.startSession("L1", "bridge_gameplay");
    expect(session.status).toBe("active");

    engine.logEvent(session.sessionId, event("e1", "bid_made"));
    engine.logEvent(session.sessionId, event("e2", "hint_requested"));
    engine.logEvent(session.sessionId, event("e3", "bid_made"));
    engine.logCoachInteraction(session.sessionId, "e1", response());
    engine.logCoachInteraction(session.sessionId, "e2", response());

    const ended = engine.endSession(session.sessionId);
    expect(ended.status).toBe("completed");
    expect(ended.endedAt).toBeTruthy();
    expect(ended.events).toHaveLength(3);
    expect(ended.coachInteractions).toHaveLength(2);
    expect(ended.coachInteractions[0].triggerEventId).toBe("e1");
  });

  it("returns sessions by learner", () => {
    const engine = new SessionEngine();
    const s1 = engine.startSession("L1", "bridge_gameplay");
    engine.startSession("L2", "bridge_gameplay");
    const s3 = engine.startSession("L1", "bridge_gameplay");

    const learnerSessions = engine.getSessionsByLearner("L1");
    const ids = learnerSessions.map((s) => s.sessionId).sort();
    expect(ids).toEqual([s1.sessionId, s3.sessionId].sort());
  });

  it("throws when logging to an unknown session", () => {
    const engine = new SessionEngine();
    expect(() => engine.logEvent("ghost", event("e1", "bid_made"))).toThrow();
  });
});
