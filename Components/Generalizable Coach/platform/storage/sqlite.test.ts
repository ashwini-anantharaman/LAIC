/**
 * Persistence proof: data written through the SQLite adapters is still there
 * when a fresh repo re-opens the same file (i.e. survives a "restart").
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openCoachDatabase } from "./sqlite.js";
import { LearnerStore } from "../learner-model/LearnerStore.js";
import { SessionEngine } from "../session/SessionEngine.js";
import type { ActivityEvent, EvaluationResult } from "../types/index.js";

const dbPath = join(tmpdir(), "laic-coach-persist-test.db");
function clean() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(dbPath + suffix);
    } catch {
      /* not present */
    }
  }
}

const mistake: EvaluationResult = {
  correctness: "incorrect",
  confidence: 1,
  bestAction: "1S",
  conceptIds: ["CONCEPT_OPENING_BID"],
  skillIds: ["SKILL_OPENING_1SUIT"],
  severity: "major",
};

describe("SQLite persistence", () => {
  beforeEach(clean);
  afterAll(clean);

  it("learner profile + skill state survive a reopen", () => {
    {
      const { db, learnerRepo } = openCoachDatabase(dbPath);
      const store = new LearnerStore(learnerRepo);
      store.createProfile("L1", "Alice", {
        feedbackStyle: "gentle",
        explanationDepth: "short",
      });
      store.updateSkillState("L1", "bridge_gameplay", "SKILL_OPENING_1SUIT", mistake);
      db.close();
    }
    // Fresh process would open a fresh repo on the same file:
    {
      const { db, learnerRepo } = openCoachDatabase(dbPath);
      const store = new LearnerStore(learnerRepo);
      const p = store.getProfile("L1");
      expect(p?.name).toBe("Alice");
      const skill = p?.domains["bridge_gameplay"].skillStates.find(
        (s) => s.skillId === "SKILL_OPENING_1SUIT",
      );
      expect(skill?.mistakeCount).toBe(1);
      db.close();
    }
  });

  it("session log survives a reopen", () => {
    let sid = "";
    {
      const { db, sessionStore } = openCoachDatabase(dbPath);
      const engine = new SessionEngine(sessionStore);
      const s = engine.startSession("L1", "bridge_gameplay");
      sid = s.sessionId;
      const event: ActivityEvent<any> = {
        eventId: "e1",
        domainId: "bridge_gameplay",
        eventType: "bid_made",
        timestamp: "2026-01-01T00:00:00.000Z",
        sessionId: sid,
        actorId: "L1",
        action: { bid: "1NT" },
      };
      engine.logEvent(sid, event);
      engine.endSession(sid);
      db.close();
    }
    {
      const { db, sessionStore } = openCoachDatabase(dbPath);
      const engine = new SessionEngine(sessionStore);
      const s = engine.getSession(sid);
      expect(s?.status).toBe("completed");
      expect(s?.events.length).toBe(1);
      expect(engine.getSessionsByLearner("L1").length).toBe(1);
      db.close();
    }
  });
});
