// Pillar A compile surface: the `shows`/`ask` meaning metadata is emitted on
// CompiledAuctionRule (explicit wins; derived otherwise), the derive pass reads
// only literal bounds off a flat `all`, and settingRefs still validates the new
// partnership predicates' $setting refs at the standard nesting depth.

import { describe, expect, it } from "vitest";
import { compileKb, deriveShows } from "./compile";
import type { HandCondition } from "./language";
import type { KnowledgeItem } from "./model";

const NOW = "2026-07-24T00:00:00.000Z";
function ruleItem(rules: object[]): KnowledgeItem {
  return {
    sourceReferences: [{ sourceId: "src", anchor: "t" }],
    supportedLevels: [],
    status: "approved",
    version: 1,
    createdBy: "u",
    createdAt: NOW,
    updatedAt: NOW,
    settings: [],
    itemId: "ki_a",
    title: "T",
    humanReadableText: "t",
    knowledgeType: "agreement",
    phase: "auction",
    payload: { kind: "auction_rules", rules },
  } as unknown as KnowledgeItem;
}

const compile = (items: KnowledgeItem[]) =>
  compileKb({ kbId: "kb_t", version: 1, compiledAt: NOW, items, edges: [], packs: [] });

describe("deriveShows", () => {
  it("collects literal hcp/tp/suit bounds from a flat all", () => {
    const cond: HandCondition = {
      all: [
        { hcp: { min: 6, max: 9 } },
        { totalPoints: { min: 7 } },
        { suitLength: { suit: "S", min: 4 } },
      ],
    };
    expect(deriveShows(cond)).toEqual({
      hcp: { min: 6, max: 9 },
      tp: { min: 7 },
      suits: [{ suit: "S", min: 4 }],
    });
  });

  it("derives from a single bare predicate", () => {
    expect(deriveShows({ hcp: { min: 12 } })).toEqual({ hcp: { min: 12 } });
  });

  it("any/not and contextual suits contribute nothing", () => {
    expect(deriveShows({ any: [{ hcp: { min: 6 } }] })).toBeUndefined();
    expect(deriveShows({ not: { balanced: true } })).toBeUndefined();
    // A contextual suit ref can't be pinned to a literal suit.
    expect(deriveShows({ suitLength: { suit: "partner_last_bid_suit", min: 4 } })).toBeUndefined();
    // $setting bounds aren't resolvable at compile → skipped.
    expect(deriveShows({ hcp: { min: { $setting: "x" } } })).toBeUndefined();
  });
});

describe("compile emits shows / ask", () => {
  it("derives shows when the spec omits it", () => {
    const res = compile([
      ruleItem([
        {
          key: "open",
          label: "Open 1H",
          context: { role: "opening" },
          conditions: { all: [{ hcp: { min: 12, max: 21 } }, { suitLength: { suit: "H", min: 5 } }] },
          action: { type: "bid", level: 1, strain: "H" },
          priority: 10,
        },
      ]),
    ]);
    const rule = res.compiled!.auctionRules.find((r) => r.ruleId === "ki_a.open")!;
    expect(rule.shows).toEqual({ hcp: { min: 12, max: 21 }, suits: [{ suit: "H", min: 5 }] });
  });

  it("an explicit shows overrides the derivation, and ask survives", () => {
    const res = compile([
      ruleItem([
        {
          key: "bw",
          label: "Blackwood 4NT",
          context: { role: "any" },
          conditions: { hcp: { min: 15 } },
          action: { type: "bid", level: 4, strain: "N" },
          shows: { forcing: true },
          ask: { id: "blackwood", responses: { "5D": { keycards: [1, 4] } } },
          priority: 10,
        },
      ]),
    ]);
    const rule = res.compiled!.auctionRules.find((r) => r.ruleId === "ki_a.bw")!;
    expect(rule.shows).toEqual({ forcing: true }); // explicit, not derived hcp
    expect(rule.ask).toEqual({ id: "blackwood", responses: { "5D": { keycards: [1, 4] } } });
  });

  it("omits shows entirely when nothing is derivable and none authored", () => {
    const res = compile([
      ruleItem([
        {
          key: "pass",
          label: "Pass",
          context: { role: "any" },
          conditions: { any: [{ hcp: { min: 6 } }] },
          action: { type: "pass" },
          priority: 10,
        },
      ]),
    ]);
    const rule = res.compiled!.auctionRules.find((r) => r.ruleId === "ki_a.pass")!;
    expect(rule.shows).toBeUndefined();
  });
});

describe("settingRefs still validates partnership predicates", () => {
  it("flags an unknown $setting nested in combinedHcp (standard depth)", () => {
    const res = compile([
      ruleItem([
        {
          key: "inv",
          label: "Invite",
          context: { role: "responder" },
          conditions: { combinedHcp: { min: { $setting: "game_values" } } },
          action: { type: "bid", level: 3, strain: "N" },
          priority: 10,
        },
      ]),
    ]);
    expect(res.compiled).toBeUndefined();
    expect(res.errors.some((e) => /unknown setting "game_values"/.test(e.message))).toBe(true);
  });

  it("accepts the ref once the setting is declared", () => {
    const item = ruleItem([
      {
        key: "inv",
        label: "Invite",
        context: { role: "responder" },
        conditions: { combinedHcp: { min: { $setting: "game_values" } } },
        action: { type: "bid", level: 3, strain: "N" },
        priority: 10,
      },
    ]);
    item.settings = [
      { key: "game_values", label: "Game values", control: "number", role: "parameter", default: 25 },
    ];
    const res = compile([item]);
    expect(res.compiled).toBeTruthy();
    expect(res.errors).toEqual([]);
  });
});
