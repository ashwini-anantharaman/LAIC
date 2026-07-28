// Conformance suite for the teaching deck: hand + auction → the call the DECK
// says to make, through the real pipeline (template → install → compile →
// decider). Each test names the slide and the table row it is checking, so a
// failure reads as "the deck says X here and we bid Y".
//
// This suite IS the spec. When a test and a chapter disagree, re-read the slide.

import type { Card, Seat, Suit } from "@bridge/events";
import { InMemoryKbStore, KbService, type CompiledKb, type SettingValue } from "@bridge/kb";
import { createKbDecider, initialState } from "@bridge/engine";
import { beforeAll, describe, expect, it } from "vitest";
import { installGirkarTemplate } from "./install";

const rankOf: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/** "SA SK …" (13 cards) → the seat's hand; the rest fill the other seats. */
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

/** Decide for `seat` holding `hand` after `auction` (dealer North throughout). */
async function call(
  hand: string,
  auction: [Seat, string][],
  seat: Seat = "S",
  overrides: Record<string, SettingValue> = {},
) {
  const state = initialState("t", "N", "none", dealFor(seat, hand));
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
/** South opens after two passes — the plain opening seat. */
const OPEN: [Seat, string][] = [P("N"), P("E")];

// ---------------------------------------------------------------------------
// Slide 16 — the opening-bid table. Every row.
// ---------------------------------------------------------------------------
describe("slide 16 — opening bids", () => {
  it("row 1: passes below 6 points", async () => {
    // Kxx, xx, Qxxx, xxxx — 5 HCP
    const d = await call("SK S7 S4 H8 H3 DQ D9 D6 D4 C9 C7 C5 C3", OPEN);
    expect(d.action).toBe("P");
  });

  it("row 6: opens 1NT on a balanced 15-17", async () => {
    // Axxx, KJ, AQx, Kxxx — 16 HCP, 4=2=3=4
    const d = await call("SA S8 S6 S4 HK HJ DA DQ D5 CK C8 C6 C4", OPEN);
    expect(d.action).toBe("1N");
  });

  it("row 5: opens 2NT on a balanced 20-21", async () => {
    // AKxx, KJ, AQx, KJxx — 21 HCP
    const d = await call("SA SK S8 S6 HK HJ DA DQ D5 CK CJ C8 C6", OPEN);
    expect(d.action).toBe("2N");
  });

  it("row 4: opens 2C on 22+", async () => {
    // AKQx, KJ, AQx, KJxx — 25 HCP
    const d = await call("SA SK SQ S6 HK HJ DA DQ D5 CK CJ C8 C6", OPEN);
    expect(d.action).toBe("2C");
  });

  it("row 7: opens 1S with 12-21 and five spades", async () => {
    // AQJxx, xx, KJxx, Qx — 14 HCP
    const d = await call("SA SQ SJ S8 S6 H9 H4 DK DJ D7 D5 CQ C3", OPEN);
    expect(d.action).toBe("1S");
  });

  it("row 8: opens 1C with 12-21, no five-card suit and three clubs", async () => {
    // AQxx, KJxx, xx, Qxx — 13 HCP, 4=4=2=3: slide 17 routes 4-4 hands with
    // fewer than four diamonds to 1C.
    const d = await call("SA SQ S8 S6 HK HJ H7 H4 D9 D3 CQ C5 C2", OPEN);
    expect(d.action).toBe("1C");
  });

  it("slide 17: opens 1D when the four-card suit is diamonds", async () => {
    // AQxx, Jxx, KJxx, Qx — 12 HCP, 4=3=4=2. Below the 1NT range, four
    // diamonds, no five-card suit → the flowchart's 1D branch.
    const d = await call("SA SQ S8 S6 HJ H7 H4 DK DJ D9 D3 CQ C5", OPEN);
    expect(d.action).toBe("1D");
  });

  it("row 2: opens a weak two with 6-11 and a six-card suit", async () => {
    // AQxxxx, Jx, xxx, xx — 7 HCP
    const d = await call("SA SQ S9 S7 S5 S3 HJ H4 D8 D6 D2 C7 C3", OPEN);
    expect(d.action).toBe("2S");
  });

  it("row 3: opens at the three level with a seven-card suit", async () => {
    // xx, KJTxxxx, x, Qxx — 7 HCP
    const d = await call("S8 S3 HK HJ HT H7 H5 H4 H2 D9 CQ C6 C2", OPEN);
    expect(d.action).toBe("3H");
  });

  it("row 3: opens 4-level with an eight-card suit", async () => {
    // x, xx, KQJTxxxx, xx — 9 HCP, eight diamonds
    const d = await call("S5 H8 H3 DK DQ DJ DT D7 D5 D4 D2 C9 C4", OPEN);
    expect(d.action).toBe("4D");
  });
});

// ---------------------------------------------------------------------------
// Slide 19 — responses to 1NT.
// ---------------------------------------------------------------------------
describe("slide 19 — responses to 1NT", () => {
  it("transfers with 5+ hearts (2D)", async () => {
    // xx, Axxxx, xxx, xxx — 4 HCP with five hearts: the "<=7, 5+ in M" row
    const d = await call("S9 S4 HA H9 H7 H5 H3 D8 D6 D2 C9 C5 C3", [
      P("E"), ["N", "1N"], P("E"),
    ]);
    expect(d.action).toBe("2D");
  });

  it("transfers with 5+ spades (2H)", async () => {
    const d = await call("SA S9 S7 S5 S3 H9 H4 D8 D6 D2 C9 C5 C3", [
      P("E"), ["N", "1N"], P("E"),
    ]);
    expect(d.action).toBe("2H");
  });

  it("bids Stayman with 8+ and a four-card major", async () => {
    // Axxx, xx, KQx, xxxx — 9 HCP, four spades
    const d = await call("SA S8 S6 S4 H9 H3 DK DQ D5 C9 C7 C5 C2", [
      P("E"), ["N", "1N"], P("E"),
    ]);
    expect(d.action).toBe("2C");
  });

  it("invites with 2NT on 8-9 and no four-card major", async () => {
    // Axx, xx, KQxx, xxxx — 9 HCP
    const d = await call("SA S8 S6 H9 H3 DK DQ D7 D5 C9 C7 C5 C2", [
      P("E"), ["N", "1N"], P("E"),
    ]);
    expect(d.action).toBe("2N");
  });

  it("bids 3NT on 10-14 with no four-card major", async () => {
    // Axx, Qx, KQxx, xxxx — 11 HCP
    const d = await call("SA S8 S6 HQ H3 DK DQ D7 D5 C9 C7 C5 C2", [
      P("E"), ["N", "1N"], P("E"),
    ]);
    expect(d.action).toBe("3N");
  });

  it("invites slam with 4NT on 15-16", async () => {
    // AKx, Qx, KQxx, Qxxx — 16 HCP
    const d = await call("SA SK S6 HQ H3 DK DQ D7 D5 CQ C7 C5 C2", [
      P("E"), ["N", "1N"], P("E"),
    ]);
    expect(d.action).toBe("4N");
  });

  it("bids 6NT on 17-19", async () => {
    // AKx, Qx, KQxx, KJxx — 19 HCP
    const d = await call("SA SK S6 HQ H3 DK DQ D7 D5 CK CJ C5 C2", [
      P("E"), ["N", "1N"], P("E"),
    ]);
    expect(d.action).toBe("6N");
  });

  it("passes a weak balanced hand with no five-card major", async () => {
    // Kxx, Qx, xxxx, xxxx — 5 HCP
    const d = await call("SK S8 S6 HQ H3 D9 D7 D5 D2 C9 C7 C5 C3", [
      P("E"), ["N", "1N"], P("E"),
    ]);
    expect(d.action).toBe("P");
  });

  it("opener completes the 2D transfer by bidding 2H", async () => {
    // North opened 1N and South transferred; North must bid 2H.
    const d = await call("SA S8 S6 S4 HK HJ DA DQ D5 CK C8 C6 C4", [
      P("E"), ["N", "1N"], P("E"), ["S", "2D"], P("W"),
    ], "N");
    expect(d.action).toBe("2H");
  });
});

// ---------------------------------------------------------------------------
// Slide 21 — the two-suited-major flowchart. Slide 19's table has no row for a
// 5-4 in the majors, so these sequences exist only here.
// ---------------------------------------------------------------------------
describe("slide 21 — five-four in the majors over 1NT", () => {
  const over1N = (): [Seat, string][] => [P("E"), ["N", "1N"], P("E")];
  // AKxxx KQxx xx xx — 12 HCP, five spades and four hearts.
  const GF_54 = "SA SK S8 S6 S4 HK HQ H7 H4 D9 D3 C9 C5";
  // KQxxx Kxxx xx xx — 8 HCP, five spades and four hearts.
  const INV_54 = "SK SQ S8 S6 S4 HK H7 H5 H3 D9 D3 C9 C5";
  // KQxx Kxxxx xx xx — 8 HCP, four spades and five hearts.
  const INV_45 = "SK SQ S8 S6 HK H8 H6 H4 H2 D9 D3 C9 C5";

  it("a game-forcing five-four bids 2C, not a transfer", async () => {
    expect((await call(GF_54, over1N())).action).toBe("2C");
  });

  it("jumps to 3H over 2D — Smolen, the FOUR-card major", async () => {
    // Naming the short major is the point: it leaves opener to declare the
    // five-card suit.
    const d = await call(GF_54, [P("E"), ["N", "1N"], P("E"), ["S", "2C"], P("W"), ["N", "2D"], P("E")]);
    expect(d.action).toBe("3H");
  });

  it("opener reads 3H as five spades and bids 4S with three-card support", async () => {
    // Axx Kx KQxx AJxx — 17 HCP, balanced, three spades, no four-card major.
    const d = await call(
      "SA S8 S6 HK H4 DK DQ D7 D5 CA CJ C8 C6",
      [P("E"), ["N", "1N"], P("E"), ["S", "2C"], P("W"), ["N", "2D"], P("E"), ["S", "3H"], P("W")],
      "N",
    );
    expect(d.action).toBe("4S");
  });

  it("opener signs off in 3NT without support for the five-card major", async () => {
    // Kx Qxx AQxx KJxx — 15 HCP, only two spades.
    const d = await call(
      "SK S4 HQ H7 H3 DA DQ D8 D6 CK CJ C9 C5",
      [P("E"), ["N", "1N"], P("E"), ["S", "2C"], P("W"), ["N", "2D"], P("E"), ["S", "3H"], P("W")],
      "N",
    );
    expect(d.action).toBe("3N");
  });

  it("bids game in the major opener shows, per \"Game in hearts, slam?\"", async () => {
    const d = await call(GF_54, [P("E"), ["N", "1N"], P("E"), ["S", "2C"], P("W"), ["N", "2H"], P("E")]);
    expect(d.action).toBe("4H");
  });

  it("an invitational five spades and four hearts also starts with 2C", async () => {
    expect((await call(INV_54, over1N())).action).toBe("2C");
  });

  it("…then shows the five spades with an invitational 2S over 2D", async () => {
    const d = await call(INV_54, [P("E"), ["N", "1N"], P("E"), ["S", "2C"], P("W"), ["N", "2D"], P("E")]);
    expect(d.action).toBe("2S");
  });

  it("an invitational FOUR spades and five hearts transfers instead", async () => {
    // The deck's asymmetry: transferring to hearts then bidding 2S keeps the
    // invitation at the two level, which the 2C route could not.
    expect((await call(INV_45, over1N())).action).toBe("2D");
  });

  it("…then bids 2S over the completed transfer", async () => {
    const d = await call(INV_45, [P("E"), ["N", "1N"], P("E"), ["S", "2D"], P("W"), ["N", "2H"], P("E")]);
    expect(d.action).toBe("2S");
  });
});

// ---------------------------------------------------------------------------
// Slide 23 — responses to 2NT.
// ---------------------------------------------------------------------------
describe("slide 23 — responses to 2NT", () => {
  const after2N = (): [Seat, string][] => [P("E"), ["N", "2N"], P("E")];

  it("bids 3C Stayman with 6+ and a four-card major", async () => {
    // KQxx, xx, Kxx, xxxx — 8 HCP
    const d = await call("SK SQ S8 S6 H9 H3 DK D7 D5 C9 C7 C5 C2", after2N());
    expect(d.action).toBe("3C");
  });

  it("transfers with 3D holding five hearts and 6-10", async () => {
    // xxx, KQxxx, Kxx, xx — 8 HCP, five hearts
    const d = await call("S9 S6 S4 HK HQ H8 H6 H3 DK D7 D5 C9 C5", after2N());
    expect(d.action).toBe("3D");
  });

  it("bids 3NT on 6-10 with no four-card major", async () => {
    // KQx, xxx, QJx, xxxx — 8 HCP
    const d = await call("SK SQ S6 H9 H5 H3 DQ DJ D7 C9 C7 C5 C2", after2N());
    expect(d.action).toBe("3N");
  });

  it("bids 7NT with 17+ — grand assured", async () => {
    // AKx, KQx, KJxx, Jxx — 18 HCP
    const d = await call("SA SK S6 HK HQ H5 DK DJ D7 D5 CJ C7 C2", after2N());
    expect(d.action).toBe("7N");
  });
});

// ---------------------------------------------------------------------------
// Slide 24 — responses to a 1H/1S opening. The deck's most distinctive page:
// forcing 1NT, Jacoby 2NT, limit raise 3M, and 2/1 game force.
// ---------------------------------------------------------------------------
describe("slide 24 — responses to 1S", () => {
  const after1S = (): [Seat, string][] => [P("E"), ["N", "1S"], P("E")];

  it("passes below 6 points", async () => {
    // xxx, Kxx, x, xxxxxx — 3 HCP
    const d = await call("S9 S6 S4 HK H7 H3 D5 C9 C8 C7 C5 C4 C2", after1S());
    expect(d.action).toBe("P");
  });

  it("raises to 2S with 6-9 and three-card support", async () => {
    // xxx in spades → Kxx support; 6-9 HCP
    const d = await call("SK S7 S4 HQ H8 H3 D9 D7 D5 CJ C8 C5 C3", after1S());
    expect(d.action).toBe("2S");
  });

  it("makes a limit raise to 3S with 10-11 and four-card support", async () => {
    // Axxx spades, KJxx hearts, xx, QJxx — 11 HCP, four spades
    const d = await call("SA S8 S6 S4 HK HJ H7 H4 D9 D3 CQ CJ C5", after1S());
    expect(d.action).toBe("3S");
  });

  it("bids Jacoby 2NT with 12+, four-card support and no singleton", async () => {
    // AQxx, KJxx, Kxx, xx — 14 HCP, four-card spade support, no singleton
    const d = await call("SA SQ S8 S6 HK HJ H7 H4 DK D9 D3 C9 C5", after1S());
    expect(d.action).toBe("2N");
  });

  it("bids the forcing 1NT with 6-11 and no support", async () => {
    // xx, xx, AQJxxx, xxx — 7 HCP with only two spades, so the table's
    // "6-11 / No support → 1N (forcing)" row applies, not the 2S raise.
    const d = await call("S9 S6 H8 H3 DA DQ DJ D9 D7 D5 C9 C5 C2", after1S());
    expect(d.action).toBe("1N");
  });

  it("bids a game-forcing 2D with 12+ and no support", async () => {
    // xx, Kx, AQJxx, KQxx — 17 HCP, only two spades → 2/1 game force in diamonds
    const d = await call("S9 S5 HK H4 DA DQ DJ D8 D6 CK CQ C7 C3", after1S());
    expect(d.action).toBe("2D");
  });

  it("bids 4S on a weak hand with five-card support (the two-way 4M)", async () => {
    // Kxxxx spades, xx, xxx, xxx — 3 HCP with five trumps
    const d = await call("SK S9 S7 S5 S3 H8 H3 D9 D6 D2 C9 C6 C3", after1S());
    expect(d.action).toBe("4S");
  });
});

describe("slide 24 — 1S over partner's 1H", () => {
  it("bids 1S with 6+ and four spades over 1H", async () => {
    // KQxx, xx, Qxxx, xxx — 8 HCP
    const d = await call("SK SQ S8 S6 H9 H3 DQ D7 D5 D2 C9 C7 C5", [
      P("E"), ["N", "1H"], P("E"),
    ]);
    expect(d.action).toBe("1S");
  });
});

// ---------------------------------------------------------------------------
// Slide 27 — responses to a minor opening.
// ---------------------------------------------------------------------------
describe("slide 27 — responses to 1C", () => {
  const after1C = (): [Seat, string][] => [P("E"), ["N", "1C"], P("E")];

  it("bids 1S looking for a major fit with 6+ and four spades", async () => {
    // KQxx, xx, Axxxx, xx — 11 HCP
    const d = await call("SK SQ S8 S6 H9 H3 DA D8 D6 D4 D2 C9 C5", after1C());
    expect(d.action).toBe("1S");
  });

  it("bids 1NT as a limit bid on 6-9 denying a four-card major", async () => {
    // Kxx, xxx, Axx, Jxxx — 9 HCP
    const d = await call("SK S8 S6 H9 H5 H3 DA D7 D5 CJ C9 C7 C2", after1C());
    expect(d.action).toBe("1N");
  });

  it("bids 2NT as a limit bid on 10-12 denying a four-card major", async () => {
    // Kxx, Kxx, Axx, Jxxx — 11 HCP
    const d = await call("SK S8 S6 HK H5 H3 DA D7 D5 CJ C9 C7 C2", after1C());
    expect(d.action).toBe("2N");
  });

  it("bids 3NT as a limit bid on 13-15 denying a four-card major", async () => {
    // Kxx, Kxx, AKx, Jxxx — 14 HCP
    const d = await call("SK S8 S6 HK H5 H3 DA DK D5 CJ C9 C7 C2", after1C());
    expect(d.action).toBe("3N");
  });

  it("makes an INVERTED raise to 2C with 9+ and five-card support", async () => {
    // Kxx, Kxx, Ax, xxxxx — 10 HCP, five clubs → 2C (forcing), not 3C
    const d = await call("SK S8 S6 HK H5 H3 DA D5 C9 C8 C7 C4 C2", after1C());
    expect(d.action).toBe("2C");
  });

  it("makes the WEAK raise to 3C with 6-9 and five-card support", async () => {
    // Kxx, xx, xxx, KJxxx — 8 HCP → 3C, because 2C is the stronger raise
    const d = await call("SK S8 S6 H9 H3 D9 D7 D5 CK CJ C8 C6 C2", after1C());
    expect(d.action).toBe("3C");
  });

  it("bids a weak 2H with 6-11 and six hearts", async () => {
    // xx, AQJxxx, xxx, xx — 9 HCP
    const d = await call("S9 S5 HA HQ HJ H8 H6 H3 D9 D7 D3 C9 C5", after1C());
    expect(d.action).toBe("2H");
  });
});

// ---------------------------------------------------------------------------
// Slide 49 — Roman keycards. THE rule the fellows reported as wrong: 4NT must
// require an AGREED SUIT, never "four cards in partner's suit".
// ---------------------------------------------------------------------------
describe("slide 49 — Roman keycard Blackwood", () => {
  // Spades are agreed by 1S-3S, so 4NT is the keycard ask. Each responding
  // hand is a genuine 10-11 count, consistent with having bid 3S.
  const rkc = (): [Seat, string][] => [
    P("E"), ["N", "1S"], P("E"), ["S", "3S"], P("W"), ["N", "4N"], P("E"),
  ];

  it("answers 5C with one keycard", async () => {
    // Kxxx, QJx, QJx, Jxx — the spade king alone: 1 keycard.
    const d = await call("SK S8 S6 S4 HQ HJ H3 DQ DJ D5 CJ C7 C5", rkc());
    expect(d.action).toBe("5C");
  });

  it("answers 5D with zero keycards", async () => {
    // QJxx, QJx, QJx, Jxx — no ace and no trump king: 0 keycards.
    const d = await call("SQ SJ S8 S4 HQ HJ H3 DQ DJ D5 CJ C7 C5", rkc());
    expect(d.action).toBe("5D");
  });

  it("answers 5H with two keycards and no trump queen", async () => {
    // Kxxx, AJx, Qxx, Jxx — trump king + a side ace, no trump queen.
    const d = await call("SK S8 S6 S4 HA HJ H3 DQ D7 D5 CJ C7 C5", rkc());
    expect(d.action).toBe("5H");
  });

  it("answers 5S with two keycards AND the trump queen", async () => {
    // KQxx, AJx, xxx, Jxx — trump king, trump queen, and a side ace.
    const d = await call("SK SQ S6 S4 HA HJ H3 D9 D7 D5 CJ C7 C5", rkc());
    expect(d.action).toBe("5S");
  });

  it("does NOT bid 4NT without an agreed suit — the reported bug", async () => {
    // A big hand with four spades but partner has bid nothing: no agreement,
    // so 4NT is not available. Anything but 4N passes this test.
    const d = await call("SA SK SQ SJ HA HK H5 DA DK D5 CA C7 C5", OPEN);
    expect(d.action).not.toBe("4N");
  });
});
