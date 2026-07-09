// Phase 2 acceptance: the golden-board harness runs a package over curated
// boards and reports decisions + fallback rate, deterministically.

import { describe, expect, it } from "vitest";
import { GOLDEN_BOARDS } from "./fixtures/goldenBoards";
import { TEST_PACKAGE, TEST_VALUES } from "./fixtures/testPackage";
import { runBoards } from "./harness";
import { createPackageDecider } from "./rules/decider";

const decider = () => createPackageDecider({ pkg: TEST_PACKAGE, values: TEST_VALUES });

describe("golden-board harness", () => {
  it("plays every golden board to completion and reports fallback rates", async () => {
    const report = await runBoards(GOLDEN_BOARDS, decider());

    expect(report.totals.boards).toBe(GOLDEN_BOARDS.length);
    expect(report.totals.decisions).toBeGreaterThan(0);
    // The test package covers lead+follow, so play never falls back...
    expect(report.totals.playFallbackRate).toBe(0);
    // ...while bidding falls back for uncovered roles (flagged, measured).
    expect(report.totals.bidFallbackRate).toBeGreaterThan(0);
    expect(report.totals.bidFallbackRate).toBeLessThan(1);

    // G1's known outcome is pinned.
    const g1 = report.boards[0]!;
    expect(g1.contract).toBe("2♠ by N");
    expect(g1.tricksNS + g1.tricksEW).toBe(13);
  });

  it("is deterministic: identical runs produce identical reports", async () => {
    const a = await runBoards(GOLDEN_BOARDS, decider());
    const b = await runBoards(GOLDEN_BOARDS, decider());
    expect(a).toEqual(b);
  });
});
