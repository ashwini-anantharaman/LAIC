// Language extensions for the curated SAYC build (2026-07-21): ace/king/
// keycard/specific-card predicates, first-bid + LHO auction memory, the
// contextual bid_suit action, the CallPattern `level` shorthand — and the
// judgment-tier extensions (vulnerability, opponents' suits, cue detection,
// the fourth suit, playing tricks, forcing rules).

import type { AuctionCall, Card, Seat, Suit } from "@bridge/events";
import type { HandCondition, KnowledgeItem } from "@bridge/kb";
import { InMemoryKbStore, KbService } from "@bridge/kb";
import { describe, expect, it } from "vitest";
import { initialState, type GameState } from "../state";
import { realizeAuctionAction } from "./actions";
import { analyzeSeat, matchCallPattern, matchContext } from "./auctionContext";
import { createKbDecider, type KbPlayerConfig } from "./decider";
import { evalCondition, type ConditionEnv } from "./handConditions";

const rankOf: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const hand = (spec: string): Card[] =>
  spec.split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: rankOf[t[1]!]! as Card["rank"] }));

const calls = (...list: [Seat, string][]): AuctionCall[] =>
  list.map(([seat, call]) => ({ seat, call: call as AuctionCall["call"] }));

const envFor = (auction: AuctionCall[], seat: Seat): ConditionEnv => ({
  values: {},
  facts: analyzeSeat(auction, seat),
  consulted: new Set(),
});

// Two aces (S, H), one king (D), Q of spades.
const TWO_ACES = hand("SA SQ S4 S3 HA H7 H6 DK D8 D5 C7 C4 C2");

describe("counting predicates", () => {
  const env = envFor([], "S");
  const holds = (cond: HandCondition) => evalCondition(cond, TWO_ACES, env);

  it("aces / kings count exactly", () => {
    expect(holds({ aces: { min: 2, max: 2 } })).toBe(true);
    expect(holds({ aces: { min: 3 } })).toBe(false);
    expect(holds({ kings: { min: 1, max: 1 } })).toBe(true);
    expect(holds({ kings: { min: 2 } })).toBe(false);
  });

  it("keycards = aces + the ref suit's king", () => {
    expect(holds({ keycards: { suit: "D", min: 3, max: 3 } })).toBe(true); // 2 aces + DK
    expect(holds({ keycards: { suit: "S", min: 2, max: 2 } })).toBe(true); // no SK
  });

  it("keycards resolves contextual trump from partner's FIRST bid", () => {
    // Partner opened 1D, then bid 4N — first bid suit is diamonds.
    const auction = calls(["N", "1D"], ["E", "P"], ["S", "1S"], ["W", "P"], ["N", "4N"], ["E", "P"]);
    const env2 = envFor(auction, "S");
    expect(
      evalCondition({ keycards: { suit: "partner_first_bid_suit", min: 3, max: 3 } }, TWO_ACES, env2),
    ).toBe(true);
  });

  it("holds finds a specific card (trump queen)", () => {
    const env1 = envFor([], "S");
    expect(evalCondition({ holds: { suit: "S", rank: 12 } }, TWO_ACES, env1)).toBe(true);
    expect(evalCondition({ holds: { suit: "H", rank: 12 } }, TWO_ACES, env1)).toBe(false);
  });
});

describe("auction memory extensions", () => {
  // S opened 1S, W overcalled 2H, N raised, E passed; S to rebid.
  const auction = calls(
    ["S", "1S"], ["W", "2H"], ["N", "2S"], ["E", "P"],
  );

  it("first/last bids and LHO are tracked", () => {
    const facts = analyzeSeat(auction, "S");
    expect(facts.ownFirst).toBe("1S");
    expect(facts.ownFirstBid).toBe("1S");
    expect(facts.partnerFirst).toBe("2S");
    expect(facts.lhoLast).toBe("2H"); // W is LHO of S
    expect(facts.rhoLast).toBe("P"); // E is RHO of S
  });

  it("matchContext honors ownFirst / partnerFirst / lhoLast", () => {
    const facts = analyzeSeat(auction, "S");
    expect(
      matchContext(
        {
          role: "opener",
          ownFirst: { kind: "bid", level: 1, strains: ["S"] },
          partnerFirst: { kind: "bid", strains: ["S"] },
          lhoLast: { kind: "bid", strains: ["H"] },
        },
        facts,
      ),
    ).toBe(true);
    expect(
      matchContext({ role: "opener", lhoLast: { kind: "pass" } }, facts),
    ).toBe(false);
  });

  it("first non-pass call can be a double while first BID skips it", () => {
    // W doubles first, later bids hearts.
    const a = calls(["S", "1S"], ["W", "X"], ["N", "P"], ["E", "P"], ["S", "P"], ["W", "2H"]);
    const facts = analyzeSeat(a, "E");
    expect(facts.partnerFirst).toBe("X");
    expect(facts.partnerFirstBid).toBe("2H");
  });
});

describe("CallPattern level shorthand", () => {
  it("bare level means exactly that level", () => {
    expect(matchCallPattern({ kind: "bid", level: 1, strains: ["S"] }, "1S")).toBe(true);
    expect(matchCallPattern({ kind: "bid", level: 1, strains: ["S"] }, "2S")).toBe(false);
    // explicit min/max still win when present
    expect(matchCallPattern({ kind: "bid", level: 1, levelMax: 3 }, "2S")).toBe(true);
  });
});

describe("bid_suit action", () => {
  const state = (auction: AuctionCall[], south: Card[]): GameState => {
    const hands: Record<Seat, Card[]> = { N: [], E: [], S: south, W: [] };
    const s = initialState("t1", "N", "none", hands);
    s.auction = auction;
    s.turn = "S";
    return s;
  };

  it("cue-bids RHO's suit at the cheapest legal level (direct seat)", () => {
    const auction = calls(["E", "1H"]);
    const st = state(auction, TWO_ACES);
    const call = realizeAuctionAction(
      { type: "bid_suit", suit: "rho_bid_suit" },
      st,
      "S",
      analyzeSeat(auction, "S"),
    );
    expect(call).toBe("2H"); // Michaels-style cue of E's hearts
  });

  it("rebids own first suit at a given level and self-gates when unresolvable", () => {
    const auction = calls(["S", "1S"], ["W", "P"], ["N", "2S"], ["E", "P"]);
    const st = state(auction, TWO_ACES);
    const facts = analyzeSeat(auction, "S");
    expect(
      realizeAuctionAction({ type: "bid_suit", suit: "own_first_bid_suit", level: 4 }, st, "S", facts),
    ).toBe("4S");
    // Nobody bid a suit for the ref → the rule simply does not act.
    const empty = state([], TWO_ACES);
    expect(
      realizeAuctionAction(
        { type: "bid_suit", suit: "partner_first_bid_suit" },
        empty,
        "S",
        analyzeSeat([], "S"),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Judgment-tier extensions (2026-07-21)
// ---------------------------------------------------------------------------

describe("vulnerability facts", () => {
  it("is relative to the seat", () => {
    expect(analyzeSeat([], "N", "ns").vulnerability).toBe("unfavorable");
    expect(analyzeSeat([], "E", "ns").vulnerability).toBe("favorable");
    expect(analyzeSeat([], "N", "none").vulnerability).toBe("equal");
    expect(analyzeSeat([], "N", "both").vulnerability).toBe("equal");
    expect(analyzeSeat([], "N").vulnerability).toBe("equal"); // default: none
  });

  it("matchContext gates on it", () => {
    const facts = analyzeSeat([], "E", "ns");
    expect(matchContext({ role: "any", vulnerability: "favorable" }, facts)).toBe(true);
    expect(matchContext({ role: "any", vulnerability: "unfavorable" }, facts)).toBe(false);
  });
});

describe("opponents' suits and cue detection", () => {
  it("counts DISTINCT opponent suits only", () => {
    // E bid spades, W diamonds; S's 2S is our side and doesn't count.
    const auction = calls(["E", "1S"], ["S", "2S"], ["W", "3D"], ["N", "P"], ["E", "3S"]);
    const facts = analyzeSeat(auction, "S");
    expect(facts.oppSuitsBid).toBe(2);
    expect(facts.suitsBid).toEqual(["S", "D"]);
    expect(matchContext({ role: "any", oppSuitsBidMax: 1 }, facts)).toBe(false);
    expect(matchContext({ role: "any", oppSuitsBidMin: 2 }, facts)).toBe(true);
  });

  it("partnerCued: partner's suit was bid FIRST by the opponents", () => {
    // Michaels: E opens 1S, partner (S) cue-bids 2S — N sees a cue.
    const cue = calls(["E", "1S"], ["S", "2S"], ["W", "P"]);
    expect(analyzeSeat(cue, "N").partnerCued).toBe(true);
    expect(matchContext({ role: "any", partnerCued: true }, analyzeSeat(cue, "N"))).toBe(true);
    // A fresh-suit overcall is not a cue.
    const natural = calls(["E", "1S"], ["S", "2H"], ["W", "P"]);
    expect(analyzeSeat(natural, "N").partnerCued).toBe(false);
    // Partner bid the suit before the opponents echoed it — still not a cue.
    const oursFirst = calls(["S", "1H"], ["W", "P"], ["N", "P"], ["E", "2H"], ["S", "3H"]);
    expect(analyzeSeat(oursFirst, "N").partnerCued).toBe(false);
  });
});

describe("only_unbid_suit", () => {
  const FOUR_CLUBS = hand("SA S4 S3 HA H7 H6 DK D8 D5 C7 C4 C3 C2");

  it("resolves the fourth suit when exactly three are bid", () => {
    const auction = calls(["N", "1D"], ["E", "P"], ["S", "1H"], ["W", "P"], ["N", "1S"], ["E", "P"]);
    const env = envFor(auction, "S");
    expect(
      evalCondition({ suitLength: { suit: "only_unbid_suit", min: 4 } }, FOUR_CLUBS, env),
    ).toBe(true);
    expect(
      evalCondition({ suitLength: { suit: "only_unbid_suit", min: 5 } }, FOUR_CLUBS, env),
    ).toBe(false);
  });

  it("does not resolve with fewer or more than three suits bid", () => {
    const two = calls(["N", "1D"], ["E", "P"], ["S", "1H"], ["W", "P"], ["N", "2H"], ["E", "P"]);
    expect(
      evalCondition({ suitLength: { suit: "only_unbid_suit", min: 1 } }, FOUR_CLUBS, envFor(two, "S")),
    ).toBe(false);
  });
});

describe("playingTricks", () => {
  // Spades AKQxxxx = 1 + 1 + 0.5 + 4 length = 6.5; hearts Ax = 1. Total 7.5.
  const SEVEN_AND_A_HALF = hand("SA SK SQ S5 S4 S3 S2 HA H2 D3 D2 C3 C2");
  const env = envFor([], "S");

  it("counts honor + length tricks per suit", () => {
    expect(evalCondition({ playingTricks: { min: 7.5, max: 7.5 } }, SEVEN_AND_A_HALF, env)).toBe(true);
    expect(evalCondition({ playingTricks: { min: 8 } }, SEVEN_AND_A_HALF, env)).toBe(false);
  });

  it("a bare king is half a trick", () => {
    const bareK = hand("SK H8 H7 H6 H5 D8 D7 D6 D5 C5 C4 C3 C2");
    expect(evalCondition({ playingTricks: { min: 0.5, max: 0.5 } }, bareK, env)).toBe(true);
  });
});

describe("forcing rules suppress pass", () => {
  const NOW = "2026-07-21T00:00:00.000Z";
  const base = {
    sourceReferences: [{ sourceId: "src_claude", anchor: "test" }],
    supportedLevels: [],
    status: "approved" as const,
    version: 1,
    createdBy: "u",
    createdAt: NOW,
    updatedAt: NOW,
    settings: [],
  };
  const ITEMS: KnowledgeItem[] = [
    {
      ...base,
      itemId: "ki_forcing",
      title: "Forcing situations",
      humanReadableText: "A two-over-one response forces opener to bid again.",
      knowledgeType: "agreement",
      phase: "auction",
      settings: [
        { key: "forcing_on", label: "Forcing rules", control: "toggle", role: "enable", default: true },
      ],
      payload: {
        kind: "forcing_rules",
        rules: [
          {
            key: "two_over_one",
            label: "Two-over-one response forces a rebid",
            context: {
              role: "opener",
              partnerLast: { kind: "bid", level: 2, strains: ["C", "D", "H"] },
              contested: false,
            },
            priority: 10,
          },
        ],
      },
    },
    {
      ...base,
      itemId: "ki_minpass",
      title: "Pass a minimum",
      humanReadableText: "With nothing more to say, pass.",
      knowledgeType: "agreement",
      phase: "auction",
      payload: {
        kind: "auction_rules",
        rules: [
          {
            key: "minpass",
            label: "Pass a minimum",
            context: { role: "opener" },
            conditions: { hcp: { min: 0 } },
            action: { type: "pass" },
            priority: 50,
          },
        ],
      },
    },
    {
      ...base,
      itemId: "ki_fb",
      title: "Auction fallback: pass",
      humanReadableText: "With no agreement, pass.",
      knowledgeType: "fallback_rule",
      phase: "auction",
      payload: { kind: "fallback", fallback: { phase: "auction", behavior: "pass" } },
    },
  ];

  const player: KbPlayerConfig = {
    enabledPackIds: [],
    settingOverrides: {},
    decisionPolicyId: "first_match",
  };

  async function compileItems() {
    const store = new InMemoryKbStore();
    const service = new KbService(store, { now: () => NOW });
    const kb = await service.createKb({ name: "F", systemLabel: "SAYC", createdBy: "u" });
    for (const item of ITEMS) {
      await store.putItem(item);
      await store.addMembership({ kbId: kb.kbId, itemId: item.itemId });
    }
    await service.recompile(kb.kbId);
    return (await service.liveCompile(kb.kbId))!;
  }

  // N opened 1S, partner responded 2C (a two-over-one): N may not pass.
  const forcingState = (): GameState => {
    const hands: Record<Seat, Card[]> = {
      N: hand("SA SK S7 S6 S5 H8 H7 H6 D8 D7 D6 C3 C2"),
      E: [], S: [], W: [],
    };
    const s = initialState("t1", "N", "none", hands);
    s.auction = calls(["N", "1S"], ["E", "P"], ["S", "2C"], ["W", "P"]);
    s.turn = "N";
    return s;
  };

  it("suppresses a matched pass and bids the longest suit instead", async () => {
    const compiled = await compileItems();
    const decider = createKbDecider({ compiled, player });
    const d = await decider.decideBid(forcingState(), "N");
    expect(d.action).toBe("2S"); // cheapest legal in the 5-card spade suit
    expect(d.fallback).toBe(true);
    expect(d.matchedRuleId).toBe("ki_forcing.two_over_one");
    expect(d.reason).toContain("Two-over-one response forces a rebid");
    expect(d.trace.some((t) => t.reason?.includes("pass suppressed"))).toBe(true);
  });

  it("the enable gate turns the guard off", async () => {
    const compiled = await compileItems();
    const decider = createKbDecider({
      compiled,
      player: { ...player, settingOverrides: { forcing_on: false } },
    });
    const d = await decider.decideBid(forcingState(), "N");
    expect(d.action).toBe("P");
    expect(d.matchedRuleId).toBe("ki_minpass.minpass");
  });

  it("does not fire outside its context", async () => {
    const compiled = await compileItems();
    const decider = createKbDecider({ compiled, player });
    // Partner responded 1NT — not a two-over-one; passing is fine.
    const s = forcingState();
    s.auction = calls(["N", "1S"], ["E", "P"], ["S", "1N"], ["W", "P"]);
    const d = await decider.decideBid(s, "N");
    expect(d.action).toBe("P");
  });
});
