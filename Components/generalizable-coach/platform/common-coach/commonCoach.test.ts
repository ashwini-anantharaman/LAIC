import { describe, it, expect } from "vitest";
import {
  detectWeakSkills,
  recommendNextSkill,
  summarizeLearner,
} from "./index.js";
import type { DomainLearnerState, LearnerProfile, SkillState } from "../learner-model/types.js";

function skill(over: Partial<SkillState> & { skillId: string }): SkillState {
  return {
    mastery: "practicing",
    exposureCount: 0,
    correctCount: 0,
    mistakeCount: 0,
    lastPracticedAt: "",
    ...over,
  };
}

function domain(skills: SkillState[], recentConcepts: string[] = []): DomainLearnerState {
  return {
    currentLevel: "beginner_1",
    currentLearningGoal: "Opening bids",
    skillStates: skills,
    recentMistakes: recentConcepts.map((conceptId) => ({
      timestamp: "",
      conceptId,
      skillId: "",
      eventId: "",
      severity: "major",
    })),
    sessionsCompleted: 0,
    lastSessionAt: "",
  };
}

describe("detectWeakSkills", () => {
  it("selects practiced, sub-60%, non-mastered skills, weakest first", () => {
    const A = skill({ skillId: "A", exposureCount: 10, correctCount: 3, mistakeCount: 7 }); // 30%
    const B = skill({ skillId: "B", exposureCount: 5, correctCount: 4, mistakeCount: 1 }); // 80% (not weak)
    const C = skill({ skillId: "C", exposureCount: 2, correctCount: 0, mistakeCount: 2 }); // 0%
    const weak = detectWeakSkills(domain([A, B, C]));
    expect(weak.map((w) => w.skillId)).toEqual(["C", "A"]); // C is weaker → first
    expect(weak.find((w) => w.skillId === "B")).toBeUndefined();
  });

  it("excludes mastered skills and unpracticed skills", () => {
    const mastered = skill({ skillId: "M", exposureCount: 20, correctCount: 20, mastery: "mastered" });
    const unpracticed = skill({ skillId: "U", exposureCount: 0 });
    expect(detectWeakSkills(domain([mastered, unpracticed]))).toEqual([]);
  });
});

describe("recommendNextSkill", () => {
  it("reinforces the weakest skill when one exists", () => {
    const A = skill({ skillId: "A", exposureCount: 10, correctCount: 2, mistakeCount: 8 });
    const rec = recommendNextSkill(domain([A]));
    expect(rec.kind).toBe("reinforce_weak");
    expect(rec.skillId).toBe("A");
  });

  it("builds up a started-but-not-proficient skill when nothing is weak", () => {
    const B = skill({ skillId: "B", exposureCount: 4, correctCount: 4, mastery: "practicing" });
    const rec = recommendNextSkill(domain([B]));
    expect(rec.kind).toBe("build_up");
    expect(rec.skillId).toBe("B");
  });

  it("suggests exploring when everything is proficient/mastered", () => {
    const P = skill({ skillId: "P", exposureCount: 12, correctCount: 11, mastery: "proficient" });
    const rec = recommendNextSkill(domain([P]));
    expect(rec.kind).toBe("explore");
    expect(rec.skillId).toBeNull();
  });
});

describe("summarizeLearner", () => {
  it("names the weakest skill and the recurring mistake concept", () => {
    const profile: LearnerProfile = {
      learnerId: "L1",
      name: "Alice",
      createdAt: "",
      preferences: { feedbackStyle: "gentle", explanationDepth: "short" },
      domains: {
        d1: domain(
          [skill({ skillId: "A", exposureCount: 10, correctCount: 2, mistakeCount: 8 })],
          ["CONCEPT_OPENING_BID", "CONCEPT_OPENING_BID", "CONCEPT_HCP"],
        ),
      },
    };
    const s = summarizeLearner(profile, "d1");
    expect(s).toContain("A");
    expect(s).toContain("CONCEPT_OPENING_BID");
  });

  it("handles a fresh learner", () => {
    const profile: LearnerProfile = {
      learnerId: "L1",
      name: "Alice",
      createdAt: "",
      preferences: { feedbackStyle: "gentle", explanationDepth: "short" },
      domains: {},
    };
    expect(summarizeLearner(profile, "d1")).toMatch(/No practice/i);
  });
});
