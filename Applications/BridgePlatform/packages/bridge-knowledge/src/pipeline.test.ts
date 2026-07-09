// Knowledge pipeline acceptance: register -> author -> generate -> diff;
// per-version immutability; correction + deprecation loops; full lineage;
// citation coverage as warnings (revised decision 3: no approval gates).

import { describe, expect, it } from "vitest";
import {
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
} from "./content/beginnerNaturalV0";
import { runGeneration } from "./generate";
import { resolveRuleProvenance } from "./resolve";
import { InMemoryKnowledgeStore } from "./store";

const NOW = "2026-07-08T12:00:00.000Z";

const freshStore = () => new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);

const generate = (store: InMemoryKnowledgeStore, runId = "run_1") =>
  runGeneration(store, {
    systemFamily: "natural",
    requestedBy: "user_reviewer_rhea",
    now: NOW,
    runId,
  });

describe("generation pipeline", () => {
  it("generates a validated, immediately usable package from active items, with a diff", async () => {
    const store = freshStore();
    const run = await generate(store);

    expect(run.status).toBe("completed");
    expect(run.errors).toEqual([]);
    expect(run.resultPackageId).toBe(BEGINNER_NATURAL_PACKAGE_ID);
    expect(run.resultVersion).toBe("0.1.0");
    // First generation: everything is "added" relative to nothing.
    expect(run.diff?.previousVersion).toBeNull();
    expect(run.diff?.bidRules.every((d) => d.change === "added")).toBe(true);
    expect(run.diff?.bidRules.length).toBe(8);
    expect(run.diff?.playRules.length).toBe(2);
    expect(run.diff?.settings.length).toBe(1);
    // Input snapshot recorded for replayability.
    expect(run.inputItems.length).toBeGreaterThan(10);

    const record = await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0");
    expect(record?.status).toBe("active");
    expect(record?.pkg.status).toBe("active");
    // Usable immediately: getLatest resolves to it, baseline measured.
    expect((await store.getLatest(BEGINNER_NATURAL_PACKAGE_ID))?.version).toBe("0.1.0");
    expect(record?.baseline?.boards).toBeGreaterThan(0);
  });

  it("every generated rule and artifact carries full lineage", async () => {
    const store = freshStore();
    await generate(store);
    const record = (await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0"))!;

    for (const rule of [...record.pkg.bidRules, ...record.pkg.playRules]) {
      expect(rule.provenance.knowledgeItemIds.length).toBeGreaterThan(0);
      expect(rule.provenance.sourceIds.length).toBeGreaterThan(0);
    }
    for (const a of record.artifacts) {
      expect(a.status).toBe("active");
      expect(a.generatedFromKnowledgeItemIds.length).toBeGreaterThan(0);
    }
  });

  it("uncited items still generate, but the run warns about them", async () => {
    const store = freshStore();
    const item = (await store.getItem("ki_bn_raise_partner"))!;
    await store.saveItem({ ...item, version: "2", citations: [], sourceIds: [] });

    const run = await generate(store);
    expect(run.status).toBe("completed");
    expect(run.warnings?.some((w) => w.includes("ki_bn_raise_partner") && w.includes("uncited"))).toBe(true);
    // The rule is present regardless — visibility, not a gate.
    const record = (await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0"))!;
    expect(record.pkg.bidRules.some((r) => r.ruleId === "bn_single_raise")).toBe(true);
  });

  it("a version's rule content is immutable; artifacts may be appended", async () => {
    const store = freshStore();
    await generate(store);
    const record = (await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0"))!;

    // Changing rule content in place is rejected.
    await expect(
      store.savePackage({
        ...record,
        pkg: { ...record.pkg, bidRules: record.pkg.bidRules.slice(1) },
      }),
    ).rejects.toThrow(/immutable/);

    // Appending artifacts (e.g. test boards) with identical pkg is fine.
    await store.savePackage({
      ...record,
      artifacts: [
        ...record.artifacts,
        {
          artifactId: `${record.packageId}@${record.version}/test_board:0`,
          artifactType: "test_board_reference",
          generatedFromKnowledgeItemIds: ["ki_bn_scope_level1"],
          generatedFromSourceIds: [],
          packageId: record.packageId,
          version: record.version,
          status: "active",
          artifactPayload: { boards: [] },
        },
      ],
    });
    const updated = (await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0"))!;
    expect(updated.artifacts.some((a) => a.artifactType === "test_board_reference")).toBe(true);
  });

  it("correction loop: edit -> regenerate creates a new version; old untouched", async () => {
    const store = freshStore();
    await generate(store);

    // Coach edits the raise rule: 6-10 -> 6-9. No approval step — the edit
    // bumps the version and the next generation picks it up.
    const item = (await store.getItem("ki_bn_raise_partner"))!;
    await store.saveItem({
      ...item,
      version: "2",
      humanReadableRule: item.humanReadableRule.replace("6–10", "6–9"),
      structuredFields: {
        rule: {
          ...(item.structuredFields.rule as Record<string, unknown>),
          handConditions: {
            all: [
              { predicate: "hcpRange", params: { min: 6, max: 9 } },
              { predicate: "supportForPartner", params: { min: 3 } },
            ],
          },
        },
      },
    });
    expect((await store.listItemRevisions("ki_bn_raise_partner")).length).toBe(1);

    const run = await generate(store, "run_2");
    expect(run.resultVersion).toBe("0.2.0");
    expect(run.diff?.previousVersion).toBe("0.1.0");
    expect(run.diff?.bidRules).toEqual([{ id: "bn_single_raise", change: "changed" }]);

    const old = await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0");
    const oldRule = old!.pkg.bidRules.find((r) => r.ruleId === "bn_single_raise")!;
    expect(JSON.stringify(oldRule.handConditions)).toContain('"max":10');
  });

  it("deprecating an item removes its rule from the NEXT version only", async () => {
    const store = freshStore();
    await generate(store);

    const item = (await store.getItem("ki_bn_raise_partner"))!;
    await store.saveItem({ ...item, status: "deprecated" });

    const run = await generate(store, "run_2");
    expect(run.diff?.bidRules).toEqual([{ id: "bn_single_raise", change: "removed" }]);
    // The pinned old version still resolves the rule (provenance stays truthful).
    const old = await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0");
    expect(old!.pkg.bidRules.some((r) => r.ruleId === "bn_single_raise")).toBe(true);
  });

  it("resolves a runtime rule id back to readable items and cited sources", async () => {
    const store = freshStore();
    await generate(store);

    const resolved = await resolveRuleProvenance(
      store,
      BEGINNER_NATURAL_PACKAGE_ID,
      "0.1.0",
      "bn_open_minor",
    );
    expect(resolved).not.toBeNull();
    expect(resolved!.items.map((i) => i.itemId)).toContain("ki_bn_open_minor");
    // Expert decisions ride along via relatedItemIds.
    expect(resolved!.items.map((i) => i.itemId)).toContain("ed_bn_equal_minors");
    expect(resolved!.sources.map((s) => s.sourceId)).toContain("src_sayc_booklet");
    expect(resolved!.citations.some((c) => c.passage.startsWith("paraphrase:"))).toBe(true);
  });

  it("gap registry: the level decisions and deferred areas are recorded", async () => {
    const store = freshStore();
    const open = await store.listGaps();
    expect(open.length).toBeGreaterThanOrEqual(6);
    expect((await store.getGap("gap_bn_no_nt_openings"))?.resolutionStatus).toBe("resolved");
    expect((await store.getGap("gap_bn_citation_verification"))?.resolutionStatus).toBe(
      "expert_decision_needed",
    );
  });
});
