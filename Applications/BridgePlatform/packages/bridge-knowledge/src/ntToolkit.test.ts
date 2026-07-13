// NT toolkit port: gated OFF by default (goldens untouched), and under the
// bn_nt_toolkit preset the classic sequences come out of the interpreter.

import { initialState, interpretBid, seededBoard, type BridgeRulePackage } from "@bridge/engine";
import { defaultSettingValues } from "@bridge/config";
import { beforeAll, describe, expect, it } from "vitest";
import { BEGINNER_NATURAL_PACKAGE_ID, BEGINNER_NATURAL_V0_SEED } from "./content/beginnerNaturalV0";
import { LEVEL2_ITEMS } from "./content/level2";
import { NT_TOOLKIT_ITEMS } from "./content/ntToolkit";
import { runGeneration } from "./generate";
import { InMemoryKnowledgeStore } from "./store";

let pkg: BridgeRulePackage;

beforeAll(async () => {
  const store = new InMemoryKnowledgeStore({
    ...BEGINNER_NATURAL_V0_SEED,
    items: [...BEGINNER_NATURAL_V0_SEED.items!, ...LEVEL2_ITEMS, ...NT_TOOLKIT_ITEMS],
  });
  const run = await runGeneration(store, {
    systemFamily: "natural",
    requestedBy: "test",
    now: "2026-07-12T00:00:00.000Z",
    runId: "run_nt",
  });
  if (run.status !== "completed") throw new Error(run.errors.join("; "));
  pkg = (await store.getPackage(BEGINNER_NATURAL_PACKAGE_ID, run.resultVersion!))!.pkg;
});

const hand = (spec: Record<"S" | "H" | "D" | "C", number[]>) =>
  (Object.entries(spec) as ["S" | "H" | "D" | "C", number[]][]).flatMap(([suit, ranks]) =>
    ranks.map((rank) => ({ suit, rank: rank as never })),
  );

const at = (
  seat: "N" | "E" | "S" | "W",
  auction: { seat: "N" | "E" | "S" | "W"; call: string }[],
  cards: ReturnType<typeof hand>,
) => {
  const board = seededBoard(5);
  board.hands[seat] = cards as never;
  return { ...initialState("t", "N", "none", board.hands), auction: auction as never, turn: seat };
};

const defaults = () => defaultSettingValues(pkg.settings);
const toolkitValues = () => ({
  ...defaults(),
  ...pkg.presets!.find((p) => p.presetId === "bn_nt_toolkit")!.values,
});

describe("NT toolkit (ported from the prototype, sourced)", () => {
  it("ships in the package with a preset, defaults OFF", () => {
    expect(pkg.presets!.map((p) => p.presetId)).toContain("bn_nt_toolkit");
    for (const key of ["bn2_strong_2c", "bn2_2nt_open", "bn2_weak_twos", "bn2_stayman", "bn2_transfers"])
      expect(defaults()[key]).toBe(false);
  });

  it("weak two: 2♠ with 6 spades and 7 HCP (off by default)", () => {
    const state = at("N", [], hand({ S: [13, 12, 11, 10, 9, 8], H: [5, 4], D: [7, 3, 2], C: [6, 5] }));
    expect(interpretBid(state, "N", { pkg, values: toolkitValues() }).action).toBe("2S");
    expect(interpretBid(state, "N", { pkg, values: defaults() }).action).toBe("P");
  });

  it("transfer: 2♦ over 1NT with five hearts; Stayman 2♣ with a four-card major and 8+", () => {
    const nt = [{ seat: "N" as const, call: "1N" }, { seat: "E" as const, call: "P" }];
    const fiveHearts = at("S", nt, hand({ S: [7, 2], H: [13, 11, 8, 4, 3], D: [12, 5, 4], C: [9, 8, 2] }));
    expect(interpretBid(fiveHearts, "S", { pkg, values: toolkitValues() }).action).toBe("2D");

    const fourSpades = at("S", nt, hand({ S: [14, 12, 8, 4], H: [9, 3], D: [13, 5, 4], C: [11, 8, 2] }));
    const d = interpretBid(fourSpades, "S", { pkg, values: toolkitValues() });
    expect(d.action).toBe("2C");
    expect(d.matchedRuleId).toBe("bn2_stayman_ask");
  });

  it("opener answers Stayman and completes transfers", () => {
    const staymanAuction = [
      { seat: "N" as const, call: "1N" }, { seat: "E" as const, call: "P" },
      { seat: "S" as const, call: "2C" }, { seat: "W" as const, call: "P" },
    ];
    const withMajor = at("N", staymanAuction, hand({ S: [14, 13, 5, 2], H: [12, 8, 3], D: [14, 12], C: [13, 10, 4, 2] }));
    expect(interpretBid(withMajor, "N", { pkg, values: toolkitValues() }).action).toBe("2S");

    const noMajor = at("N", staymanAuction, hand({ S: [14, 13, 5], H: [12, 8, 3], D: [14, 12, 6], C: [13, 10, 4, 2] }));
    expect(interpretBid(noMajor, "N", { pkg, values: toolkitValues() }).action).toBe("2D");

    const transferAuction = [
      { seat: "N" as const, call: "1N" }, { seat: "E" as const, call: "P" },
      { seat: "S" as const, call: "2D" }, { seat: "W" as const, call: "P" },
    ];
    const opener = at("N", transferAuction, hand({ S: [14, 13, 5], H: [12, 8, 3], D: [14, 12, 6], C: [13, 10, 4, 2] }));
    expect(interpretBid(opener, "N", { pkg, values: toolkitValues() }).action).toBe("2H");
  });

  it("every toolkit item is sourced — booklet anchors or the named Claude source", () => {
    for (const item of NT_TOOLKIT_ITEMS) {
      expect(item.sourceIds.length).toBeGreaterThan(0);
      expect(item.citations.length).toBeGreaterThan(0);
      for (const c of item.citations)
        expect(["src_sayc_booklet", "src_claude"]).toContain(c.sourceId);
    }
  });
});

describe("numeric-parameter binding ($setting)", () => {
  it("the 1NT opening range comes FROM nt1_range — changing it changes the opening", () => {
    // 13 HCP balanced: A(4)+K(3)+Q(2)+Q(2)+J(1)+J(1).
    const thirteen = at("N", [], hand({ S: [14, 5, 3, 2], H: [13, 12, 4], D: [12, 11, 6], C: [11, 7, 2] }));
    const defaults15to17 = { ...defaults(), bn2_1nt_open: true };
    const tuned12to14 = { ...defaults15to17, nt1_range: { low: 12, high: 14 } };

    expect(interpretBid(thirteen, "N", { pkg, values: defaults15to17 }).action).not.toBe("1N");
    const tuned = interpretBid(thirteen, "N", { pkg, values: tuned12to14 });
    expect(tuned.action).toBe("1N");
    // The range that drove the decision is cited.
    expect(tuned.citedSettings.map((c) => c.key)).toContain("nt1_range");
  });
});
