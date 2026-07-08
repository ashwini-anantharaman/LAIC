// Phase 3 acceptance: register -> author -> approve -> generate -> diff ->
// publish; immutability; correction loop; full lineage; publish gate.

import { describe, expect, it } from "vitest";
import {
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
} from "./content/beginnerNaturalV0";
import { publishPackage, runGeneration } from "./generate";
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

describe("generation + publication pipeline", () => {
  it("generates a validated draft package from approved items, with a diff", async () => {
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

    const draft = await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0");
    expect(draft?.status).toBe("draft");
  });

  it("publishes with every entry approved and full lineage", async () => {
    const store = freshStore();
    await generate(store);
    const published = await publishPackage(
      store,
      BEGINNER_NATURAL_PACKAGE_ID,
      "0.1.0",
      "user_reviewer_rhea",
      NOW,
    );

    expect(published.status).toBe("published");
    expect(published.pkg.status).toBe("published");
    // Zero unreviewed entries; every rule cites items AND sources.
    for (const rule of [...published.pkg.bidRules, ...published.pkg.playRules]) {
      expect(rule.provenance.reviewStatus).toBe("approved");
      expect(rule.provenance.knowledgeItemIds.length).toBeGreaterThan(0);
      expect(rule.provenance.sourceIds.length).toBeGreaterThan(0);
    }
    // Every artifact carries lineage.
    for (const a of published.artifacts) {
      expect(a.status).toBe("published");
      expect(a.generatedFromKnowledgeItemIds.length).toBeGreaterThan(0);
    }
  });

  it("published versions are immutable", async () => {
    const store = freshStore();
    await generate(store);
    const published = await publishPackage(
      store,
      BEGINNER_NATURAL_PACKAGE_ID,
      "0.1.0",
      "user_reviewer_rhea",
      NOW,
    );
    await expect(store.savePackage({ ...published, createdAt: "later" })).rejects.toThrow(
      /immutable/,
    );
    await expect(
      publishPackage(store, BEGINNER_NATURAL_PACKAGE_ID, "0.1.0", "again", NOW),
    ).rejects.toThrow(/already published/);
  });

  it("correction loop: edit -> re-approve -> regenerate creates a new version; old untouched", async () => {
    const store = freshStore();
    await generate(store);
    await publishPackage(store, BEGINNER_NATURAL_PACKAGE_ID, "0.1.0", "user_reviewer_rhea", NOW);

    // Reviewer edits the raise rule: 6-10 -> 6-9 (status drops to needs_review).
    const item = (await store.getItem("ki_bn_raise_partner"))!;
    const edited = {
      ...item,
      version: "2",
      status: "needs_review" as const,
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
    };
    await store.saveItem(edited);
    expect((await store.listItemRevisions("ki_bn_raise_partner")).length).toBe(1);

    // Unapproved items are EXCLUDED from generation — the rule would vanish.
    const runWithout = await generate(store, "run_2");
    expect(runWithout.diff?.bidRules.some((d) => d.id === "bn_single_raise" && d.change === "removed")).toBe(true);

    // Re-approve, regenerate: new version with the changed rule; 0.1.0 intact.
    await store.saveItem({ ...edited, status: "approved", approvedBy: "user_reviewer_rhea", approvedAt: NOW });
    const run = await generate(store, "run_3");
    expect(run.resultVersion).toBe("0.2.0");
    expect(run.diff?.previousVersion).toBe("0.1.0");
    expect(run.diff?.bidRules).toEqual([{ id: "bn_single_raise", change: "changed" }]);

    const old = await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0");
    const oldRule = old!.pkg.bidRules.find((r) => r.ruleId === "bn_single_raise")!;
    expect(JSON.stringify(oldRule.handConditions)).toContain('"max":10');
  });

  it("resolves a runtime rule id back to readable items and cited sources", async () => {
    const store = freshStore();
    await generate(store);
    await publishPackage(store, BEGINNER_NATURAL_PACKAGE_ID, "0.1.0", "user_reviewer_rhea", NOW);

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
