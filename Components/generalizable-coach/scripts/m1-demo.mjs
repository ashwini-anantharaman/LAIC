/**
 * M1 demo harness — see the foundations working end to end.
 *
 * Seeds one learner across TWO domains (bridge + Brain Bee), opens a coaching
 * session, prints the Common Coach Package, retrieves knowledge, and shows the
 * domain-isolation + cross-scope-awareness behavior. No adaptive coaching yet
 * (M1's pipeline is a stub) — this exercises hold-a-learner + retrieve-knowledge.
 *
 *   npm run m1:demo
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LearnerStore } from "../platform/learner-model/index.ts";
import { BundledKnowledgeSource } from "../platform/knowledge-source/index.ts";
import { openCoachSession } from "../platform/adaptive/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (name) =>
  JSON.parse(readFileSync(path.join(here, "..", "fixtures", "knowledge", name), "utf8"));

const line = (t) => console.log(`\n\x1b[36m${t}\x1b[0m`);
const show = (o) => console.log(JSON.stringify(o, null, 2));

// --- seed a learner across two domains -------------------------------------
const store = new LearnerStore();
store.createProfile("L1", "Alice", { feedbackStyle: "gentle", explanationDepth: "short" });
const miss = (conceptId, skillId) => ({
  correctness: "incorrect",
  confidence: 1,
  conceptIds: [conceptId],
  skillIds: [skillId],
  severity: "major",
});
store.updateSkillState("L1", "bridge_gameplay", "skill.opening_1nt", miss("concept.opening_bid", "skill.opening_1nt"));
store.updateSkillState("L1", "brainbee", "skill.recall", miss("concept.memory_consolidation", "skill.recall"));

line("1) Domain-isolated projections (LearnerDomainProfile)");
console.log("bridge skills :", store.getLearnerDomainProfile("L1", "bridge_gameplay").skillStates.map((s) => s.skillId));
console.log("brainbee skills:", store.getLearnerDomainProfile("L1", "brainbee").skillStates.map((s) => s.skillId));
console.log("→ neither list leaks the other domain's skill.");

// --- open a session (Common Coach Package) ---------------------------------
line("2) openCoachSession → Common Coach Package (bridge, awareness OFF)");
const session = openCoachSession({
  learnerId: "L1",
  domainId: "bridge_gameplay",
  learnerStore: store,
  knowledgeSource: new BundledKnowledgeSource(load("bridge-sample.package.json")),
});
show({
  domainId: session.domainId,
  pipeline: session.pipeline,
  weakSkills: session.commonCoachPackage.weakSkills,
  crossScopeAwareness: session.commonCoachPackage.crossScopeAwareness,
  policy: session.commonCoachPackage.resolvedPolicy.interventionMode,
});

line("3) Same session with cross-scope awareness ON");
const aware = openCoachSession({ learnerId: "L1", domainId: "bridge_gameplay", learnerStore: store, crossScopeAwareness: true });
console.log("crossScopeAwareness:", aware.commonCoachPackage.crossScopeAwareness);

// --- retrieve knowledge through the port -----------------------------------
line("4) KnowledgeSource.retrieve — progressive disclosure by chunkType");
for (const chunkType of ["hint_template", "rule", "example"]) {
  const chunks = await session.knowledgeSource.retrieve({ conceptIds: ["concept.opening_bid"], chunkType });
  console.log(`  ${chunkType.padEnd(14)} → ${chunks.map((c) => c.id).join(", ") || "(none)"}`);
}

line("5) Required-tag rule (A1): an untagged chunk comes back normalized");
const balanced = await session.knowledgeSource.retrieve({ conceptIds: ["concept.hand_balanced"] });
const untagged = balanced.find((c) => c.id === "br-untagged"); // shipped with no chunkType / no skillIds
console.log(`  ${untagged.id}: chunkType="${untagged.chunkType}" (defaulted), skillIds=${JSON.stringify(untagged.skillIds)}`);

console.log("\n\x1b[32m✓ M1 foundations working: held a learner, isolated domains, opened a session, retrieved knowledge.\x1b[0m");
