/**
 * M0 gate — schema validation.
 *
 * Valid objects pass; malformed ones fail; each of the eight core schemas is
 * present and round-trips a minimal valid instance. Asserts the schemaVersion
 * field is required on every contract (DoD: "versioned with a schemaVersion").
 */
import { describe, it, expect } from "vitest";
import { validate, schemas, CONTRACTS_SCHEMA_VERSION } from "../../contracts/index.js";

const V = CONTRACTS_SCHEMA_VERSION;

const CORE = [
  "ActivityEvent",
  "KnowledgeChunk",
  "CoachProfile",
  "CoachingPolicy",
  "KnowledgeScope",
  "Recommendation",
  "LearnerDomainProfile",
  "CoachInstance",
  "CoachingPolicyProfile",
  "CoachCapabilityScope",
] as const;

/** One minimal valid instance per contract. */
const valid: Record<(typeof CORE)[number], unknown> = {
  ActivityEvent: {
    schemaVersion: V,
    eventId: "e1",
    domainId: "bridge_gameplay",
    eventType: "bid_made",
    timestamp: "2026-07-08T00:00:00.000Z",
    sessionId: "s1",
    actorId: "L1",
  },
  KnowledgeChunk: { schemaVersion: V, id: "k1", content: "Red means stop." },
  CoachProfile: {
    schemaVersion: V,
    id: "p1",
    name: "Bridge Beginner Coach",
    domainId: "bridge_gameplay",
    profileType: "live_activity_coach",
    supportedModes: ["live_coach"],
    defaultMode: "live_coach",
    coachingPolicyProfileId: "cpp1",
    knowledgeScopeId: "ks1",
    capabilityScopeId: "cs1",
    version: "1.0.0",
    status: "draft",
    ownerType: "platform",
    ownerId: "sys",
  },
  CoachingPolicy: {
    schemaVersion: V,
    interventionMode: "live_coach",
    maxHintLevel: 4,
  },
  KnowledgeScope: {
    schemaVersion: V,
    id: "ks1",
    domainId: "bridge_gameplay",
    instructionalLevel: "beginner",
    sourcePolicy: { sourceBoundOnly: true, allowGeneralBackground: false, requireCitations: true },
  },
  Recommendation: {
    schemaVersion: V,
    id: "r1",
    learnerId: "L1",
    domainId: "bridge_gameplay",
    reason: "Missed the same concept twice.",
    recommendationType: "drill",
    priority: "high",
    status: "active",
    generatedBy: "rule",
    createdAt: "2026-07-08T00:00:00.000Z",
  },
  LearnerDomainProfile: {
    schemaVersion: V,
    learnerId: "L1",
    domainId: "bridge_gameplay",
    skillStates: [{ skillId: "skill.opening_bid", mastery: 0.4 }],
  },
  CoachInstance: {
    schemaVersion: V,
    id: "i1",
    coachProfileId: "p1",
    domainId: "bridge_gameplay",
    mode: "live_coach",
    status: "active",
    createdAt: "2026-07-08T00:00:00.000Z",
  },
  CoachingPolicyProfile: {
    schemaVersion: V,
    profileId: "cpp1",
    displayName: "Bridge Beginner",
    questioningStyle: "socratic",
    interventionPolicy: { maxHintLevel: 3 },
  },
  CoachCapabilityScope: {
    schemaVersion: V,
    id: "cs1",
    name: "Study tutor capabilities",
    canGenerateHints: true,
    canAskSocraticQuestions: true,
  },
};

describe("contract schemas", () => {
  it("registers all core schemas", () => {
    for (const name of CORE) expect(schemas[name], name).toBeTruthy();
    expect(Object.keys(schemas).sort()).toEqual([...CORE].sort());
  });

  it("every schema requires a schemaVersion field", () => {
    for (const name of CORE) {
      const required = (schemas[name] as { required?: string[] }).required ?? [];
      expect(required, name).toContain("schemaVersion");
    }
  });

  it.each(CORE)("accepts a minimal valid %s", (name) => {
    const result = validate(name, valid[name]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each(CORE)("rejects a %s missing schemaVersion", (name) => {
    const { schemaVersion: _omit, ...rest } = valid[name] as Record<string, unknown>;
    const result = validate(name, rest);
    expect(result.valid).toBe(false);
  });

  it("rejects an ActivityEvent with the wrong types / extra fields", () => {
    expect(validate("ActivityEvent", { schemaVersion: V }).valid).toBe(false); // missing required
    expect(
      validate("ActivityEvent", { ...(valid.ActivityEvent as object), bogus: 1 }).valid,
    ).toBe(false); // additionalProperties: false
    expect(
      validate("ActivityEvent", { ...(valid.ActivityEvent as object), sourcePlatform: "nope" })
        .valid,
    ).toBe(false); // enum violation
  });

  it("throws on an unknown contract name", () => {
    expect(() => validate("NotAContract", {})).toThrow(/Unknown contract schema/);
  });
});
