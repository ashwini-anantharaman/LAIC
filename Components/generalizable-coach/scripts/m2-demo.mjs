/**
 * M2 demo harness — see "coach-by-config" working.
 *
 *   npm run m2:demo
 *
 * Shows (1) the same action producing different behavior under socratic vs.
 * direct policy, (2) a disabled capability structurally removing a response,
 * and (3) the Studio flow: clone a preset (cap hints, forbid a concept) →
 * publish → deploy → preview.
 */
import { resolvePolicy } from "../platform/config/index.ts";
import { decideIntervention, applyCapabilityScope, defaultCapabilityScope } from "../platform/policy/index.ts";
import { ProfileRegistry } from "../platform/studio/index.ts";

const line = (t) => console.log(`\n\x1b[36m${t}\x1b[0m`);
const V = "1.0.0";

const profile = (questioningStyle) => ({
  schemaVersion: V,
  profileId: `cpp.${questioningStyle}`,
  displayName: questioningStyle,
  questioningStyle,
  interventionPolicy: { maxHintLevel: 4, interruptionTolerance: "medium" },
});

const evaluation = { correctness: "incorrect", confidence: 1, conceptIds: ["concept.opening_bid"], skillIds: ["skill.opening_1nt"], severity: "major" };

line("1) Same action, different policy → different behavior (B2)");
for (const style of ["socratic", "direct"]) {
  const d = decideIntervention({ evaluation, policy: resolvePolicy(profile(style)) });
  console.log(`  ${style.padEnd(8)} → responseType="${d.responseType}", hintLevel=${d.hintLevel}`);
}

line("2) Capability scope makes a capability structurally unavailable (B3)");
const direct = decideIntervention({ evaluation, policy: resolvePolicy(profile("direct")) });
const blocked = applyCapabilityScope(direct, { ...defaultCapabilityScope(), canGenerateHints: false });
console.log(`  hints ON  → "${direct.responseType}" @ ${direct.hintLevel}`);
console.log(`  hints OFF → "${blocked.responseType}" (${blocked.reason})`);

line("3) Studio: clone → publish → deploy → preview (B5, no code changes)");
const registry = new ProfileRegistry();
const clone = registry.clone({
  basePresetId: "preset.bridge_beginner",
  name: "Club Beginner (capped)",
  policyOverrides: { maxHintLevel: 3 },
  forbiddenConceptIds: ["concept.slam_bidding"],
});
console.log(`  cloned ${clone.id} (from ${clone.basePresetId}), status=${clone.status}`);
const published = registry.publishVersion(clone.id);
console.log(`  published version ${published.profile.version}, history=${JSON.stringify(published.versions)}`);
const instance = registry.deploy({ profileId: clone.id, mode: "live_coach" });
console.log(`  deployed instance ${instance.id} → domain ${instance.domainId}, mode ${instance.mode}`);
const preview = registry.preview(clone.id, { ...evaluation, severity: "critical" }, { hintRequested: true, currentHintLevel: 4 });
console.log(`  preview: resolved maxHintLevel=${preview.resolvedPolicy.maxHintLevel}, decision hintLevel=${preview.decision.hintLevel} (capped)`);
console.log(`  provenance: ${JSON.stringify(preview.resolvedPolicy.provenance)}`);

console.log("\n\x1b[32m✓ M2: behavior is config-driven; coaches are created and deployed by configuration.\x1b[0m");
