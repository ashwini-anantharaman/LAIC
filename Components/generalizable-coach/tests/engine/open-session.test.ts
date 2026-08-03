/**
 * M1 gate — open a coaching session (A4).
 *
 * openCoachSession({learnerId, domainId}) returns a session carrying a Common
 * Coach Package (a domain-filtered LearnerDomainProfile + resolved policy),
 * with a KnowledgeSource bound. The pipeline inside is a stub in M1.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { openCoachSession } from "../../platform/adaptive/index";
import { LearnerStore } from "../../platform/learner-model/index";
import { BundledKnowledgeSource } from "../../platform/knowledge-source/index";
import { validate } from "../../contracts/index";
import type { EvaluationResult } from "../../platform/types/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const bridgePkg = JSON.parse(
  readFileSync(path.join(here, "..", "..", "fixtures", "knowledge", "bridge-sample.package.json"), "utf8"),
);

const incorrectBid: EvaluationResult = {
  correctness: "incorrect",
  confidence: 1,
  conceptIds: ["concept.opening_bid"],
  skillIds: ["skill.opening_1nt"],
  severity: "major",
};

describe("openCoachSession", () => {
  it("returns a session carrying a Common Coach Package", () => {
    const store = new LearnerStore();
    store.createProfile("L1", "Alice", { feedbackStyle: "gentle", explanationDepth: "short" });
    store.updateSkillState("L1", "bridge_gameplay", "skill.opening_1nt", incorrectBid);

    const session = openCoachSession({
      learnerId: "L1",
      domainId: "bridge_gameplay",
      learnerStore: store,
      knowledgeSource: new BundledKnowledgeSource(bridgePkg),
    });

    expect(session.learnerId).toBe("L1");
    expect(session.domainId).toBe("bridge_gameplay");
    expect(session.pipeline).toBe("stub");
    expect(session.knowledgeSource).toBeTruthy();

    const pkg = session.commonCoachPackage;
    expect(pkg.domainProfile.domainId).toBe("bridge_gameplay");
    expect(pkg.domainProfile.skillStates.some((s) => s.skillId === "skill.opening_1nt")).toBe(true);
    expect(pkg.resolvedPolicy.maxHintLevel).toBe(4);
    expect(pkg.resolvedPolicy.interventionMode).toBe("on_demand");

    // The projected profile and resolved policy conform to the M0 contracts.
    expect(validate("LearnerDomainProfile", pkg.domainProfile).errors).toEqual([]);
    expect(validate("CoachingPolicy", pkg.resolvedPolicy).errors).toEqual([]);
  });

  it("opens for a brand-new learner with an empty profile", () => {
    const session = openCoachSession({ learnerId: "new", domainId: "bridge_gameplay" });
    expect(session.commonCoachPackage.domainProfile.skillStates).toEqual([]);
    expect(session.domainRegistered).toBe(false);
  });

  it("keeps cross-domain awareness off by default", () => {
    const store = new LearnerStore();
    store.createProfile("L1", "Alice", { feedbackStyle: "gentle", explanationDepth: "short" });
    store.updateSkillState("L1", "bridge_gameplay", "skill.opening_1nt", incorrectBid);
    store.updateSkillState("L1", "brainbee", "skill.recall", { ...incorrectBid, conceptIds: ["concept.memory_consolidation"], skillIds: ["skill.recall"] });

    const session = openCoachSession({ learnerId: "L1", domainId: "bridge_gameplay", learnerStore: store });
    expect(session.commonCoachPackage.crossScopeAwareness).toEqual([]);
  });
});
