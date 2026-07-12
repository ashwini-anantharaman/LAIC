import { describe, expect, it } from "vitest";
import { initialState } from "../state";
import { BOARD_G1, parseHandShdc } from "../fixtures/goldenBoards";
import { TEST_PACKAGE, TEST_VALUES } from "../fixtures/testPackage";
import { interpretBid } from "./interpreter";
import { KNOWN_PREDICATES } from "./predicates";
import { validatePackage, type BridgeRulePackage } from "./schema";
import { KNOWN_PRIMITIVES } from "../primitives";

const stateFor = (board = BOARD_G1) =>
  initialState(board.name, board.dealer, board.vul, board.hands);

describe("interpretBid", () => {
  it("opens 1S on G1's North hand with a matched, cited trace", () => {
    const d = interpretBid(stateFor(), "N", { pkg: TEST_PACKAGE, values: TEST_VALUES });
    expect(d.action).toBe("1S");
    expect(d.fallback).toBe(false);
    expect(d.matchedRuleId).toBe("tp_open_major");
    expect(d.reason).toContain("tp_open_major");
    expect(d.facts.hcp).toBe(16);
    // Full-trace provenance: every bid rule was considered and has a reason.
    expect(d.trace.length).toBe(TEST_PACKAGE.bidRules.length);
    expect(d.trace.every((r) => r.reason.length > 0)).toBe(true);
  });

  it("falls back to Pass for a seat no rule covers, flagged honestly", () => {
    // East acts after North's 1S: role is "other" — no rule matches.
    let state = stateFor();
    state = { ...state, auction: [{ seat: "N", call: "1S" }], turn: "E" };
    const d = interpretBid(state, "E", { pkg: TEST_PACKAGE, values: TEST_VALUES });
    expect(d.action).toBe("P");
    expect(d.fallback).toBe(true);
    expect(d.reason).toContain("safe default");
  });

  it("responds with a single raise of partner's major", () => {
    let state = stateFor();
    state = {
      ...state,
      auction: [
        { seat: "N", call: "1S" },
        { seat: "E", call: "P" },
      ],
      turn: "S",
    };
    const d = interpretBid(state, "S", { pkg: TEST_PACKAGE, values: TEST_VALUES });
    expect(d.action).toBe("2S");
    expect(d.matchedRuleId).toBe("tp_single_raise");
  });

  it("setting gates control rule availability and are cited in the trace", () => {
    // 11-HCP hand: only the gated light-opening rule could fire.
    const hand = parseHandShdc("AQJ54.432.K32.32"); // A+Q+J+K = 11 HCP
    const board = { ...BOARD_G1, hands: { ...BOARD_G1.hands, N: hand } };

    const off = interpretBid(stateFor(board), "N", { pkg: TEST_PACKAGE, values: TEST_VALUES });
    expect(off.fallback).toBe(false); // tp_pass_weak_opening matches (0-11)
    expect(off.action).toBe("P");
    const gateEval = off.trace.find((r) => r.ruleId === "tp_open_light")!;
    expect(gateEval.matched).toBe(false);
    expect(gateEval.reason).toContain("setting gate failed");
    expect(gateEval.settingsConsulted[0]?.key).toBe("test_open_light");

    const on = interpretBid(stateFor(board), "N", {
      pkg: TEST_PACKAGE,
      values: { test_open_light: true },
    });
    expect(on.action).toBe("1S");
    expect(on.matchedRuleId).toBe("tp_open_light");
    expect(on.citedSettings[0]?.key).toBe("test_open_light");
    expect(on.citedSettings[0]?.matched).toBe(true);
  });

  it("selection policies pick among concurrent matches deterministically", () => {
    const twoMatches: BridgeRulePackage = {
      ...TEST_PACKAGE,
      bidRules: [
        {
          ...TEST_PACKAGE.bidRules[0]!,
          ruleId: "wide",
          title: "wide",
          priority: 10,
          handConditions: { predicate: "hcpRange", params: { min: 0, max: 40 } },
          action: { kind: "call", call: "1C" },
        },
        {
          ...TEST_PACKAGE.bidRules[0]!,
          ruleId: "narrow",
          title: "narrow",
          priority: 20,
          handConditions: { predicate: "hcpRange", params: { min: 15, max: 17 } },
          action: { kind: "call", call: "1D" },
        },
      ],
    };
    const first = interpretBid(stateFor(), "N", { pkg: twoMatches, values: {} });
    expect(first.matchedRuleId).toBe("wide"); // first_match default
    expect(first.matches?.length).toBe(2);
    expect(first.rejected[0]?.why).toContain("policy selected");

    const narrowest = interpretBid(stateFor(), "N", {
      pkg: twoMatches,
      values: {},
      policy: "narrowest",
    });
    expect(narrowest.matchedRuleId).toBe("narrow"); // width 2 beats width 40

    const rngLow = interpretBid(stateFor(), "N", {
      pkg: twoMatches,
      values: {},
      policy: "random",
      rng: () => 0.99,
    });
    expect(rngLow.matchedRuleId).toBe("narrow");
  });
});

describe("validatePackage", () => {
  it("accepts the test package", () => {
    expect(validatePackage(TEST_PACKAGE, KNOWN_PREDICATES, KNOWN_PRIMITIVES)).toEqual([]);
  });

  it("rejects unknown predicates, primitives, and duplicate rule ids", () => {
    const bad: BridgeRulePackage = {
      ...TEST_PACKAGE,
      bidRules: [
        { ...TEST_PACKAGE.bidRules[0]!, handConditions: { predicate: "nope" } },
        { ...TEST_PACKAGE.bidRules[1]!, ruleId: TEST_PACKAGE.bidRules[0]!.ruleId },
        { ...TEST_PACKAGE.bidRules[2]!, complexPrimitive: "does_not_exist" },
      ],
      playRules: [],
    };
    const errors = validatePackage(bad, KNOWN_PREDICATES, KNOWN_PRIMITIVES);
    expect(errors.some((e) => e.includes('unknown predicate "nope"'))).toBe(true);
    expect(errors.some((e) => e.includes("duplicate ruleId"))).toBe(true);
    expect(errors.some((e) => e.includes("unknown complexPrimitive"))).toBe(true);
  });
});
