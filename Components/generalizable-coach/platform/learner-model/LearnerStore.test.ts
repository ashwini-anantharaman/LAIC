import { describe, it, expect } from "vitest";
import { LearnerStore, computeMastery } from "./LearnerStore";
import type { EvaluationResult } from "../types/index";
import type { SkillState } from "./types";

const DOMAIN = "bridge_gameplay";
const SKILL = "SKILL_OPENING_1SUIT";

function correct(): EvaluationResult {
  return {
    correctness: "correct",
    confidence: 1,
    conceptIds: ["CONCEPT_OPENING_BID"],
    skillIds: [SKILL],
    severity: "minor",
  };
}

function incorrect(): EvaluationResult {
  return {
    correctness: "incorrect",
    confidence: 1,
    conceptIds: ["CONCEPT_OPENING_BID"],
    skillIds: [SKILL],
    severity: "major",
  };
}

function mkSkill(exposure: number, correctCount: number): SkillState {
  return {
    skillId: SKILL,
    mastery: "not_started",
    exposureCount: exposure,
    correctCount,
    mistakeCount: exposure - correctCount,
    lastPracticedAt: "",
  };
}

describe("computeMastery", () => {
  it("not_started with zero exposure", () => {
    expect(computeMastery(mkSkill(0, 0))).toBe("not_started");
  });
  it("introduced after first exposure", () => {
    expect(computeMastery(mkSkill(1, 1))).toBe("introduced");
    expect(computeMastery(mkSkill(2, 0))).toBe("introduced");
  });
  it("practicing after 3 exposures", () => {
    expect(computeMastery(mkSkill(3, 3))).toBe("practicing");
    expect(computeMastery(mkSkill(9, 9))).toBe("practicing"); // <10 exposures
  });
  it("proficient at >70% over 10+", () => {
    expect(computeMastery(mkSkill(10, 8))).toBe("proficient"); // 80%
    expect(computeMastery(mkSkill(10, 7))).toBe("practicing"); // exactly 70%, not >70
  });
  it("mastered at >90% over 20+", () => {
    expect(computeMastery(mkSkill(20, 19))).toBe("mastered"); // 95%
    expect(computeMastery(mkSkill(20, 18))).toBe("proficient"); // 90%, not >90
  });
});

describe("LearnerStore", () => {
  it("creates and fetches a profile", () => {
    const store = new LearnerStore();
    expect(store.getProfile("L1")).toBeNull();
    const p = store.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    expect(p.learnerId).toBe("L1");
    expect(store.getProfile("L1")).toEqual(p);
  });

  it("increments exposure and correct counts on a correct evaluation", () => {
    const store = new LearnerStore();
    store.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    store.updateSkillState("L1", DOMAIN, SKILL, correct());
    const skill = store.getProfile("L1")!.domains[DOMAIN].skillStates[0];
    expect(skill.exposureCount).toBe(1);
    expect(skill.correctCount).toBe(1);
    expect(skill.mistakeCount).toBe(0);
    expect(skill.mastery).toBe("introduced");
  });

  it("records mistakes (capped at 20, most recent first)", () => {
    const store = new LearnerStore();
    store.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    for (let i = 0; i < 25; i++) {
      store.updateSkillState("L1", DOMAIN, SKILL, incorrect());
    }
    const domain = store.getProfile("L1")!.domains[DOMAIN];
    expect(domain.recentMistakes.length).toBe(20);
    const skill = domain.skillStates[0];
    expect(skill.exposureCount).toBe(25);
    expect(skill.mistakeCount).toBe(25);
  });

  it("progresses mastery across many correct evaluations", () => {
    const store = new LearnerStore();
    store.createProfile("L1", "Alice", {
      feedbackStyle: "gentle",
      explanationDepth: "short",
    });
    for (let i = 0; i < 25; i++) {
      store.updateSkillState("L1", DOMAIN, SKILL, correct());
    }
    const skill = store.getProfile("L1")!.domains[DOMAIN].skillStates[0];
    expect(skill.mastery).toBe("mastered");
  });

  it("throws when updating an unknown learner", () => {
    const store = new LearnerStore();
    expect(() =>
      store.updateSkillState("ghost", DOMAIN, SKILL, correct()),
    ).toThrow();
  });

  it("assembles a valid CommonCoachPackage", () => {
    const store = new LearnerStore();
    store.createProfile("L1", "Alice", {
      feedbackStyle: "socratic",
      explanationDepth: "medium",
    });
    store.updateSkillState("L1", DOMAIN, SKILL, incorrect());
    const pkg = store.getCommonCoachPackage("L1", DOMAIN);
    expect(pkg.learner.learnerId).toBe("L1");
    expect(pkg.learner.skillLevel).toBe("beginner");
    expect(pkg.learner.preferences.feedbackStyle).toBe("socratic");
    expect(pkg.learningState.currentDomainId).toBe(DOMAIN);
    expect(pkg.learningState.weakSkills).toContain(SKILL);
    expect(pkg.learningState.recentMistakes).toContain("CONCEPT_OPENING_BID");
    expect(pkg.coachingPolicy.maxHintLevel).toBe(4);
  });
});
