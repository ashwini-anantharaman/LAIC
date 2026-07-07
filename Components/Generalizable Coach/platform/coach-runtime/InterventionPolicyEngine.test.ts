import { describe, it, expect } from "vitest";
import {
  InterventionPolicyEngine,
  type InterventionInput,
} from "./InterventionPolicyEngine.js";
import type {
  EvaluationResult,
  CoachingPolicy,
  Correctness,
  Severity,
} from "../types/index.js";
import type { MistakeRecord } from "../learner-model/index.js";

const engine = new InterventionPolicyEngine();

const policy: CoachingPolicy = {
  maxHintLevel: 4,
  allowDirectAnswer: false,
  allowRealTimeInterruption: true,
  saveForPostmortemWhenPossible: false,
};

function evalResult(
  correctness: Correctness,
  severity: Severity,
  conceptIds = ["CONCEPT_OPENING_BID"],
): EvaluationResult {
  return {
    correctness,
    confidence: 0.9,
    conceptIds,
    skillIds: ["SKILL_OPENING_1SUIT"],
    severity,
  };
}

function mistake(conceptId: string): MistakeRecord {
  return {
    timestamp: "",
    conceptId,
    skillId: "SKILL_OPENING_1SUIT",
    eventId: "",
    severity: "major",
  };
}

function input(over: Partial<InterventionInput>): InterventionInput {
  return {
    evaluationResult: evalResult("incorrect", "major"),
    coachingPolicy: policy,
    recentMistakes: [],
    currentHintLevel: 0,
    hintRequested: false,
    ...over,
  };
}

describe("InterventionPolicyEngine", () => {
  it("stays silent on a correct action", () => {
    const d = engine.decide(input({ evaluationResult: evalResult("correct", "minor") }));
    expect(d.shouldRespond).toBe(false);
    expect(d.responseType).toBe("silent");
  });

  it("stays silent on an acceptable minor variation", () => {
    const d = engine.decide(input({ evaluationResult: evalResult("acceptable", "minor") }));
    expect(d.shouldRespond).toBe(false);
  });

  it("nudges a first-time suboptimal choice", () => {
    const d = engine.decide(input({ evaluationResult: evalResult("suboptimal", "moderate") }));
    expect(d.responseType).toBe("nudge");
    expect(d.hintLevel).toBe(1);
  });

  it("escalates a repeated suboptimal choice to a level-2 hint", () => {
    const d = engine.decide(
      input({
        evaluationResult: evalResult("suboptimal", "moderate"),
        recentMistakes: [mistake("CONCEPT_OPENING_BID")],
      }),
    );
    expect(d.responseType).toBe("hint");
    expect(d.hintLevel).toBe(2);
  });

  it("gives a level-2 hint for a first-time major error", () => {
    const d = engine.decide(input({ evaluationResult: evalResult("incorrect", "major") }));
    expect(d.responseType).toBe("hint");
    expect(d.hintLevel).toBe(2);
  });

  it("escalates a repeated critical/major error to level 3", () => {
    const d = engine.decide(
      input({
        evaluationResult: evalResult("incorrect", "critical"),
        recentMistakes: [mistake("CONCEPT_OPENING_BID")],
      }),
    );
    expect(d.hintLevel).toBe(3);
  });

  it("gives a level-1 hint for a moderate error", () => {
    const d = engine.decide(input({ evaluationResult: evalResult("incorrect", "moderate") }));
    expect(d.responseType).toBe("hint");
    expect(d.hintLevel).toBe(1);
  });

  it("nudges a minor incorrect error", () => {
    const d = engine.decide(input({ evaluationResult: evalResult("incorrect", "minor") }));
    expect(d.responseType).toBe("nudge");
    expect(d.hintLevel).toBe(1);
  });

  it("starts hint at level 1 when hint requested and none shown", () => {
    const d = engine.decide(input({ hintRequested: true, currentHintLevel: 0 }));
    expect(d.responseType).toBe("hint");
    expect(d.hintLevel).toBe(1);
    expect(d.shouldRespond).toBe(true);
  });

  it("escalates hint level on repeated hint requests", () => {
    const d = engine.decide(input({ hintRequested: true, currentHintLevel: 2 }));
    expect(d.hintLevel).toBe(3);
  });

  it("caps hint level at maxHintLevel", () => {
    const cappedPolicy: CoachingPolicy = { ...policy, maxHintLevel: 2 };
    const d = engine.decide(
      input({
        hintRequested: true,
        currentHintLevel: 3,
        coachingPolicy: cappedPolicy,
      }),
    );
    expect(d.hintLevel).toBe(2);
  });

  it("respects maxHintLevel for repeated critical errors", () => {
    const cappedPolicy: CoachingPolicy = { ...policy, maxHintLevel: 2 };
    const d = engine.decide(
      input({
        evaluationResult: evalResult("incorrect", "critical"),
        recentMistakes: [mistake("CONCEPT_OPENING_BID")],
        coachingPolicy: cappedPolicy,
      }),
    );
    expect(d.hintLevel).toBe(2);
  });

  it("saves for postmortem when policy prefers it and not critical", () => {
    const pmPolicy: CoachingPolicy = { ...policy, saveForPostmortemWhenPossible: true };
    const d = engine.decide(
      input({
        evaluationResult: evalResult("incorrect", "major"),
        coachingPolicy: pmPolicy,
      }),
    );
    expect(d.responseType).toBe("postmortem_note");
    expect(d.shouldRespond).toBe(false);
  });

  it("still interrupts for a critical error even with postmortem preference", () => {
    const pmPolicy: CoachingPolicy = { ...policy, saveForPostmortemWhenPossible: true };
    const d = engine.decide(
      input({
        evaluationResult: evalResult("incorrect", "critical"),
        coachingPolicy: pmPolicy,
      }),
    );
    expect(d.shouldRespond).toBe(true);
    expect(d.responseType).toBe("hint");
  });
});
