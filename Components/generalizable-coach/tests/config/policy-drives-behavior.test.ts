/**
 * M2 headline gate — policy drives behavior (B2).
 *
 * The SAME learner action produces different coach behavior under a `socratic`
 * vs. a `direct` profile — question-form vs. a higher hint level — proving the
 * difference is driven by the deterministic policy engine, not prompt text.
 */
import { describe, it, expect } from "vitest";
import { resolvePolicy } from "../../platform/config/index.js";
import { decideIntervention } from "../../platform/policy/index.js";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/index.js";
import type { CoachingPolicyProfile } from "../../contracts/index.js";
import type { EvaluationResult } from "../../platform/types/index.js";

function profile(questioningStyle: "socratic" | "direct"): CoachingPolicyProfile {
  return {
    schemaVersion: CONTRACTS_SCHEMA_VERSION,
    profileId: `cpp.${questioningStyle}`,
    displayName: questioningStyle,
    questioningStyle,
    interventionPolicy: { maxHintLevel: 4, interruptionTolerance: "medium" },
  };
}

// One and the same learner action: an incorrect, major-severity choice.
const evaluation: EvaluationResult = {
  correctness: "incorrect",
  confidence: 1,
  conceptIds: ["concept.opening_bid"],
  skillIds: ["skill.opening_1nt"],
  severity: "major",
};

describe("policy drives behavior", () => {
  it("socratic → question-form, capped low", () => {
    const d = decideIntervention({ evaluation, policy: resolvePolicy(profile("socratic")) });
    expect(d.shouldRespond).toBe(true);
    expect(d.responseType).toBe("question");
    expect(d.hintLevel).toBe(1);
  });

  it("direct → a higher hint level", () => {
    const d = decideIntervention({ evaluation, policy: resolvePolicy(profile("direct")) });
    expect(d.shouldRespond).toBe(true);
    expect(d.responseType).toBe("hint");
    expect(d.hintLevel).toBe(2);
  });

  it("the difference is the policy alone — same event, same engine", () => {
    const socratic = decideIntervention({ evaluation, policy: resolvePolicy(profile("socratic")) });
    const direct = decideIntervention({ evaluation, policy: resolvePolicy(profile("direct")) });
    expect(socratic.responseType).not.toBe(direct.responseType);
    expect(direct.hintLevel).toBeGreaterThan(socratic.hintLevel);
  });

  it("stays silent on a correct action regardless of style", () => {
    const correct: EvaluationResult = { ...evaluation, correctness: "correct" };
    expect(decideIntervention({ evaluation: correct, policy: resolvePolicy(profile("direct")) }).shouldRespond).toBe(false);
  });
});
