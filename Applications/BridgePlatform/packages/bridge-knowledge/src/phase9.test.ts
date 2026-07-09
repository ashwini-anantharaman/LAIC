// Phase 9 acceptance: extraction candidates always land as needs_review (the
// LLM/extractor boundary is enforced by the job runner); prototype-registry
// reconciliation produces reviewable candidates; §19.3 gates warn on
// unreferenced settings and record a golden-board baseline at publication;
// the Level-2 growth loop publishes 0.2.0 whose 1NT opening makes the
// dealer's NT-reject filter real.

import { defaultSettingValues } from "@bridge/config";
import { describe, expect, it } from "vitest";
import { BEGINNER_NATURAL_PACKAGE_ID, BEGINNER_NATURAL_V0_SEED } from "./content/beginnerNaturalV0";
import { LEVEL2_GAPS, LEVEL2_ITEMS } from "./content/level2";
import { publishPackage, runGeneration } from "./generate";
import { LlmExtractor, PrototypeRegistryExtractor, runIngestion } from "./ingest";
import { InMemoryKnowledgeStore } from "./store";

const NOW = "2026-07-09T12:00:00.000Z";

const REGISTRY_SNIPPET = `
export const SETTINGS: Setting[] = [
  {
    key: "nt1_range",
    label: "1NT opening range",
    control: "range_hcp",
    default: { low: 15, high: 17 },
    module: "notrump_openings",
    description: "HCP range for the 1NT opening.",
  },
  {
    key: "nt_stayman",
    label: "Stayman",
    control: "single_select",
    module: "notrump_responses",
    description: "2C asks for a four-card major.",
  },
  {
    key: "broken_entry_no_key_here",
    label_typo: "unparsable",
  },
];
`;

describe("ingestion jobs", () => {
  it("prototype-registry candidates land as needs_review with flags and lineage", async () => {
    const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
    const job = await runIngestion(store, new PrototypeRegistryExtractor(), {
      sourceId: "src_prototype_artifacts",
      sourceText: REGISTRY_SNIPPET,
      systemFamily: "SAYC",
      requestedBy: "user_reviewer_rhea",
      now: NOW,
      jobId: "job_1",
    });

    expect(job.status).toBe("completed");
    expect(job.stats.candidatesCreated).toBe(2); // broken entry skipped, not guessed
    const item = (await store.getItem("cand_proto_nt1_range"))!;
    expect(item.status).toBe("needs_review"); // NEVER approved by extraction
    expect(item.sourceIds).toEqual(["src_prototype_artifacts"]);
    expect(item.citations[0]!.passage).toContain('key="nt1_range"');
    expect(item.reviewerNotes).toContain("default value NOT carried over");
    expect((await store.getSource("src_prototype_artifacts"))!.status).toBe("ingested");

    // Re-running never clobbers items under review.
    const again = await runIngestion(store, new PrototypeRegistryExtractor(), {
      sourceId: "src_prototype_artifacts",
      sourceText: REGISTRY_SNIPPET,
      systemFamily: "SAYC",
      requestedBy: "user_reviewer_rhea",
      now: NOW,
      jobId: "job_2",
    });
    expect(again.stats.skipped).toBe(2);
    expect(again.stats.candidatesCreated).toBe(0);
  });

  it("the LLM extractor seam fails loudly until a key is provisioned", async () => {
    const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
    const job = await runIngestion(store, new LlmExtractor(), {
      sourceId: "src_sayc_booklet",
      sourceText: "…",
      systemFamily: "SAYC",
      requestedBy: "x",
      now: NOW,
      jobId: "job_llm",
    });
    expect(job.status).toBe("failed");
    expect(job.errors[0]).toContain("ANTHROPIC_API_KEY");
  });
});

describe("§19.3 quality gates", () => {
  it("warns on settings referenced by no rule (unless uiOnly)", async () => {
    const seed = structuredClone(BEGINNER_NATURAL_V0_SEED);
    seed.items!.push({
      ...seed.items!.find((i) => i.itemId === "ki_bn_setting_1nt_response")!,
      itemId: "ki_orphan_setting",
      structuredFields: {
        setting: {
          ...(seed.items!.find((i) => i.itemId === "ki_bn_setting_1nt_response")!
            .structuredFields.setting as object),
          key: "orphan_setting",
          label: "Orphan",
        },
      },
    });
    const store = new InMemoryKnowledgeStore(seed);
    const run = await runGeneration(store, {
      systemFamily: "natural",
      requestedBy: "t",
      now: NOW,
      runId: "run_w",
    });
    expect(run.status).toBe("completed");
    expect(run.warnings).toEqual([
      '§19.3: setting "orphan_setting" is referenced by no rule and not marked uiOnly',
    ]);
  });

  it("publication records a golden-board fallback baseline", async () => {
    const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
    await runGeneration(store, { systemFamily: "natural", requestedBy: "t", now: NOW, runId: "r" });
    const rec = await publishPackage(store, BEGINNER_NATURAL_PACKAGE_ID, "0.1.0", "t", NOW);
    expect(rec.baseline).toEqual({ boards: 5, bidFallbackRate: 0, playFallbackRate: 0 });
  });
});

describe("Level 2 growth loop", () => {
  it("publishes 0.2.0 with the 1NT opening; the NT dealer filter is now real", async () => {
    const seed = structuredClone(BEGINNER_NATURAL_V0_SEED);
    seed.items!.push(...LEVEL2_ITEMS);
    seed.gaps!.push(...LEVEL2_GAPS);
    const store = new InMemoryKnowledgeStore(seed);

    const r1 = await runGeneration(store, { systemFamily: "natural", requestedBy: "t", now: NOW, runId: "r1" });
    await publishPackage(store, BEGINNER_NATURAL_PACKAGE_ID, r1.resultVersion!, "t", NOW);
    const r2 = await runGeneration(store, { systemFamily: "natural", requestedBy: "t", now: NOW, runId: "r2" });
    // First publish already contained Level 2 (seeded); regen shows no diff…
    expect(r2.diff?.bidRules).toEqual([]);

    const rec = (await store.getLatestPublished(BEGINNER_NATURAL_PACKAGE_ID))!;
    expect(rec.pkg.bidRules.some((r) => r.ruleId === "bn2_open_1nt")).toBe(true);
    expect(rec.baseline).toBeDefined();

    // The user's original example against the REAL published package:
    const { generateConstrainedBoards, systemicOpeningAction, verifyBoards } = await import(
      "@bridge/dealer"
    );
    const ctx = { pkg: rec.pkg, values: defaultSettingValues(rec.pkg.settings) };
    const spec = {
      seed: 11,
      count: 10,
      evaluatorFilter: { seats: "all" as const, rejectIfSystemicActionIn: ["1N"] },
    };
    const report = generateConstrainedBoards(spec, ctx);
    expect(verifyBoards(report.boards, spec, ctx)).toEqual([]);
    for (const b of report.boards)
      for (const seat of ["N", "E", "S", "W"] as const)
        expect(systemicOpeningAction(b.hands, seat, ctx)).not.toBe("1N");
    expect(report.attempts).toBeGreaterThan(10); // NT-best deals were rejected
  });
});
