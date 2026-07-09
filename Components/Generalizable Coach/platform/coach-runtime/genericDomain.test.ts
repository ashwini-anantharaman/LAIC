/**
 * Domain-agnosticism proof.
 *
 * Runs the ENTIRE platform pipeline against a synthetic, non-bridge domain
 * (the traffic-signal fixture). No import in this file — or in the fixture it
 * uses — touches `domains/`. If the platform core secretly depended on bridge,
 * these tests could not pass.
 */
import { describe, it, expect } from "vitest";
import {
  buildGenericCoach,
  signalEvent,
  hintRequest,
  GENERIC_DOMAIN_ID,
  SKILL_OBEY_SIGNAL,
} from "../__fixtures__/genericDomain.js";
import type { SignalState } from "../__fixtures__/genericDomain.js";

const red: SignalState = { signal: "red" };

describe("platform pipeline on a non-bridge domain", () => {
  it("coaches an incorrect action with a level-2 hint and records the mistake", async () => {
    const coach = buildGenericCoach();
    coach.learnerStore.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    const session = coach.sessionEngine.startSession("L1", GENERIC_DOMAIN_ID);

    // "go" on a red signal — a major error → level-2 hint.
    const res = await coach.runtime.processEvent(
      signalEvent(session.sessionId, "go"),
      red,
    );
    expect(res.type).toBe("hint");
    expect(res.level).toBe(2);
    expect(res.message).toContain("level 2");

    const skill = coach.learnerStore
      .getProfile("L1")!
      .domains[GENERIC_DOMAIN_ID].skillStates.find(
        (s) => s.skillId === SKILL_OBEY_SIGNAL,
      );
    expect(skill?.exposureCount).toBe(1);
    expect(skill?.mistakeCount).toBe(1);
  });

  it("stays silent on a correct action and never calls the LLM", async () => {
    const coach = buildGenericCoach();
    coach.learnerStore.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    const session = coach.sessionEngine.startSession("L1", GENERIC_DOMAIN_ID);

    const res = await coach.runtime.processEvent(
      signalEvent(session.sessionId, "stop"),
      red,
    );
    expect(res.type).toBe("silent");
    expect(coach.llm.calls.length).toBe(0);

    const skill = coach.learnerStore
      .getProfile("L1")!
      .domains[GENERIC_DOMAIN_ID].skillStates.find(
        (s) => s.skillId === SKILL_OBEY_SIGNAL,
      );
    expect(skill?.correctCount).toBe(1);
  });

  it("escalates hint levels on repeated hint requests at the same decision point", async () => {
    const coach = buildGenericCoach();
    coach.learnerStore.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    const session = coach.sessionEngine.startSession("L1", GENERIC_DOMAIN_ID);

    await coach.runtime.processEvent(signalEvent(session.sessionId, "go"), red);
    const h1 = await coach.runtime.processEvent(hintRequest(session.sessionId), red);
    expect(h1.level).toBe(3);
    const h2 = await coach.runtime.processEvent(hintRequest(session.sessionId), red);
    expect(h2.level).toBe(4);
  });

  it("uses the platform default PromptBuilder (no domain prompt) to source-ground the hint", async () => {
    const coach = buildGenericCoach();
    coach.learnerStore.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    const session = coach.sessionEngine.startSession("L1", GENERIC_DOMAIN_ID);

    const res = await coach.runtime.processEvent(
      signalEvent(session.sessionId, "go"),
      red,
    );
    // The level-2 hint retrieved the "rule" chunk from the synthetic package.
    expect(res.metadata?.sourceChunkIds).toContain("k2");
    // The prompt the default builder produced carried the neutral, opaque
    // activity context (no domain-specific fields hardcoded by the platform).
    expect(coach.llm.calls[0].user).toContain("Red means stop");
  });
});
