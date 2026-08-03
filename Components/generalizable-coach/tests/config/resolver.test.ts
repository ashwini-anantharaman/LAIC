/**
 * M2 gate — the config resolver (B1).
 *
 * The inheritance chain flattens correctly; locked fields are not overridden by
 * lower layers; the resolved policy is stamped with the profile's id + version.
 */
import { describe, it, expect } from "vitest";
import { resolvePolicy } from "../../platform/config/index";
import { validate, CONTRACTS_SCHEMA_VERSION } from "../../contracts/index";
import type { CoachingPolicyProfile } from "../../contracts/index";

const profile: CoachingPolicyProfile = {
  schemaVersion: CONTRACTS_SCHEMA_VERSION,
  profileId: "cpp.test",
  displayName: "Test",
  questioningStyle: "socratic",
  interventionPolicy: {
    maxHintLevel: 3,
    feedbackStyle: "gentle",
    interruptionTolerance: "medium",
  },
  lockedFields: ["maxHintLevel"],
};

describe("resolvePolicy", () => {
  it("flattens the chain and produces a valid, stamped CoachingPolicy", () => {
    const policy = resolvePolicy(profile);
    expect(policy.maxHintLevel).toBe(3); // from the profile, overriding the default (4)
    expect(policy.questioningStyle).toBe("socratic");
    expect(policy.interventionMode).toBe("on_demand"); // inherited from the platform default
    expect(policy.provenance).toEqual({ profileId: "cpp.test", schemaVersion: CONTRACTS_SCHEMA_VERSION });
    expect(validate("CoachingPolicy", policy).errors).toEqual([]);
  });

  it("does not let a lower layer override a locked field, but allows unlocked ones", () => {
    const policy = resolvePolicy(profile, [
      { name: "course", values: { maxHintLevel: 5, feedbackStyle: "direct" } },
    ]);
    expect(policy.maxHintLevel).toBe(3); // locked — course's 5 is ignored
    expect(policy.feedbackStyle).toBe("direct"); // not locked — course wins over the profile
  });

  it("lets lower layers override unlocked fields in chain order", () => {
    const policy = resolvePolicy(
      { ...profile, lockedFields: [] },
      [
        { name: "course", values: { maxHintLevel: 5 } },
        { name: "session", values: { maxHintLevel: 2 } },
      ],
    );
    expect(policy.maxHintLevel).toBe(2); // last (lowest) layer wins when nothing is locked
  });
});
