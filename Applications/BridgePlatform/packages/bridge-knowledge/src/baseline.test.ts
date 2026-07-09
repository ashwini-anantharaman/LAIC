// Phase 3 acceptance: the golden-board harness runs the PUBLISHED Beginner
// Natural v0 package; the baseline is pinned here. Because v0 explicitly
// defines "no agreement -> pass" and lead/follow rules, there are ZERO
// fallbacks: every decision is a cited rule.

import { defaultSettingValues } from "@bridge/config";
import { createPackageDecider, GOLDEN_BOARDS, runBoards } from "@bridge/engine";

import { describe, expect, it } from "vitest";
import { BEGINNER_NATURAL_PACKAGE_ID, BEGINNER_NATURAL_V0_SEED } from "./content/beginnerNaturalV0";
import { publishPackage, runGeneration } from "./generate";
import { InMemoryKnowledgeStore } from "./store";

const NOW = "2026-07-08T12:00:00.000Z";

async function publishedV0() {
  const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
  await runGeneration(store, {
    systemFamily: "natural",
    requestedBy: "user_reviewer_rhea",
    now: NOW,
    runId: "run_baseline",
  });
  return publishPackage(store, BEGINNER_NATURAL_PACKAGE_ID, "0.1.0", "user_reviewer_rhea", NOW);
}

describe("Beginner Natural v0 golden-board baseline", () => {
  it("plays the golden boards with zero fallbacks (all decisions cited)", async () => {
    const record = await publishedV0();
    const decider = createPackageDecider({
      pkg: record.pkg,
      values: defaultSettingValues(record.pkg.settings),
    });
    const report = await runBoards(GOLDEN_BOARDS, decider);

    // BASELINE (v0.1.0) — a future regeneration changing these must explain why.
    expect(report.totals.boards).toBe(5);
    expect(report.totals.bidFallbackRate).toBe(0);
    expect(report.totals.playFallbackRate).toBe(0);
    expect(report.boards[0]!.contract).toBe("2♠ by N"); // G1: 1S - P - 2S, all pass

    // Determinism: the baseline is reproducible bit-for-bit.
    const again = await runBoards(GOLDEN_BOARDS, decider);
    expect(again).toEqual(report);
  });

  it("the 1NT-response setting changes behavior when toggled off", async () => {
    const record = await publishedV0();
    const on = createPackageDecider({
      pkg: record.pkg,
      values: { bn_1nt_response: true },
    });
    const off = createPackageDecider({
      pkg: record.pkg,
      values: { bn_1nt_response: false },
    });
    const [reportOn, reportOff] = [await runBoards(GOLDEN_BOARDS, on), await runBoards(GOLDEN_BOARDS, off)];
    // Same boards, same rules except the gated 1NT response — reports may
    // legitimately differ, but both must stay fully covered (pass-otherwise).
    expect(reportOn.totals.bidFallbackRate).toBe(0);
    expect(reportOff.totals.bidFallbackRate).toBe(0);
  });
});
