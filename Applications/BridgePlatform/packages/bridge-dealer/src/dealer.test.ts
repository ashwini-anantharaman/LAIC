// Phase 6 acceptance: a Level-1 set verified against the evaluator filter
// with zero violations; determinism per (seed, spec, package version); the
// original "no NT-best hands" example; loud failure on infeasible specs;
// test boards attached to a package publication and runnable in the harness.

import { defaultSettingValues } from "@bridge/config";
import { runBoards, type BridgeRulePackage } from "@bridge/engine";
import {
  attachTestBoardArtifacts,
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
  InMemoryKnowledgeStore,
  publishPackage,
  runGeneration,
  type BridgeReadableKnowledgeItem,
} from "@bridge/knowledge";
import { beforeAll, describe, expect, it } from "vitest";
import {
  generateConstrainedBoards,
  specFromTeachingScope,
  systemicOpeningAction,
  verifyBoards,
  type PackageContext,
  type TeachingScopeFields,
} from "./index";

const NOW = "2026-07-09T00:00:00.000Z";
let published: BridgeRulePackage;
let scopeItem: BridgeReadableKnowledgeItem;
let store: InMemoryKnowledgeStore;

beforeAll(async () => {
  store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
  await runGeneration(store, {
    systemFamily: "natural",
    requestedBy: "test",
    now: NOW,
    runId: "run_dealer",
  });
  published = (
    await publishPackage(store, BEGINNER_NATURAL_PACKAGE_ID, "0.1.0", "test", NOW)
  ).pkg;
  scopeItem = (await store.getItem("ki_bn_scope_level1"))!;
});

const ctxOf = (pkg: BridgeRulePackage): PackageContext => ({
  pkg,
  values: defaultSettingValues(pkg.settings),
});

describe("Level-1 teaching-scope set (acceptance)", () => {
  it("generates 20 boards where the dealer's systemic action is always a 1-of-a-suit opening", () => {
    const spec = specFromTeachingScope(
      scopeItem.itemId,
      scopeItem.structuredFields.scope as TeachingScopeFields,
      { seed: 7, count: 20, dealer: "S", namePrefix: "L1" },
    );
    const report = generateConstrainedBoards(spec, ctxOf(published));

    expect(report.boards.length).toBe(20);
    // Acceptance check: re-run the evaluator filter over the STORED boards.
    expect(verifyBoards(report.boards, spec, ctxOf(published))).toEqual([]);
    for (const b of report.boards) {
      const action = systemicOpeningAction(b.hands, "S", ctxOf(published));
      expect(["1C", "1D", "1H", "1S"]).toContain(action);
      expect(b.lineage).toMatchObject({
        specSeed: 7,
        scopeItemId: "ki_bn_scope_level1",
        packageRef: { packageId: BEGINNER_NATURAL_PACKAGE_ID, version: "0.1.0" },
      });
      expect(b.targetConceptIds).toContain("bn_opening_bids");
    }
    // Rejection sampling actually rejected (dealers with <12 HCP pass).
    expect(report.attempts).toBeGreaterThan(20);
    expect(report.acceptanceRate).toBeLessThan(1);
    expect(report.acceptanceRate).toBeGreaterThan(0.05);
  });

  it("is deterministic: same (seed, spec, package version) -> identical set", () => {
    const spec = specFromTeachingScope(
      scopeItem.itemId,
      scopeItem.structuredFields.scope as TeachingScopeFields,
      { seed: 7, count: 5, dealer: "S" },
    );
    const a = generateConstrainedBoards(spec, ctxOf(published));
    const b = generateConstrainedBoards(spec, ctxOf(published));
    expect(a).toEqual(b);
  });
});

describe('the original example: "no hands where 1NT is the systemic action"', () => {
  // Synthetic system = v0 + a 15-17 balanced 1NT opening (what Level 2 will
  // add). The dealer must then be able to EXCLUDE deals where any seat's
  // systemic action would be 1NT.
  let withNt: BridgeRulePackage;

  beforeAll(() => {
    withNt = {
      ...published,
      bidRules: [
        {
          ruleId: "test_open_1nt",
          title: "Open 1NT with 15-17 balanced (synthetic Level-2 rule)",
          priority: 5,
          settingGates: [],
          auctionContext: { role: "opening" },
          handConditions: {
            all: [
              { predicate: "hcpRange", params: { min: 15, max: 17 } },
              { predicate: "balanced" },
            ],
          },
          action: { kind: "call", call: "1N" },
          provenance: {
            knowledgeItemIds: ["ki_test_nt"],
            sourceIds: ["src_test"],
            reviewStatus: "needs_review",
          },
          explanationItemId: "ki_test_nt",
        },
        ...published.bidRules,
      ],
    };
  });

  it("some unconstrained deals WOULD open 1NT — and the verifier flags them", () => {
    // Find a deal whose dealer systemically opens 1NT under the NT system.
    let found = null;
    for (let seed = 1; seed < 500 && !found; seed++) {
      const report = generateConstrainedBoards({ seed, count: 1 });
      const action = systemicOpeningAction(report.boards[0]!.hands, "N", ctxOf(withNt));
      if (action === "1N") found = report.boards[0]!;
    }
    expect(found).not.toBeNull();

    const spec = {
      seed: 1,
      count: 1,
      evaluatorFilter: { seats: "all" as const, rejectIfSystemicActionIn: ["1N"] },
    };
    const violations = verifyBoards([found!], spec, ctxOf(withNt));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.problem).toContain("forbidden");
  });

  it("generates a set with zero 1NT-best hands across all four seats", () => {
    const spec = {
      seed: 11,
      count: 20,
      evaluatorFilter: { seats: "all" as const, rejectIfSystemicActionIn: ["1N"] },
    };
    const report = generateConstrainedBoards(spec, ctxOf(withNt));
    expect(report.boards.length).toBe(20);
    expect(verifyBoards(report.boards, spec, ctxOf(withNt))).toEqual([]);
    for (const b of report.boards)
      for (const seat of ["N", "E", "S", "W"] as const)
        expect(systemicOpeningAction(b.hands, seat, ctxOf(withNt))).not.toBe("1N");
  });
});

describe("guard rails", () => {
  it("fails loudly with stats when constraints are infeasible", () => {
    expect(() =>
      generateConstrainedBoards(
        {
          seed: 3,
          count: 2,
          maxAttemptsPerDeal: 25,
          evaluatorFilter: { seats: "dealer", requireSystemicActionIn: ["7N"] },
        },
        ctxOf(published),
      ),
    ).toThrow(/infeasible.*acceptance rate/s);
  });

  it("requires a package context when an evaluator filter is set", () => {
    expect(() =>
      generateConstrainedBoards({
        seed: 1,
        count: 1,
        evaluatorFilter: { seats: "dealer", rejectIfSystemicActionIn: ["1N"] },
      }),
    ).toThrow(/PackageContext/);
  });
});

describe("test boards join the publication workflow (§22 Q8)", () => {
  it("attaches a generated set to a draft, publishes, and runs it in the harness", async () => {
    // New draft version (0.1.0 is already published and immutable).
    const run = await runGeneration(store, {
      systemFamily: "natural",
      requestedBy: "test",
      now: NOW,
      runId: "run_dealer_2",
    });
    const spec = specFromTeachingScope(
      scopeItem.itemId,
      scopeItem.structuredFields.scope as TeachingScopeFields,
      { seed: 21, count: 5, dealer: "S" },
    );
    const report = generateConstrainedBoards(spec, ctxOf(published));
    await attachTestBoardArtifacts(
      store,
      run.resultPackageId!,
      run.resultVersion!,
      report.boards,
      [scopeItem.itemId],
    );
    const rec = await publishPackage(store, run.resultPackageId!, run.resultVersion!, "test", NOW);

    const testBoards = rec.artifacts.filter((a) => a.artifactType === "test_board_reference");
    expect(testBoards.length).toBe(5);
    expect(testBoards[0]!.generatedFromKnowledgeItemIds).toContain("ki_bn_scope_level1");
    expect(testBoards.every((a) => a.status === "published")).toBe(true);

    // Attaching to a published record is refused.
    await expect(
      attachTestBoardArtifacts(store, rec.packageId, rec.version, report.boards, []),
    ).rejects.toThrow(/immutable/);

    // The attached set runs in the golden-board harness.
    const harness = await runBoards(
      report.boards,
      (await import("@bridge/engine")).createPackageDecider({
        pkg: rec.pkg,
        values: defaultSettingValues(rec.pkg.settings),
      }),
    );
    expect(harness.totals.boards).toBe(5);
    expect(harness.totals.bidFallbackRate).toBe(0);
  });
});
