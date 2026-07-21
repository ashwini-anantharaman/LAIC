// Language extensions for the curated SAYC build (2026-07-21): ace/king/
// keycard/specific-card predicates, first-bid + LHO auction memory, the
// contextual bid_suit action, and the CallPattern `level` shorthand.

import type { AuctionCall, Card, Seat, Suit } from "@bridge/events";
import type { HandCondition } from "@bridge/kb";
import { describe, expect, it } from "vitest";
import { initialState, type GameState } from "../state";
import { realizeAuctionAction } from "./actions";
import { analyzeSeat, matchCallPattern, matchContext } from "./auctionContext";
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
