/**
 * M1 gate — domain isolation (A3, CRITICAL, LAIC §16.4).
 *
 * A learner with skills in two domains (bridge + Brain Bee) must project into
 * domain-filtered views that never leak each other's skills. Cross-domain
 * awareness is provably OFF unless explicitly enabled. This is the isolation
 * guarantee the plan says to lock in before any UI exists.
 */
import { describe, it, expect } from "vitest";
import { openCoachSession } from "../../platform/adaptive/index.js";
import { LearnerStore } from "../../platform/learner-model/index.js";
import { validate } from "../../contracts/index.js";
import type { EvaluationResult } from "../../platform/types/index.js";

const BRIDGE = "bridge_gameplay";
const BRAINBEE = "brainbee";

function result(conceptId: string, skillId: string): EvaluationResult {
  return { correctness: "incorrect", confidence: 1, conceptIds: [conceptId], skillIds: [skillId], severity: "major" };
}

function seed(): LearnerStore {
  const store = new LearnerStore();
  store.createProfile("L1", "Alice", { feedbackStyle: "gentle", explanationDepth: "short" });
  store.updateSkillState("L1", BRIDGE, "skill.opening_1nt", result("concept.opening_bid", "skill.opening_1nt"));
  store.updateSkillState("L1", BRAINBEE, "skill.recall", result("concept.memory_consolidation", "skill.recall"));
  return store;
}

describe("domain isolation", () => {
  it("projects each domain's skills without leaking the other's", () => {
    const store = seed();

    const bridge = store.getLearnerDomainProfile("L1", BRIDGE);
    const brainbee = store.getLearnerDomainProfile("L1", BRAINBEE);

    const bridgeSkills = bridge.skillStates.map((s) => s.skillId);
    const brainbeeSkills = brainbee.skillStates.map((s) => s.skillId);

    expect(bridgeSkills).toContain("skill.opening_1nt");
    expect(bridgeSkills).not.toContain("skill.recall"); // Brain Bee skill must NOT appear here

    expect(brainbeeSkills).toContain("skill.recall");
    expect(brainbeeSkills).not.toContain("skill.opening_1nt"); // Bridge skill must NOT appear here

    expect(validate("LearnerDomainProfile", bridge).valid).toBe(true);
    expect(validate("LearnerDomainProfile", brainbee).valid).toBe(true);
  });

  it("lists a learner's domains for cross-scope use", () => {
    const store = seed();
    expect(store.listLearnerDomains("L1").sort()).toEqual([BRAINBEE, BRIDGE].sort());
  });

  it("keeps cross-domain awareness off by default, on only when the flag is set", () => {
    const store = seed();

    const isolated = openCoachSession({ learnerId: "L1", domainId: BRIDGE, learnerStore: store });
    expect(isolated.commonCoachPackage.crossScopeAwareness).toEqual([]);

    const aware = openCoachSession({
      learnerId: "L1",
      domainId: BRIDGE,
      learnerStore: store,
      crossScopeAwareness: true,
    });
    expect(aware.commonCoachPackage.crossScopeAwareness).toEqual([BRAINBEE]);
  });
});
