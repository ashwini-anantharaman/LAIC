/**
 * M2 gate — capability-scope enforcement (B3).
 *
 * A disabled capability is STRUCTURALLY unavailable: a decision that would need
 * it is downgraded to silent, so the coach can never produce it — not merely
 * discouraged from doing so.
 */
import { describe, it, expect } from "vitest";
import { resolvePolicy } from "../../platform/config/index";
import {
  decideIntervention,
  applyCapabilityScope,
  defaultCapabilityScope,
} from "../../platform/policy/index";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/index";
import type { CoachingPolicyProfile, CoachCapabilityScope } from "../../contracts/index";
import type { EvaluationResult } from "../../platform/types/index";

const evaluation: EvaluationResult = {
  correctness: "incorrect",
  confidence: 1,
  conceptIds: ["c"],
  skillIds: ["s"],
  severity: "major",
};

function profile(questioningStyle: "socratic" | "direct"): CoachingPolicyProfile {
  return {
    schemaVersion: CONTRACTS_SCHEMA_VERSION,
    profileId: "cpp",
    displayName: "x",
    questioningStyle,
    interventionPolicy: { maxHintLevel: 4 },
  };
}

const scope = (overrides: Partial<CoachCapabilityScope>): CoachCapabilityScope => ({
  ...defaultCapabilityScope(),
  ...overrides,
});

describe("capability scope", () => {
  it("blocks a hint when canGenerateHints is disabled → silent", () => {
    const decision = decideIntervention({ evaluation, policy: resolvePolicy(profile("direct")) });
    expect(decision.responseType).toBe("hint"); // would be a hint

    const enforced = applyCapabilityScope(decision, scope({ canGenerateHints: false }));
    expect(enforced.shouldRespond).toBe(false);
    expect(enforced.responseType).toBe("silent");
    expect(enforced.reason).toMatch(/canGenerateHints disabled/);
  });

  it("blocks a socratic question when canAskSocraticQuestions is disabled → silent", () => {
    const decision = decideIntervention({ evaluation, policy: resolvePolicy(profile("socratic")) });
    expect(decision.responseType).toBe("question");

    const enforced = applyCapabilityScope(decision, scope({ canAskSocraticQuestions: false }));
    expect(enforced.responseType).toBe("silent");
  });

  it("passes the decision through when the capability is enabled", () => {
    const decision = decideIntervention({ evaluation, policy: resolvePolicy(profile("direct")) });
    const enforced = applyCapabilityScope(decision, defaultCapabilityScope());
    expect(enforced).toEqual(decision);
  });
});
