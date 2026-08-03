/**
 * M4 gate (D3) — the mastery divergence guard.
 *
 * Owlwise owns course_learning mastery; the Coach must NOT advance a second,
 * divergent skill record for a host-owned domain (mitigation for the §14.6
 * deviation). A domain the Coach owns still advances normally.
 */
import { describe, it, expect } from "vitest";
import { LearnerStore } from "../../platform/learner-model/index";
import type { EvaluationResult } from "../../platform/types/index";

const miss: EvaluationResult = {
  correctness: "incorrect",
  confidence: 1,
  conceptIds: ["concept.working_memory"],
  skillIds: ["skill.recall"],
  severity: "major",
};

describe("LearnerStore external-mastery guard", () => {
  it("does not advance mastery for a host-owned domain", () => {
    const store = new LearnerStore();
    store.createProfile("L1", "Ana", { feedbackStyle: "direct", explanationDepth: "medium" });
    store.setExternalMasteryDomains(["course_learning"]);

    store.updateSkillState("L1", "course_learning", "skill.recall", miss);

    expect(store.ownsMastery("course_learning")).toBe(false);
    const profile = store.getProfile("L1")!;
    // No skill record was created/advanced for the host-owned domain.
    expect(profile.domains["course_learning"]?.skillStates ?? []).toEqual([]);
  });

  it("still advances mastery for a Coach-owned domain", () => {
    const store = new LearnerStore();
    store.createProfile("L1", "Ana", { feedbackStyle: "direct", explanationDepth: "medium" });
    store.setExternalMasteryDomains(["course_learning"]);

    store.updateSkillState("L1", "bridge_gameplay", "skill.opening_1nt", miss);

    expect(store.ownsMastery("bridge_gameplay")).toBe(true);
    const skills = store.getProfile("L1")!.domains["bridge_gameplay"].skillStates;
    expect(skills).toHaveLength(1);
    expect(skills[0].exposureCount).toBe(1);
    expect(skills[0].mistakeCount).toBe(1);
  });
});
