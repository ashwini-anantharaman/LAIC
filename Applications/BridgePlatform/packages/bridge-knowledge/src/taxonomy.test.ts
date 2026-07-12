// Phase 15 (§13.5): taxonomy tags flow item -> generated rule entry, unknown
// or missing tags surface as generation warnings (never gates), and the
// taxonomy reference data itself is internally consistent.

import {
  BRIDGE_CONCEPTS,
  BRIDGE_SKILLS,
  isKnownSkillId,
  unknownConceptIds,
  unknownSkillIds,
} from "@bridge/taxonomy";
import { describe, expect, it } from "vitest";
import {
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
} from "./content/beginnerNaturalV0";
import { runGeneration } from "./generate";
import { InMemoryKnowledgeStore } from "./store";

const NOW = "2026-07-12T12:00:00.000Z";

const generate = (store: InMemoryKnowledgeStore, runId = "run_tax") =>
  runGeneration(store, { systemFamily: "natural", requestedBy: "user_reviewer_rhea", now: NOW, runId });

describe("taxonomy reference data (§13.5)", () => {
  it("carries the full 32-skill taxonomy across all four categories", () => {
    expect(BRIDGE_SKILLS.length).toBe(32);
    const count = (cat: string) => BRIDGE_SKILLS.filter((s) => s.category === cat).length;
    expect(count("bidding")).toBe(12);
    expect(count("play")).toBe(7);
    expect(count("defense")).toBe(6);
    expect(count("system_familiarity")).toBe(7);
    expect(new Set(BRIDGE_SKILLS.map((s) => s.skillId)).size).toBe(32); // ids unique
  });

  it("every concept's relatedSkillIds reference real skills", () => {
    for (const c of BRIDGE_CONCEPTS) {
      expect(c.relatedSkillIds.length).toBeGreaterThan(0);
      expect(unknownSkillIds(c.relatedSkillIds)).toEqual([]);
    }
    expect(new Set(BRIDGE_CONCEPTS.map((c) => c.conceptId)).size).toBe(BRIDGE_CONCEPTS.length);
  });
});

describe("tags flow through generation (§13.5)", () => {
  it("copies item tags onto generated rule entries", async () => {
    const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
    const run = await generate(store);
    expect(run.status).toBe("completed");
    const pkg = (await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, run.resultVersion!))!.pkg;

    const openMajor = pkg.bidRules.find((r) => r.ruleId === "bn_open_major")!;
    expect(openMajor.relatedSkillIds).toEqual(["sk_hand_evaluation", "sk_opening_bid_selection"]);
    expect(openMajor.relatedConceptIds).toEqual(["bn_opening_bids"]);

    const lead = pkg.playRules.find((r) => r.ruleId === "bn_lead_top_longest")!;
    expect(lead.relatedSkillIds).toEqual(["sk_opening_leads"]);

    // Every non-catch-all rule is tagged with known skills.
    for (const r of [...pkg.bidRules, ...pkg.playRules]) {
      if ("noAgreement" in r && r.noAgreement) continue;
      expect(r.relatedSkillIds ?? []).not.toEqual([]);
      expect((r.relatedSkillIds ?? []).every(isKnownSkillId)).toBe(true);
    }
  });

  it("warns on unknown or missing tags without blocking generation", async () => {
    const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
    const openMajor = (await store.getItem("ki_bn_open_major"))!;
    await store.saveItem({
      ...openMajor,
      relatedSkillIds: ["sk_not_a_real_skill"],
      relatedConceptIds: ["nope_concept"],
      version: "2",
    });
    const newSuit = (await store.getItem("ki_bn_new_suit"))!;
    await store.saveItem({ ...newSuit, relatedSkillIds: [], version: "2" });

    const run = await generate(store, "run_tax_warn");
    expect(run.status).toBe("completed"); // warnings, never gates
    expect(run.warnings?.some((w) => w.includes("unknown skill ids [sk_not_a_real_skill]"))).toBe(true);
    expect(run.warnings?.some((w) => w.includes("unknown concept ids [nope_concept]"))).toBe(true);
    expect(run.warnings?.some((w) => w.includes("ki_bn_new_suit: no relatedSkillIds"))).toBe(true);
    // The catch-all pass rule is exempt from the untagged warning.
    expect(run.warnings?.some((w) => w.includes("ki_bn_pass_otherwise: no relatedSkillIds"))).toBe(false);
  });

  it("unknownConceptIds helper flags only unknown ids", () => {
    expect(unknownConceptIds(["bn_opening_bids", "xx"])).toEqual(["xx"]);
  });
});

describe("§19.3 test-hand coverage", () => {
  it("links diffed rules to the golden boards that exercise them and flags untested rules", async () => {
    const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
    const run = await generate(store, "run_cov");
    expect(run.status).toBe("completed");
    expect(run.testCoverage).toBeDefined();

    // First run: every rule is "added", so each appears in affectedTests.
    const byRule = new Map(run.testCoverage!.affectedTests.map((t) => [t.ruleId, t.boards]));
    expect(byRule.get("bn_open_major")?.length).toBeGreaterThan(0);
    expect(byRule.get("bn_lead_top_longest")?.length).toBeGreaterThan(0);

    // Untested rules (if any) also carry a §19.3 warning, and vice versa.
    for (const id of run.testCoverage!.untestedRuleIds)
      expect(run.warnings?.some((w) => w.includes(`no golden board exercises rule "${id}"`))).toBe(true);
  });
});

describe("presets as content (§11.3)", () => {
  it("generation ships configuration_preset items as pkg.presets with lineage", async () => {
    const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
    const run = await generate(store, "run_presets");
    expect(run.status).toBe("completed");
    const record = (await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, run.resultVersion!))!;

    expect(record.pkg.presets?.map((p) => p.presetId).sort()).toEqual(["bn_default", "bn_no_1nt"]);
    expect(record.pkg.presets?.find((p) => p.presetId === "bn_no_1nt")?.values).toEqual({
      bn_1nt_response: false,
    });
    const artifact = record.artifacts.find((a) => a.artifactId.endsWith("/preset:bn_no_1nt"));
    expect(artifact?.generatedFromKnowledgeItemIds).toEqual(["ki_bn_preset_no_1nt"]);
    expect(run.diff?.presets?.map((d) => d.change)).toEqual(["added", "added"]);
  });

  it("a preset referencing an unknown setting key fails validation", async () => {
    const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
    const item = (await store.getItem("ki_bn_preset_no_1nt"))!;
    await store.saveItem({
      ...item,
      structuredFields: {
        preset: { presetId: "bn_bad", name: "Bad", description: "x", values: { nope_key: true } },
      },
      version: "2",
    });
    const run = await generate(store, "run_preset_bad");
    expect(run.status).toBe("failed");
    expect(run.errors.some((e) => e.includes('preset bn_bad: value for unknown setting "nope_key"'))).toBe(true);
  });
});
