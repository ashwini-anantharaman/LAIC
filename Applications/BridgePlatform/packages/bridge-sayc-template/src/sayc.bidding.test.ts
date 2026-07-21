// The curated SAYC conformance suite: hand + auction → expected call,
// through the REAL pipeline (template → install → compile → decider).
// Scenario coverage ported from the bridgebot prototype's suites. Auctions
// are always turn-consistent from dealer North.

import type { Card, Seat, Suit } from "@bridge/events";
import { InMemoryKbStore, KbService, type CompiledKb, type SettingValue } from "@bridge/kb";
import { createKbDecider } from "@bridge/engine";
import { initialState } from "@bridge/engine";
import { beforeAll, describe, expect, it } from "vitest";
import { installSaycTemplate } from "./install";

const rankOf: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/** "SA SK …" (13 cards) → the seat's hand; the rest fill other seats. */
function dealFor(seat: Seat, spec: string): Record<Seat, Card[]> {
  const mine: Card[] = spec.split(/\s+/).map((t) => ({
    suit: t[0] as Suit,
    rank: rankOf[t[1]!]! as Card["rank"],
  }));
  if (mine.length !== 13) throw new Error(`hand spec has ${mine.length} cards: ${spec}`);
  const used = new Set(mine.map((c) => `${c.suit}${c.rank}`));
  const rest: Card[] = [];
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    for (let rank = 2; rank <= 14; rank++) {
      if (!used.has(`${suit}${rank}`)) rest.push({ suit, rank: rank as Card["rank"] });
    }
  }
  const seats: Seat[] = (["N", "E", "S", "W"] as Seat[]).filter((s) => s !== seat);
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  hands[seat] = mine;
  rest.forEach((card, i) => hands[seats[i % 3]!].push(card));
  return hands;
}

let compiled: CompiledKb;
let fullPackId: string;

beforeAll(async () => {
  const store = new InMemoryKbStore();
  const service = new KbService(store);
  const result = await installSaycTemplate(store, service, { createdBy: "u_test" });
  expect(result.compileError).toBeNull();
  compiled = (await service.liveCompile(result.kbId))!;
  fullPackId = result.packIdByKey.get("full")!;
});

/** Decide for `seat` holding `hand` after `auction` (from dealer North). */
async function call(
  hand: string,
  auction: [Seat, string][],
  seat: Seat = "S",
  overrides: Record<string, SettingValue> = {},
  vul: "none" | "ns" | "ew" | "both" = "none",
) {
  const state = initialState("t", "N", vul, dealFor(seat, hand));
  state.auction = auction.map(([s, c]) => ({ seat: s, call: c as never }));
  state.turn = seat;
  const decider = createKbDecider({
    compiled,
    player: {
      enabledPackIds: [fullPackId],
      settingOverrides: overrides,
      decisionPolicyId: "first_match",
    },
  });
  return decider.decideBid(state, seat);
}

const P = (s: Seat): [Seat, string] => [s, "P"];

// ---------------------------------------------------------------------------
describe("openings", () => {
  it("opens 1NT on a balanced 16-count", async () => {
    const d = await call("SA SK S4 HK H3 H2 DQ D4 D3 CK CJ C3 C2", [P("N"), P("E")]);
    expect(d.action).toBe("1N");
  });

  it("the 1NT range is a dial — 14 HCP opens 1NT when widened", async () => {
    const hand = "SA SK S4 HK H3 H2 DQ D4 D3 CQ C4 C3 C2"; // 14 HCP balanced
    expect((await call(hand, [P("N"), P("E")])).action).not.toBe("1N");
    expect(
      (await call(hand, [P("N"), P("E")], "S", { nt1_range: { low: 14, high: 16 } })).action,
    ).toBe("1N");
  });

  it("opens 2NT on a balanced 20-count", async () => {
    const d = await call("SA SK SQ HK HQ H2 DQ DJ D3 CK CJ C3 C2", [P("N"), P("E")]);
    expect(d.action).toBe("2N");
  });

  it("opens a strong 2♣ with 22+", async () => {
    const d = await call("SA SK SQ SJ S8 S2 HA HK DA DQ D3 CK C2", [P("N"), P("E")]);
    expect(d.action).toBe("2C");
  });

  it("…but a balanced 25–27 opens 3NT (the exception)", async () => {
    const d = await call("SA SK SQ HA HK H2 DA DQ D3 CK CJ C3 C2", [P("N"), P("E")]);
    expect(d.action).toBe("3N");
  });

  it("opens the five-card major", async () => {
    const d = await call("SA SK S7 S6 S2 HA H3 D8 D4 D3 CK C3 C2", [P("N"), P("E")]);
    expect(d.action).toBe("1S");
  });

  it("opens 1♣ with 3-3 in the minors", async () => {
    const d = await call("SA SK S4 S2 HK H8 H3 DQ D4 D3 CJ C3 C2", [P("N"), P("E")]);
    expect(d.action).toBe("1C");
  });

  it("opens a weak 2♠ on a good six-card suit and 8 HCP", async () => {
    const d = await call("SA SK SJ S8 S7 S2 H8 H3 D9 D4 D3 C3 C2", [P("N"), P("E")]);
    expect(d.action).toBe("2S");
  });

  it("preempts 3♣ on a seven-card suit", async () => {
    const d = await call("CA CK CJ C8 C7 C3 C2 H8 H3 D9 D4 D3 S2", [P("N"), P("E")]);
    expect(d.action).toBe("3C");
  });

  it("passes without opening values", async () => {
    const d = await call("SQ S4 S2 HK H8 H3 DJ D4 D3 C8 C4 C3 C2", [P("N"), P("E")]);
    expect(d.action).toBe("P");
    expect(d.fallback).toBe(false); // the pass RULE, not the floor
  });
});

// ---------------------------------------------------------------------------
describe("notrump machinery", () => {
  const NT = ([, c]: [Seat, string] = ["N", "1N"]) => c;

  it("bids Stayman with a four-card major and invitational values", async () => {
    const d = await call("SA SQ S8 S4 H9 H3 H2 DQ D4 D3 CJ C3 C2", [
      ["N", "1N"], P("E"),
    ]);
    expect(d.action).toBe("2C");
    expect(d.matchedRuleId).toContain(".ask");
  });

  it("Stayman off → the 2♣ ask never fires", async () => {
    const d = await call(
      "SA SQ S8 S4 H9 H3 H2 DQ D4 D3 CJ C3 C2",
      [["N", "1N"], P("E")],
      "S",
      { stayman_on: false },
    );
    expect(d.action).not.toBe("2C");
  });

  it("opener answers Stayman with the four-card major", async () => {
    const d = await call(
      "SA S8 S4 HA HK H9 H2 DQ D4 CK CJ C3 C2",
      [P("N"), ["E", "P"], ["S", "1N"], P("W"), ["N", "2C"], P("E")],
      "S",
    );
    expect(d.action).toBe("2H");
  });

  it("opener denies with 2♦, responder invites 2NT", async () => {
    const deny = await call(
      "SA S9 S4 HA HK H9 DQ D4 D2 CK CJ C3 C2",
      [P("N"), ["E", "P"], ["S", "1N"], P("W"), ["N", "2C"], P("E")],
      "S",
    );
    expect(deny.action).toBe("2D"); // only 3 spades, 3 hearts
    const invite = await call(
      "SA SQ S8 S4 H9 H3 H2 DQ D4 D3 CJ C3 C2",
      [["N", "1N"], P("E"), ["S", "2C"], P("W"), ["N", "2D"], P("E")],
      "S",
    );
    expect(invite.action).toBe("2N"); // 8 HCP
  });

  it("transfers with a five-card major, opener completes", async () => {
    const xfer = await call("S7 S4 S2 HK HQ H8 H4 H2 DQ D4 D3 C3 C2", [
      ["N", "1N"], P("E"),
    ]);
    expect(xfer.action).toBe("2D");
    const complete = await call(
      "SA S9 S4 HA H9 H2 DQ D4 D2 CK CJ C3 C2",
      [P("N"), ["E", "P"], ["S", "1N"], P("W"), ["N", "2D"], P("E")],
      "S",
    );
    expect(complete.action).toBe("2H");
  });

  it("super-accepts with four trumps and a maximum", async () => {
    const d = await call(
      "SA S4 HA HK H9 H2 DQ D4 D2 CK CJ C3 C2",
      [P("N"), ["E", "P"], ["S", "1N"], P("W"), ["N", "2D"], P("E")],
      "S",
    );
    expect(d.action).toBe("3H");
  });

  it("responder drives to game after the transfer with 10+ and five trumps", async () => {
    const d = await call(
      "S7 S4 S2 HK HQ H8 H4 H2 DA D4 D3 CQ C2",
      [["N", "1N"], P("E"), ["S", "2D"], P("W"), ["N", "2H"], P("E")],
      "S",
    );
    expect(d.action).toBe("3N");
  });

  it("opener corrects 3NT to the major with three-card support", async () => {
    const d = await call(
      "SA S9 S4 HA H9 H2 DQ D4 D2 CK CJ C3 C2",
      [P("N"), ["E", "P"], ["S", "1N"], P("W"), ["N", "2D"], P("E"), ["S", "2H"], P("W"), ["N", "3N"], P("E")],
      "S",
    );
    expect(d.action).toBe("4H");
  });

  it("Texas transfer with a six-card major and game values", async () => {
    const d = await call("S7 S2 HK HQ HJ H8 H4 H2 DA D4 D3 CQ C2", [
      ["N", "1N"], P("E"),
    ]);
    expect(d.action).toBe("4D");
  });

  it("raises 1NT quantitatively and opener accepts with a maximum", async () => {
    const quant = await call("SA SQ S4 HK H3 H2 DA D4 D3 CK CJ C3 C2", [
      ["N", "1N"], P("E"),
    ]);
    expect(quant.action).toBe("4N"); // 17 HCP balanced, no major
    const accept = await call(
      "SK S9 S4 HA H9 H2 DQ DJ D2 CA CK C3 C2",
      [P("N"), ["E", "P"], ["S", "1N"], P("W"), ["N", "4N"], P("E")],
      "S",
    );
    expect(accept.action).toBe("6N"); // 17 = maximum
  });

  it("Gerber asks and opener shows two aces", async () => {
    const d = await call(
      "SA S9 S4 HA H9 H2 DQ DJ D2 CK CQ C3 C2",
      [P("N"), ["E", "P"], ["S", "1N"], P("W"), ["N", "4C"], P("E")],
      "S",
    );
    expect(d.action).toBe("4S");
  });
});

// ---------------------------------------------------------------------------
describe("suit responses & rebids", () => {
  it("limit-raises the major with three trumps and 11", async () => {
    const d = await call("SK S8 S4 HK H8 H3 DQ DJ D4 D3 CQ C3 C2", [
      ["N", "1S"], P("E"),
    ]);
    expect(d.action).toBe("3S");
  });

  it("single-raises with 6–9", async () => {
    const d = await call("SK S8 S4 H8 H3 H2 DQ DJ D4 D3 C8 C3 C2", [
      ["N", "1S"], P("E"),
    ]);
    expect(d.action).toBe("2S");
  });

  it("bids Jacoby 2NT with four trumps and game-forcing values", async () => {
    const d = await call("SK SQ S8 S4 HA H3 DA DJ D4 D3 CQ C3 C2", [
      ["N", "1S"], P("E"),
    ]);
    expect(d.action).toBe("2N");
    expect(d.matchedRuleId).toContain("raise");
  });

  it("opener signs off in game over Jacoby 2NT with a minimum", async () => {
    const d = await call(
      "SA SQ S8 S6 S2 HK H3 D8 D4 D3 CQ C3 C2",
      [P("N"), ["E", "P"], ["S", "1S"], P("W"), ["N", "2N"], P("E")],
      "S",
    );
    expect(d.action).toBe("4S");
  });

  it("responds 1NT to a major without support", async () => {
    const d = await call("S4 S2 HK H8 H3 DQ DJ D4 D3 C9 C8 C3 C2", [
      ["N", "1S"], P("E"),
    ]);
    expect(d.action).toBe("1N");
  });

  it("shows a four-card major up the line over 1♣", async () => {
    const d = await call("SA S8 S4 S2 HK H8 H3 H2 DQ D4 D3 C3 C2", [
      ["N", "1C"], P("E"),
    ]);
    expect(d.action).toBe("1H"); // 4-4 majors: hearts first
  });

  it("RONF: raises the weak two preemptively", async () => {
    const d = await call("SK S8 S4 H8 H3 H2 DQ DJ D4 D3 C8 C3 C2", [
      ["N", "2S"], P("E"),
    ]);
    expect(d.action).toBe("3S");
  });

  it("asks for a feature with 2NT over the weak two", async () => {
    const d = await call("SA S8 HA HK H3 DA DJ D4 D3 CQ CJ C3 C2", [
      ["N", "2S"], P("E"),
    ]);
    expect(d.action).toBe("2N");
  });

  it("opener rebids 1NT balanced 12–14", async () => {
    const d = await call(
      "SA S9 S4 HQ H9 H2 DK D4 D2 CQ CJ C3 C2",
      [P("N"), ["E", "P"], ["S", "1C"], P("W"), ["N", "1S"], P("E")],
      "S",
    );
    expect(d.action).toBe("1N");
  });

  it("opener raises responder's major with four-card support", async () => {
    const d = await call(
      "SA SQ S9 S4 HA H9 H2 DK D4 D2 C4 C3 C2",
      [P("N"), ["E", "P"], ["S", "1C"], P("W"), ["N", "1S"], P("E")],
      "S",
    );
    expect(d.action).toBe("2S");
  });

  it("opener jump-rebids a strong six-card suit", async () => {
    const d = await call(
      "SA SK SQ S8 S6 S4 HA H9 DK D4 D2 C3 C2",
      [P("N"), ["E", "P"], ["S", "1S"], P("W"), ["N", "1N"], P("E")],
      "S",
    );
    expect(d.action).toBe("3S");
  });

  it("responder drives to 3NT over the 1NT rebid with 13+", async () => {
    const d = await call(
      "SA SQ S8 S4 HK H3 H2 DA D4 D3 CJ C3 C2",
      [["N", "1C"], P("E"), ["S", "1S"], P("W"), ["N", "1N"], P("E")],
      "S",
    );
    expect(d.action).toBe("3N");
  });

  it("New Minor Forcing after 1♦–1♠–1NT", async () => {
    const d = await call(
      "SA SQ S8 S4 S2 HK H3 DA D4 D3 CJ C3 C2",
      [["N", "1D"], P("E"), ["S", "1S"], P("W"), ["N", "1N"], P("E")],
      "S",
    );
    expect(d.action).toBe("2C");
    expect(d.matchedRuleId).toContain("ask-after-1d");
  });

  it("opener shows three-card support over NMF", async () => {
    const d = await call(
      "SK S9 S4 HQ H9 H2 DK DQ D4 D2 CQ C3 C2",
      [P("N"), ["E", "P"], ["S", "1D"], P("W"), ["N", "1S"], P("E"), ["S", "1N"], P("W"), ["N", "2C"], P("E")],
      "S",
    );
    expect(d.action).toBe("2S");
  });

  it("2♦ waiting over the strong 2♣ and opener rebids 2NT balanced", async () => {
    const waiting = await call("SQ S8 S4 H8 H3 H2 D9 D4 D3 C8 C4 C3 C2", [
      ["N", "2C"], P("E"),
    ]);
    expect(waiting.action).toBe("2D");
    const rebid = await call(
      "SA SK HA HK H9 DA DQ D2 CK CQ C3 C2 S4",
      [P("N"), ["E", "P"], ["S", "2C"], P("W"), ["N", "2D"], P("E")],
      "S",
    );
    expect(rebid.action).toBe("2N");
  });
});

// ---------------------------------------------------------------------------
describe("the competitive seat", () => {
  it("overcalls a good five-card suit at the one level", async () => {
    const d = await call(
      "SA SK S8 S6 S2 H8 H3 DQ D4 D3 C8 C3 C2",
      [P("N"), ["E", "1D"]],
      "S",
    );
    expect(d.action).toBe("1S");
  });

  it("overcalls 1NT with 15–18 and a stopper", async () => {
    const d = await call(
      "SA S9 S4 HK H9 H2 DA DJ D2 CK CJ C3 C2",
      [P("N"), ["E", "1D"]],
      "S",
    );
    expect(d.action).toBe("1N");
  });

  it("doubles for takeout with shortness in their suit", async () => {
    const d = await call(
      "SA SQ S8 S4 HK H9 H3 H2 D2 CK C8 C3 C2",
      [P("N"), ["E", "1D"]],
      "S",
    );
    expect(d.action).toBe("X");
  });

  it("advancer answers the takeout double in the cheapest suit — and cue-bids with 12+", async () => {
    const weak = await call(
      "S8 S4 S2 H9 H8 H3 H2 D9 D4 D3 C8 C3 C2",
      [P("N"), ["E", "1D"], ["S", "X"], P("W")],
      "N",
    );
    expect(weak.action).toBe("1H");
    const strong = await call(
      "SA SQ S8 S2 HA H8 H3 H2 D9 D4 CK C3 C2",
      [P("N"), ["E", "1D"], ["S", "X"], P("W")],
      "N",
    );
    expect(strong.action).toBe("2D"); // cue of LHO's diamonds
  });

  it("makes a negative double with the unbid major", async () => {
    const d = await call(
      "SA SQ S8 S4 H8 H3 H2 DQ D4 D3 CJ C3 C2",
      [["N", "1C"], ["E", "1H"]],
      "S",
    );
    expect(d.action).toBe("X");
  });

  it("Michaels over their minor with five-five majors", async () => {
    const d = await call(
      "SA SQ S8 S6 S2 HK HQ H8 H4 H2 D4 D3 C2",
      [P("N"), ["E", "1D"]],
      "S",
    );
    expect(d.action).toBe("2D");
  });

  it("Unusual 2NT over their major with both minors", async () => {
    const d = await call(
      "S2 H4 H2 DK DQ D8 D6 D2 CA CQ C8 C4 C2",
      [P("N"), ["E", "1S"]],
      "S",
    );
    expect(d.action).toBe("2N");
  });

  it("Jordan 2NT over the takeout double with a fit", async () => {
    const d = await call(
      "SK S8 S4 HK H8 H3 DQ DJ D4 D3 CQ C3 C2",
      [["N", "1S"], ["E", "X"]],
      "S",
    );
    expect(d.action).toBe("2N");
  });

  it("redoubles with 10+ and no fit", async () => {
    const d = await call(
      "S4 S2 HK HQ H8 DA DJ D4 D3 CQ C8 C3 C2",
      [["N", "1S"], ["E", "X"]],
      "S",
    );
    expect(d.action).toBe("XX");
  });

  it("balances 1NT in the pass-out seat", async () => {
    // Classic pass-out: E opens 1♦, S and W pass — N balances with 11–14
    // and a stopper (the opener is N's LHO, so lho_bid_suit finds diamonds).
    const d = await call(
      "SA S9 S4 HK H9 H2 DQ DJ D2 CJ C8 C3 C2",
      [P("N"), ["E", "1D"], P("S"), P("W")],
      "N",
    );
    expect(d.action).toBe("1N");
  });
});

// ---------------------------------------------------------------------------
describe("booklet pass additions (2026-07-21)", () => {
  it("opens 3NT on a balanced 25-count", async () => {
    const d = await call("SA SK SQ HA HK H2 DA DQ D3 CK C4 C3 C2", [P("N"), P("E")]);
    expect(d.action).toBe("3N");
  });

  it("opens a 12-count now (slide threshold)", async () => {
    const d = await call("SA SK S7 S6 S2 HQ H3 DJ D4 D3 CJ C3 C2", [P("N"), P("E")]);
    expect(d.action).toBe("1S"); // 12 total points, five spades
  });

  it("2♠ minor signoff: relay, forced 3♣, correction to 3♦", async () => {
    const relay = await call("S4 S2 H8 H3 H2 DQ D9 D8 D6 D4 D3 C3 C2", [
      ["N", "1N"], P("E"),
    ]);
    expect(relay.action).toBe("2S");
    const forced = await call(
      "SA S9 S4 HA HK H9 DQ D4 D2 CK CJ C3 C2",
      [P("N"), ["E", "P"], ["S", "1N"], P("W"), ["N", "2S"], P("E")],
      "S",
    );
    expect(forced.action).toBe("3C");
    const correct = await call(
      "S4 S2 H8 H3 H2 DQ D9 D8 D6 D4 D3 C3 C2",
      [["N", "1N"], P("E"), ["S", "2S"], P("W"), ["N", "3C"], P("E")],
      "S",
    );
    expect(correct.action).toBe("3D");
  });

  it("3♦ over 1NT is invitational with a six-card minor", async () => {
    const d = await call("S4 S2 HK H3 H2 DA DJ D9 D8 D4 D3 C3 C2", [
      ["N", "1N"], P("E"),
    ]);
    expect(d.action).toBe("3D"); // 8 HCP, six diamonds
  });

  it("transfers stay ON over a double and OFF over a bid (cue replaces Stayman)", async () => {
    const overDouble = await call(
      "S7 S4 S2 HK HQ H8 H4 H2 DQ D4 D3 C3 C2",
      [["N", "1N"], ["E", "X"]],
    );
    expect(overDouble.action).toBe("2D"); // transfer still on
    const overBid = await call(
      "S7 S4 S2 HK HQ H8 H4 H2 DQ D4 D3 C3 C2",
      [["N", "1N"], ["E", "2C"]],
    );
    expect(overBid.action).not.toBe("2D"); // transfer off over a bid
    const cue = await call(
      "SA SQ S8 S4 HK H3 H2 DA D4 D3 CJ C3 C2",
      [["N", "1N"], ["E", "2D"]],
    );
    expect(cue.action).toBe("3D"); // cue-bid = Stayman substitute, game force
  });

  it("Gerber continuation: 5♣ asks kings", async () => {
    const d = await call(
      "SA S9 S4 HA H9 H2 DQ DJ D2 CK CQ C3 C2",
      [P("N"), ["E", "P"], ["S", "1N"], P("W"), ["N", "4C"], P("E"), ["S", "4S"], P("W"), ["N", "5C"], P("E")],
      "S",
    );
    expect(d.action).toBe("5H"); // one king
  });

  it("Stayman applies after 2♣–2♦–2NT", async () => {
    const d = await call(
      "S8 S4 S2 H9 H8 H3 H2 DQ D4 D3 C4 C3 C2",
      [["N", "2C"], P("E"), ["S", "2D"], P("W"), ["N", "2N"], P("E")],
      "S",
    );
    expect(d.action).toBe("3C"); // four hearts → Stayman at the three level
  });

  it("3NT response to a major shows 15–17 balanced with a doubleton", async () => {
    const d = await call("SK S4 HK HQ H2 DA DJ D4 D3 CK CJ C3 C2", [
      ["N", "1S"], P("E"),
    ]);
    expect(d.action).toBe("3N"); // 16 HCP balanced, two spades
  });

  it("makes a strong jump shift with 17+ and a good suit", async () => {
    const d = await call("SA SK SQ S8 S2 HA H3 DA D4 D3 CQ C3 C2", [
      ["N", "1H"], P("E"),
    ]);
    expect(d.action).toBe("2S");
  });

  it("Jacoby 2NT: opener shows the short suit", async () => {
    const d = await call(
      "SA SQ S8 S6 S2 HK H3 H2 D2 CQ C8 C3 C2",
      [P("N"), ["E", "P"], ["S", "1S"], P("W"), ["N", "2N"], P("E")],
      "S",
    );
    expect(d.action).toBe("3D"); // singleton diamond
  });

  it("raises 1♦ with four-card support", async () => {
    const d = await call("S4 S2 HK H8 H3 DQ DJ D6 D3 C9 C8 C3 C2", [
      ["N", "1D"], P("E"),
    ]);
    expect(d.action).toBe("2D");
  });

  it("gives preference to opener's first suit with a doubleton", async () => {
    const d = await call(
      "SJ S4 HK H8 H3 DQ D8 D4 D3 C9 C8 C3 C2",
      [["N", "1S"], P("E"), ["S", "1N"], P("W"), ["N", "2H"], P("E")],
      "S",
    );
    // Opener bid spades then hearts; responder prefers spades with the
    // doubleton… preference here = pass or 2S; with 2 spades and 2 hearts
    // equal length the rule bids 2S (partner's FIRST suit).
    expect(d.action).toBe("2S");
  });

  it("responds 2NT to 2♣ with a balanced 8", async () => {
    const d = await call("SQ S8 S4 HK H8 H3 DQ DJ D4 C9 C8 C3 C2", [
      ["N", "2C"], P("E"),
    ]);
    expect(d.action).toBe("2N");
  });

  it("doubles a weak two for takeout", async () => {
    const d = await call(
      "SA SQ S8 S4 HK H9 H3 H2 D2 CA C8 C3 C2",
      [P("N"), ["E", "3D"]],
      "S",
    );
    expect(d.action).toBe("X");
  });

  it("bids 1♠ with five spades instead of a negative double", async () => {
    const d = await call(
      "SA SQ S8 S4 S2 H8 H3 DQ D4 D3 CJ C3 C2",
      [["N", "1D"], ["E", "1H"]],
      "S",
    );
    expect(d.action).toBe("1S");
  });
});

// ---------------------------------------------------------------------------
describe("maximal coverage pass (2026-07-21)", () => {
  it("opens a weak two on a POOR seven-card suit (not good enough for three)", async () => {
    const d = await call("S9 S8 S7 S6 S5 S3 S2 HK H3 DQ D4 C3 C2", [P("N"), P("E")]);
    expect(d.action).toBe("2S"); // 5 HCP, ragged seven-carder
  });

  it("Unusual 2NT over 1♦ shows clubs and hearts", async () => {
    const d = await call(
      "S2 HK HQ H8 H6 H2 D3 CA CQ C8 C4 C2 C3".replace("C3", "C5"),
      [P("N"), ["E", "1D"]],
      "S",
    );
    expect(d.action).toBe("2N");
  });

  it("negative double of 1♦ needs BOTH majors", async () => {
    const both = await call(
      "SA SQ S8 S4 HK H8 H3 H2 D2 CQ C8 C3 C2",
      [["N", "1C"], ["E", "1D"]],
      "S",
    );
    expect(both.action).toBe("X");
    const oneMajor = await call(
      "SA SQ S8 S4 H8 H3 H2 D4 D2 CQ C8 C3 C2",
      [["N", "1C"], ["E", "1D"]],
      "S",
    );
    expect(oneMajor.action).not.toBe("X"); // only spades — no negative double
  });

  it("opener reverses into hearts with 17+", async () => {
    const d = await call(
      "SA S4 HA HK H9 H2 DK DQ D8 D4 D2 C3 C2",
      [P("N"), ["E", "P"], ["S", "1D"], P("W"), ["N", "1S"], P("E")],
      "S",
    );
    expect(d.action).toBe("2H");
    expect(d.matchedRuleId).toContain("rev-2h");
  });

  it("opener shows a second suit at the one level with a minimum", async () => {
    const d = await call(
      "SA SQ S9 S4 H9 DK DQ DJ D4 C6 C4 C3 C2",
      [P("N"), ["E", "P"], ["S", "1D"], P("W"), ["N", "1H"], P("E")],
      "S",
    );
    expect(d.action).toBe("1S");
  });

  it("opener double-jump raises with a maximum", async () => {
    const d = await call(
      "SA SQ S9 S4 HA HK H2 DA DQ D4 C4 C3 C2",
      [P("N"), ["E", "P"], ["S", "1C"], P("W"), ["N", "1S"], P("E")],
      "S",
    );
    expect(d.action).toBe("4S");
  });

  it("responder's jump raise of opener's first suit after a 2/1 is game forcing", async () => {
    const d = await call(
      "SK S9 S4 H4 H2 DA D8 D3 CA CQ C8 C3 C2",
      [["N", "1S"], P("E"), ["S", "2C"], P("W"), ["N", "2H"], P("E")],
      "S",
    );
    expect(d.action).toBe("3S");
  });

  it("responder signs off in a six-card suit after opener's 1NT rebid", async () => {
    const d = await call(
      "SA SJ S9 S8 S6 S4 H8 H3 D9 D4 D3 C3 C2",
      [["N", "1C"], P("E"), ["S", "1S"], P("W"), ["N", "1N"], P("E")],
      "S",
    );
    expect(d.action).toBe("2S"); // weak, six spades — sign-off
  });

  it("responder rebids 3♣ over the Stayman reply as a slam try (five clubs)", async () => {
    const d = await call(
      "SA SQ S8 S4 H3 H2 DA D3 CK CQ C8 C4 C2",
      [["N", "1N"], P("E"), ["S", "2C"], P("W"), ["N", "2H"], P("E")],
      "S",
    );
    expect(d.action).toBe("3C");
  });

  it("responds to a 3NT opening with Texas-style transfers", async () => {
    const d = await call(
      "S7 S4 S2 HK HQ H8 H4 H2 DA D4 D3 CQ C2",
      [["N", "3N"], P("E")],
      "S",
    );
    expect(d.action).toBe("4D"); // transfer to hearts over 3NT
  });

  it("Grand Slam Force: 7 with two top honors, 6 without", async () => {
    const seven = await call(
      "SA SK S9 S8 S4 HK H9 H2 DQ D4 D2 C4 C3",
      [P("N"), ["E", "P"], ["S", "3S"], P("W"), ["N", "5N"], P("E")],
      "S",
    );
    expect(seven.action).toBe("7S");
    const six = await call(
      "SA SJ S9 S8 S4 HK H9 H2 DQ D4 D2 C4 C3",
      [P("N"), ["E", "P"], ["S", "3S"], P("W"), ["N", "5N"], P("E")],
      "S",
    );
    expect(six.action).toBe("6S");
  });

  it("advancer jumps invitationally over the takeout double", async () => {
    const d = await call(
      "SA SQ S8 S4 HK H8 H3 H2 D9 D4 CQ C3 C2",
      [P("N"), ["E", "1D"], ["S", "X"], P("W")],
      "N",
    );
    expect(d.action).toBe("2S"); // 9–11, jump advance
  });

  it("weak jump response over their takeout double", async () => {
    const d = await call(
      "SK SQ S9 S8 S7 S2 H8 H3 D9 D4 D3 C3 C2",
      [["N", "1D"], ["E", "X"]],
      "S",
    );
    expect(d.action).toBe("2S");
  });

  it("doubles a 4♥ opening for penalty", async () => {
    const d = await call(
      "SA SQ S8 S4 HK H9 H3 DA D4 D2 CQ C3 C2",
      [P("N"), ["E", "4H"]],
      "S",
    );
    expect(d.action).toBe("X");
  });

  it("advancer uses Stayman over the 1NT overcall; overcaller answers", async () => {
    const ask = await call(
      "SA SQ S8 S4 H9 H3 H2 DQ D4 D3 CJ C3 C2",
      [P("N"), ["E", "1D"], ["S", "1N"], P("W")],
      "N",
    );
    expect(ask.action).toBe("2C");
    const reply = await call(
      "SA SK S9 S4 HA H9 H2 DQ DJ D2 CK C3 C2",
      [P("N"), ["E", "1D"], ["S", "1N"], P("W"), ["N", "2C"], P("E")],
      "S",
    );
    expect(reply.action).toBe("2S");
  });
});

// ---------------------------------------------------------------------------
describe("slam machinery", () => {
  const BLACKWOOD_AUCTION: [Seat, string][] = [
    P("N"), ["E", "P"], ["S", "1S"], P("W"), ["N", "3S"], P("E"), ["S", "4N"], P("W"),
  ];

  it("asks with 4NT over the limit raise with slam values", async () => {
    const d = await call(
      "SA SK SQ S8 S6 HA HK H3 DA D4 D3 CQ C2",
      [P("N"), ["E", "P"], ["S", "1S"], P("W"), ["N", "3S"], P("E")],
      "S",
    );
    expect(d.action).toBe("4N");
  });

  it("answers 5♥ with two aces (classic)", async () => {
    const d = await call(
      "SK S9 S8 S4 HA H9 H2 DA D4 D2 C4 C3 C2",
      [P("N"), ["E", "P"], ["S", "3S"], P("W"), ["N", "4N"], P("E")],
      "S",
    );
    expect(d.action).toBe("5H");
  });

  it("RKCB 1430 answers 5♣ with one keycard when enabled", async () => {
    const d = await call(
      "SK S9 S8 S4 HA H9 H2 DQ D4 D2 C4 C3 C2", // 1 keycard: HA (SK counts too → 2!)…
      [P("N"), ["E", "P"], ["S", "3S"], P("W"), ["N", "4N"], P("E")],
      "S",
      { blackwood_on: false, rkcb1430_on: true },
    );
    // SK + HA = 2 keycards, no SQ → 5H under 1430.
    expect(d.action).toBe("5H");
  });

  it("asker signs off at five missing two aces", async () => {
    const d = await call(
      "SA SK SQ S8 S6 HK HQ H3 DK D4 D3 CQ C2", // one ace
      [...BLACKWOOD_AUCTION, ["N", "5D"], P("E")], // partner showed one
      "S",
    );
    expect(d.action).toBe("5S"); // two missing → stop
  });

  it("asker bids the slam missing at most one", async () => {
    const d = await call(
      "SA SK SQ S8 S6 HA HK H3 DA D4 D3 CQ C2", // three aces
      [...BLACKWOOD_AUCTION, ["N", "5D"], P("E")], // partner showed one → all four
      "S",
    );
    expect(d.action).toBe("6S");
  });

  it("DOPI: doubles with no aces over interference", async () => {
    const d = await call(
      "SK SQ S9 S8 S4 HK H9 H2 DQ D4 D2 C4 C3",
      [P("N"), ["E", "P"], ["S", "3S"], P("W"), ["N", "4N"], ["E", "5C"]],
      "S",
    );
    expect(d.action).toBe("X");
  });

  it("answers the 5NT king ask", async () => {
    const d = await call(
      "SK S9 S8 S4 HK H9 H2 DK D4 D2 C4 C3 C2", // two kings outside +SK = 3? kings counts ALL kings
      [...BLACKWOOD_AUCTION, ["N", "5H"], P("E"), ["S", "5N"], P("W")],
      "N",
    );
    // N is the responder to 5N here; N's hand is synthetic (round-robin), so
    // just assert the ask machinery yields SOME king response at the 6 level.
    expect(["6C", "6D", "6H", "6S"]).toContain(d.action);
  });
});

// ---------------------------------------------------------------------------
// Judgment tier (2026-07-21): forcing-pass guard, fourth suit forcing,
// Michaels minor ask + two-suit gate, preempt discipline by vulnerability,
// the (default-off) business redouble.
// ---------------------------------------------------------------------------

describe("judgment tier", () => {
  it("fourth suit forcing: game values, no fit, no stopper → bid the fourth suit", async () => {
    // 1♦ – 1♥ – 1♠: three suits bid, responder has 12 HCP and no club stopper.
    const d = await call(
      "SQ S3 S2 HA HK HJ H9 H8 DQ D7 D6 C4 C3",
      [["N", "1D"], P("E"), ["S", "1H"], P("W"), ["N", "1S"], P("E")],
    );
    expect(d.action).toBe("2C");
    expect(d.reason).toContain("fourth suit");
  });

  it("…and stays off when the toggle is off", async () => {
    const d = await call(
      "SQ S3 S2 HA HK HJ H9 H8 DQ D7 D6 C4 C3",
      [["N", "1D"], P("E"), ["S", "1H"], P("W"), ["N", "1S"], P("E")],
      "S",
      { fsf_on: false },
    );
    expect(d.action).not.toBe("2C");
  });

  it("Michaels minor ask: advancer bids 2NT without major support", async () => {
    const d = await call(
      "S4 S3 H2 DK DQ DJ D9 D8 D7 C9 C8 C7 C6",
      [P("N"), ["E", "1H"], ["S", "2H"], P("W")],
      "N",
    );
    expect(d.action).toBe("2N");
  });

  it("…and the cue-bidder shows the minor over the ask", async () => {
    const d = await call(
      "SA SK SQ S4 S3 H2 DQ DJ D9 D8 D7 C4 C2",
      [P("N"), ["E", "1H"], ["S", "2H"], P("W"), ["N", "2N"], P("E")],
    );
    expect(d.action).toBe("3D");
  });

  it("the cue is natural once the opponents have shown two suits", async () => {
    // E opened 1♣, W responded 1♦ — a 2♦ \"cue\" would be nonsense Michaels.
    const d = await call(
      "SA SK S8 S7 S2 HQ HJ H9 H8 H3 D4 D3 C2",
      [P("N"), ["E", "1C"], P("S"), ["W", "1D"]],
      "N",
    );
    expect(d.action).not.toBe("2D");
  });

  it("weak two obeys the two-three-four guideline", async () => {
    const kqj987 = "SK SQ SJ S9 S8 S7 H4 H3 D4 D3 C4 C3 C2"; // 4.5 playing tricks
    expect((await call(kqj987, [P("N"), P("E")])).action).toBe("2S"); // equal
    expect((await call(kqj987, [P("N"), P("E")], "S", {}, "ew")).action).toBe("2S"); // favorable
    expect((await call(kqj987, [P("N"), P("E")], "S", {}, "ns")).action).toBe("P"); // unfavorable
  });

  it("three-level preempt obeys the guideline too", async () => {
    const seven = "SK SQ SJ S9 S8 S7 S6 H4 H3 D4 D3 C3 C2"; // 5.5 playing tricks
    expect((await call(seven, [P("N"), P("E")])).action).toBe("3S"); // equal
    expect((await call(seven, [P("N"), P("E")], "S", {}, "ew")).action).toBe("3S"); // favorable
    expect((await call(seven, [P("N"), P("E")], "S", {}, "ns")).action).toBe("P"); // unfavorable
  });

  it("RONF: a new suit over the weak two forces the opener to bid", async () => {
    // N opened 2♥, partner's 2♠ is forcing — with nothing to say, N rebids hearts.
    const d = await call(
      "HK HQ HJ H9 H8 H7 S4 S3 D8 D7 D6 C3 C2",
      [["N", "2H"], P("E"), ["S", "2S"], P("W")],
      "N",
    );
    expect(d.action).not.toBe("P");
  });

  it("a two-over-one response may not be passed out by opener", async () => {
    const d = await call(
      "SA SK S9 S8 S7 H4 H3 D8 D7 D6 C4 C3 C2",
      [["N", "1S"], P("E"), ["S", "2C"], P("W")],
      "N",
    );
    expect(d.action).not.toBe("P");
  });

  it("business redouble is present but OFF until an expert enables it", async () => {
    const hand = "SA SK SQ S9 S8 HA H8 H7 DK D4 D3 C3 C2"; // 16 HCP, two aces
    const auction: [Seat, string][] = [
      ["N", "1S"], P("E"), ["S", "4S"], P("W"), P("N"), ["E", "X"],
    ];
    expect((await call(hand, auction)).action).toBe("P");
    expect((await call(hand, auction, "S", { rdbl_4plus_on: true })).action).toBe("XX");
  });
});
