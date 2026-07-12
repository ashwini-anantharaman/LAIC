// Phase 9 acceptance: extraction lands attributed, editable items (badged
// uncited until matched to passages); prototype-registry reconciliation
// produces candidates; §19.3 checks warn on unreferenced settings and record
// a golden-board baseline at generation; the Level-2 growth loop generates
// 0.2.0 whose 1NT opening makes the dealer's NT-reject filter real.

import { defaultSettingValues } from "@bridge/config";
import { describe, expect, it } from "vitest";
import { BEGINNER_NATURAL_PACKAGE_ID, BEGINNER_NATURAL_V0_SEED } from "./content/beginnerNaturalV0";
import { LEVEL2_GAPS, LEVEL2_ITEMS } from "./content/level2";
import { runGeneration } from "./generate";
import { PrototypeRegistryExtractor, runIngestion, runLlmIngestion, type LlmExtractionClient } from "./ingest";
import { chunkSourceText } from "./passages";
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
  it("prototype-registry candidates land active with flags and lineage", async () => {
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
    expect(item.status).toBe("active"); // editable content, badged uncited
    expect(item.sourceIds).toEqual(["src_prototype_artifacts"]);
    expect(item.citations[0]!.passage).toContain('key="nt1_range"');
    expect(item.reviewerNotes).toContain("default value NOT carried over");
    expect((await store.getSource("src_prototype_artifacts"))!.status).toBe("ingested");

    // Re-running never clobbers existing items.
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

  it("LLM ingestion fails loudly when the source has no uploaded document", async () => {
    const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
    const never: LlmExtractionClient = { extractItems: async () => { throw new Error("must not be called"); } };
    const job = await runLlmIngestion(store, never, {
      sourceId: "src_sayc_booklet",
      systemFamily: "SAYC",
      requestedBy: "x",
      now: NOW,
      jobId: "job_llm",
    });
    expect(job.status).toBe("failed");
    expect(job.errors[0]).toContain("no uploaded document");
  });

  it("book -> items: uploaded passages, deterministic chunking, passage-anchored citations", async () => {
    const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
    const text = "Opening bids.\n\nOpen 1NT with 15-17 HCP and balanced shape.\n\nWith a five-card major and 12+ points, open one of the major.";
    const passages = chunkSourceText("src_sayc_booklet", text);
    expect(passages.length).toBeGreaterThan(0);
    // Determinism: same text, same anchors.
    expect(chunkSourceText("src_sayc_booklet", text)).toEqual(passages);
    await store.saveSourceDocument(
      { sourceId: "src_sayc_booklet", fileName: "sayc.txt", mediaType: "text/plain", charCount: text.length, uploadedAt: NOW, text },
      passages,
    );

    const fake: LlmExtractionClient = {
      extractItems: async ({ passages: batch, knownPredicates }) => {
        expect(knownPredicates).toContain("hcpRange");
        return [
          {
            slug: "open_1nt_15_17",
            itemType: "bidding_rule",
            title: "Open 1NT with 15-17 HCP, balanced",
            humanReadableRule: "With 15-17 HCP and balanced shape, open 1NT.",
            structuredFieldsJson: JSON.stringify({
              rule: {
                ruleId: "llm_open_1nt", title: "Open 1NT with 15-17 HCP, balanced", priority: 5,
                settingGates: [], auctionContext: { role: "opening" },
                handConditions: { all: [{ predicate: "hcpRange", params: { min: 15, max: 17 } }, { predicate: "balanced" }] },
                action: { kind: "call", call: "1N" },
              },
            }),
            passageIds: [batch[0]!.passageId],
            flags: [],
          },
        ];
      },
    };

    const job = await runLlmIngestion(store, fake, {
      sourceId: "src_sayc_booklet",
      systemFamily: "SAYC",
      requestedBy: "coach",
      now: NOW,
      jobId: "job_llm2",
    });
    expect(job.status).toBe("completed");
    expect(job.stats.candidatesCreated).toBe(1);

    const item = (await store.getItem("cand_llm_open_1nt_15_17"))!;
    expect(item.status).toBe("active");
    expect(item.createdBy).toBe("ingestion:llm");
    expect(item.citations[0]!.passageId).toBe(passages[0]!.passageId);
    // The citation resolves to the actual uploaded text.
    const cited = await store.getPassage(item.citations[0]!.passageId!);
    expect(cited!.text).toContain("Open 1NT");
    // Re-running skips, never clobbers.
    const again = await runLlmIngestion(store, fake, {
      sourceId: "src_sayc_booklet", systemFamily: "SAYC", requestedBy: "coach", now: NOW, jobId: "job_llm3",
    });
    expect(again.stats.candidatesCreated).toBe(0);
    expect(again.stats.skipped).toBeGreaterThan(0);
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
    expect(run.warnings).toContain(
      '§19.3: setting "orphan_setting" is referenced by no rule and not marked uiOnly',
    );
  });

  it("generation records a golden-board fallback baseline", async () => {
    const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
    await runGeneration(store, { systemFamily: "natural", requestedBy: "t", now: NOW, runId: "r" });
    const rec = (await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0"))!;
    expect(rec.baseline).toEqual({ boards: 5, bidFallbackRate: 0, playFallbackRate: 0 });
  });
});

describe("Level 2 growth loop", () => {
  it("generates the 1NT opening; the NT dealer filter is now real", async () => {
    const seed = structuredClone(BEGINNER_NATURAL_V0_SEED);
    seed.items!.push(...LEVEL2_ITEMS);
    seed.gaps!.push(...LEVEL2_GAPS);
    const store = new InMemoryKnowledgeStore(seed);

    await runGeneration(store, { systemFamily: "natural", requestedBy: "t", now: NOW, runId: "r1" });
    const r2 = await runGeneration(store, { systemFamily: "natural", requestedBy: "t", now: NOW, runId: "r2" });
    // First generation already contained Level 2 (seeded); regen shows no diff…
    expect(r2.diff?.bidRules).toEqual([]);

    const rec = (await store.getLatest(BEGINNER_NATURAL_PACKAGE_ID))!;
    expect(rec.pkg.bidRules.some((r) => r.ruleId === "bn2_open_1nt")).toBe(true);
    expect(rec.baseline).toBeDefined();

    // The user's original example against the REAL generated package:
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
