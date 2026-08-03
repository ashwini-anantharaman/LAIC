/**
 * Zone 1 — Platform core: the coach configuration resolver (LAIC §8.3, M2/B1).
 *
 * Collapses the inheritance chain
 *   platform default → CoachingPolicyProfile → course → class → learner prefs → session
 * into the flat `CoachingPolicy` the runtime consumes. A field set by a higher
 * layer that is *locked* cannot be overridden by lower layers. The result is
 * stamped with the profile's id + schemaVersion (config versioning, §8.5) so a
 * later postmortem reads history under the settings it ran with.
 */
import type { CoachingPolicy, CoachingPolicyProfile } from "../../contracts/index";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/version";

/** The platform-default resolved policy — the base of every inheritance chain. */
export function platformDefaultPolicy(): CoachingPolicy {
  return {
    schemaVersion: CONTRACTS_SCHEMA_VERSION,
    interventionMode: "on_demand",
    maxHintLevel: 4,
    allowDirectAnswer: false,
    feedbackStyle: "gentle",
    questioningStyle: "mixed",
    interruptionTolerance: "medium",
    postmortemVsRealtime: "prefer_realtime",
    saveForPostmortemWhenPossible: false,
    enabledTools: [],
    crossScopeAwareness: false,
    conversationalMode: true,
    maxOrchestrationSteps: 3,
  };
}

/** One layer of the inheritance chain: some fields, optionally locking some. */
export interface PolicyLayer {
  name: string;
  values: Partial<CoachingPolicy>;
  lockedFields?: string[];
}

/** Flatten a CoachingPolicyProfile into a policy layer. */
export function policyProfileToLayer(p: CoachingPolicyProfile): PolicyLayer {
  const ip = p.interventionPolicy;
  const values: Partial<CoachingPolicy> = {
    maxHintLevel: ip.maxHintLevel,
    questioningStyle: p.questioningStyle,
  };
  if (ip.allowDirectAnswer !== undefined) values.allowDirectAnswer = ip.allowDirectAnswer;
  if (ip.feedbackStyle !== undefined) values.feedbackStyle = ip.feedbackStyle;
  if (ip.interruptionTolerance !== undefined) values.interruptionTolerance = ip.interruptionTolerance;
  if (ip.postmortemVsRealtime !== undefined) values.postmortemVsRealtime = ip.postmortemVsRealtime;
  if (p.enabledTools !== undefined) values.enabledTools = p.enabledTools;
  return { name: `profile:${p.profileId}`, values, lockedFields: p.lockedFields };
}

/**
 * Resolve the flat CoachingPolicy from a behavioral profile plus optional lower
 * layers (course/class/learner prefs/session), on top of the platform default.
 */
export function resolvePolicy(
  profile: CoachingPolicyProfile,
  lowerLayers: PolicyLayer[] = [],
  base: CoachingPolicy = platformDefaultPolicy(),
): CoachingPolicy {
  const layers: PolicyLayer[] = [
    { name: "platform_default", values: base },
    policyProfileToLayer(profile),
    ...lowerLayers,
  ];

  const resolved: Record<string, unknown> = {};
  const locked = new Set<string>();

  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer.values)) {
      if (value === undefined) continue;
      if (locked.has(key)) continue; // a higher layer locked this field
      resolved[key] = value;
    }
    for (const f of layer.lockedFields ?? []) locked.add(f);
  }

  resolved.schemaVersion = CONTRACTS_SCHEMA_VERSION;
  resolved.provenance = { profileId: profile.profileId, schemaVersion: profile.schemaVersion };
  return resolved as unknown as CoachingPolicy;
}
