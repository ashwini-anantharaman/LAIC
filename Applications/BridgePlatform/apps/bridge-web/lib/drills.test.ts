// Unit tests for the drills runner (drills.ts): call normalization, expected
// parsing, seat folding, and running a drill against a minimal compiled KB —
// pass, fail, floor, and error paths. No network, no store.

import { describe, expect, it } from "vitest";
import type { Card, Seat } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";
import type { LibraryEntry } from "@bridge/sessions";
import {
  drillPlayerConfig,
  foldToAct,
  normalizeDrillCall,
  parseExpectedCalls,
  runDrill,
  runDrills,
} from "./drills";

const card = (suit: Card["suit"], rank: number): Card => ({ suit, rank: rank as Card["rank"] });

/** A balanced 16-count: ♠AKQ2 ♥K94 ♦K32 ♣A87. */
const balanced16: Card[] = [
  card("S", 14), card("S", 13), card("S", 12), card("S", 2),
  card("H", 13), card("H", 9), card("H", 4),
  card("D", 13), card("D", 3), card("D", 2),
  card("C", 14), card("C", 8), card("C", 7),
];

/** A compile with one rule: opening seat, 15+ HCP ⇒ open 1NT. No fallback. */
function compiledWith1N(): CompiledKb {
  return {
    compileId: "cmp_test",
    kbId: "kb_test",
    version: 1,
    compiledAt: "2026-07-24T00:00:00.000Z",
    inputHash: "test",
    settings: [],
    defaults: {},
    auctionRules: [
      {
        ruleId: "it_open.r1",
        label: "1NT opening",
        context: { role: "opening" },
        conditions: { all: [{ hcp: { min: 15 } }] },
        action: { type: "bid", level: 1, strain: "N" },
        order: 0,
        settingGates: [],
        provenance: { itemId: "it_open", itemVersion: 1, itemTitle: "1NT opening" },
      },
    ],
    forcingRules: [],
    leadRules: [],
    playRules: [],
    signalDefaults: {},
    fallbacks: [],
    conflicts: [],
    requires: [],
    items: [
      { itemId: "it_open", version: 1, title: "1NT opening", knowledgeType: "agreement", enableSettingKeys: [] },
    ],
    packs: [],
  };
}

function emptyCompiled(): CompiledKb {
  return { ...compiledWith1N(), auctionRules: [] };
}

const drill = (over: Partial<LibraryEntry>): LibraryEntry => ({
  entryId: "le_1",
  kind: "drill",
  name: "test drill",
  tags: [],
  dealer: "N",
  vul: "none",
  auction: [],
  hands: { N: balanced16, E: [], S: [], W: [] },
  expectedCalls: ["1N"],
  origin: "authored",
  createdBy: "u1",
  createdAt: "2026-07-24T00:00:00.000Z",
  ...over,
});

describe("normalizeDrillCall", () => {
  it("canonicalizes passes, doubles, and NT spellings", () => {
    expect(normalizeDrillCall("pass")).toBe("P");
    expect(normalizeDrillCall("Dbl")).toBe("X");
    expect(normalizeDrillCall("rdbl")).toBe("XX");
    expect(normalizeDrillCall("1nt")).toBe("1N");
    expect(normalizeDrillCall("4S")).toBe("4S");
  });
  it("rejects nonsense", () => {
    expect(normalizeDrillCall("8H")).toBeNull();
    expect(normalizeDrillCall("hello")).toBeNull();
  });
});

describe("parseExpectedCalls", () => {
  it("splits, normalizes, and dedups", () => {
    expect(parseExpectedCalls("4S, 3s  4S")).toEqual(["4S", "3S"]);
    expect(parseExpectedCalls("pass")).toEqual(["P"]);
    expect(parseExpectedCalls("")).toEqual([]);
  });
});

describe("foldToAct", () => {
  it("is the dealer for an empty auction", () => {
    expect(foldToAct(drill({ dealer: "E", auction: [] }))).toBe("E");
  });
  it("is the seat after the last call otherwise", () => {
    const auction: { seat: Seat; call: "P" }[] = [
      { seat: "N", call: "P" },
      { seat: "E", call: "P" },
    ];
    expect(foldToAct(drill({ dealer: "N", auction }))).toBe("S");
  });
});

describe("runDrill", () => {
  it("passes when the engine's call is in the expected set", async () => {
    const r = await runDrill(drill({ expectedCalls: ["1N"] }), compiledWith1N(), drillPlayerConfig(undefined));
    expect(r.errored).toBe(false);
    expect(r.pass).toBe(true);
    expect(r.got).toBe("1N");
    expect(r.itemId).toBe("it_open");
  });

  it("fails when the engine disagrees, keeping the because-English", async () => {
    const r = await runDrill(drill({ expectedCalls: ["1S"] }), compiledWith1N(), drillPlayerConfig(undefined));
    expect(r.pass).toBe(false);
    expect(r.got).toBe("1N");
    expect(r.because).toBeTruthy();
  });

  it("fails and marks fallback when no knowledge covers the point (floor)", async () => {
    const r = await runDrill(drill({ expectedCalls: ["1N"] }), emptyCompiled(), drillPlayerConfig(undefined));
    expect(r.pass).toBe(false);
    expect(r.fallback).toBe(true);
    expect(r.got).toBe("P");
  });

  it("errors when the acting seat has no hand", async () => {
    const r = await runDrill(
      drill({ hands: { N: [], E: [], S: [], W: [] } }),
      compiledWith1N(),
      drillPlayerConfig(undefined),
    );
    expect(r.errored).toBe(true);
    expect(r.pass).toBe(false);
  });

  it("errors when no expected call is recorded", async () => {
    const r = await runDrill(drill({ expectedCalls: [] }), compiledWith1N(), drillPlayerConfig(undefined));
    expect(r.errored).toBe(true);
  });
});

describe("runDrills", () => {
  it("summarizes pass / fail / errored counts", async () => {
    const { passed, failed, errored } = await runDrills(
      [
        drill({ entryId: "a", expectedCalls: ["1N"] }),
        drill({ entryId: "b", expectedCalls: ["1S"] }),
        drill({ entryId: "c", expectedCalls: [] }),
      ],
      compiledWith1N(),
      drillPlayerConfig(undefined),
    );
    expect(passed).toBe(1);
    expect(failed).toBe(1);
    expect(errored).toBe(1);
  });
});
