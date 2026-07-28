// The deck contradicts itself in two places on the opening bid, and both
// readings are defensible from the page alone. This suite pins the reading the
// template encodes, so a later edit that quietly flips one shows up as a failed
// test rather than as a fellow's bug report.
//
// Both are exposed as settings, so a partnership that prefers the other reading
// changes a dial instead of editing a rule — see `open-1nt` and `open-strong-2c`.

import type { Card, Seat, Suit } from "@bridge/events";
import { InMemoryKbStore, KbService, type CompiledKb, type SettingValue } from "@bridge/kb";
import { createKbDecider, initialState } from "@bridge/engine";
import { beforeAll, describe, expect, it } from "vitest";
import { installGirkarTemplate } from "./install";

const rankOf: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

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
  rest.forEach((card, i) => hands[seats[i % 3]!]!.push(card));
  return hands;
}

let compiled: CompiledKb;
let fullPackId: string;

beforeAll(async () => {
  const store = new InMemoryKbStore();
  const service = new KbService(store);
  const result = await installGirkarTemplate(store, service, { createdBy: "u_test" });
  expect(result.compileError).toBeNull();
  compiled = (await service.liveCompile(result.kbId))!;
  fullPackId = result.packIdByKey.get("full")!;
});

/** South's opening call after two passes. */
async function open(hand: string, overrides: Record<string, SettingValue> = {}) {
  const state = initialState("t", "N", "none", dealFor("S", hand));
  state.auction = [
    { seat: "N", call: "P" as never },
    { seat: "E", call: "P" as never },
  ];
  state.turn = "S";
  const decider = createKbDecider({
    compiled,
    player: {
      enabledPackIds: [fullPackId],
      settingOverrides: overrides,
      decisionPolicyId: "first_match",
    },
  });
  return (await decider.decideBid(state, "S")).action;
}

// ---------------------------------------------------------------------------
// Ambiguity 1: slide 16 prints ONE "Points" column for rows that plainly mean
// different things. 2♣ is read as HIGH-CARD points, like its neighbours 1NT
// (15-17) and 2NT (20-21); the one-level suit openings are read as TOTAL points,
// because slide 32 introduces length points specifically to settle whether a
// marginal hand is worth opening one of a suit.
// ---------------------------------------------------------------------------
describe("slide 16: which points does each row count?", () => {
  it("a balanced 21 HCP with a five-card suit opens 2NT, not 2C", async () => {
    // AKQxx KQ AJx Qxx — 21 HCP, but 22 TOTAL points (one for the fifth spade).
    // Counting total points here would hand almost every five-card-suit hand to
    // 2♣ and leave the 2NT row nearly unreachable.
    expect(await open("SA SK SQ S8 S6 HK HQ DA DJ D5 CQ C8 C6")).toBe("2N");
  });

  it("a balanced 22+ HCP still opens 2C", async () => {
    // AKQx AK AQx Kxxx — 25 HCP.
    expect(await open("SA SK SQ S6 HA HK DA DQ D5 CK C8 C6 C4")).toBe("2C");
  });

  it("a one-level opening DOES count length points (slides 32 and 34)", async () => {
    // AQxxxx xxx AJxx (void) — 11 HCP, but slide 34 works this exact hand and
    // says "open 1S": 13 with distribution, 6 losers.
    expect(await open("SA SQ S9 S7 S5 S3 H9 H5 H3 DA DJ D7 D4")).toBe("1S");
  });
});

// ---------------------------------------------------------------------------
// Ambiguity 2: slide 17's shape list includes 5332, which looks like it lets a
// 1NT opening hold a five-card major. But slide 18 ("1N Opener has 2-4 cards in
// any major") and slide 19's header ("no 5 card major") both deny it without
// hedging, and the whole response structure depends on that — Stayman asks about
// a FOUR-card major precisely because opener cannot hold five. The readings
// reconcile once you notice 5332 also covers a five-card MINOR. Note slide 23's
// 2NT header hedges ("usually no 5 card major"), so 2NT is not restricted.
// ---------------------------------------------------------------------------
describe("slide 17 vs slides 18/19: may a 1NT opening hold a five-card major?", () => {
  it("15-17 balanced with five spades opens 1S, not 1NT", async () => {
    // AQJxx Kx KJx Qxx — 16 HCP, 5=2=3=3.
    expect(await open("SA SQ SJ S8 S6 HK H4 DK DJ D5 CQ C8 C6")).toBe("1S");
  });

  it("15-17 balanced with a five-card MINOR does open 1NT", async () => {
    // Kxx Qx AQJxx Kxx — 16 HCP, 3=2=5=3: the 5332 shape slide 17 means.
    expect(await open("SK S8 S6 HQ H4 DA DQ DJ D8 D6 CK C8 C6")).toBe("1N");
  });

  it("the dial restores slide 17's literal reading", async () => {
    // Same five-spade hand, with the longest-major allowance raised to five.
    expect(
      await open("SA SQ SJ S8 S6 HK H4 DK DJ D5 CQ C8 C6", { g_open_1n_max_major: 5 }),
    ).toBe("1N");
  });
});
