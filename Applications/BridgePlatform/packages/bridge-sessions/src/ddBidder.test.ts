import { describe, expect, it } from "vitest";

import { legalCalls, type GameState } from "@bridge/engine";
import type { AuctionCall, Card, Rank, Seat, Suit } from "@bridge/events";

import { chooseCall } from "./ddBidder";

const RANKS: Record<string, Rank> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/** "AKQ32.K4.T32.A54" — PBN order, spades first. */
function pbnHand(spec: string): Card[] {
  const suits: Suit[] = ["S", "H", "D", "C"];
  const out: Card[] = [];
  spec.split(".").forEach((group, i) => {
    for (const ch of group) if (RANKS[ch]) out.push({ suit: suits[i]!, rank: RANKS[ch]! });
  });
  return out;
}

/** Enough GameState for the bidder: the hands and the auction so far. */
function position(handSpec: string, auction: AuctionCall[] = [], seat: Seat = "N"): GameState {
  const empty: Card[] = [];
  return {
    boardRef: "t",
    dealer: "N",
    vul: "none",
    hands: { N: empty, E: empty, S: empty, W: empty, [seat]: pbnHand(handSpec) } as Record<
      Seat,
      Card[]
    >,
    auction,
    contract: null,
    phase: "auction",
    turn: seat,
    tricks: [],
    trickCount: { NS: 0, EW: 0 },
  } satisfies GameState;
}

describe("chooseCall — openings", () => {
  it("opens 1NT on a balanced 15-17", () => {
    expect(chooseCall(position("KQ32.AJ4.KT2.A54"), "N").call).toBe("1N");
  });

  it("opens 2NT on a balanced 20+", () => {
    expect(chooseCall(position("AKQ2.AK4.KQ2.A54"), "N").call).toBe("2N");
  });

  it("opens one of a five-card major", () => {
    expect(chooseCall(position("AKQ32.K4.QT2.A54"), "N").call).toBe("1S");
  });

  it("opens the better minor with no five-card major", () => {
    // 4-4 in the majors is not enough to open one; diamonds is the longer minor.
    const call = chooseCall(position("KQ32.AJ42.KT65.A"), "N").call;
    expect(["1D", "1C"]).toContain(call);
  });

  it("preempts three on a seven-card suit and a weak hand", () => {
    expect(chooseCall(position("2.KQJ9876.432.4"), "N").call).toBe("3H");
  });

  it("opens a weak two on a good six-card suit", () => {
    expect(chooseCall(position("32.KQJ976.432.4"), "N").call).toBe("2H");
  });

  it("passes a hand with nothing", () => {
    expect(chooseCall(position("432.543.6432.65"), "N").call).toBe("P");
  });
});

describe("chooseCall — responses", () => {
  const opened = (call: string): AuctionCall[] => [{ seat: "S", call: call as never }];

  it("raises partner's major with support and values", () => {
    // Partner opened 1S; three-card support and 9 HCP is a simple raise.
    const state = position("K32.J43.Q432.K65", opened("1S"), "N");
    expect(chooseCall(state, "N").call).toBe("2S");
  });

  it("jumps to game opposite a major with a big hand", () => {
    const state = position("K932.AQ4.KQ32.A5", opened("1S"), "N");
    expect(chooseCall(state, "N").call).toBe("4S");
  });

  it("bids game opposite 1NT with 10+", () => {
    const state = position("K932.AQ4.K932.65", opened("1N"), "N");
    expect(chooseCall(state, "N").call).toBe("3N");
  });

  it("passes 1NT with a bust", () => {
    const state = position("9432.643.9432.65", opened("1N"), "N");
    expect(chooseCall(state, "N").call).toBe("P");
  });

  it("leaves partner's preempt alone", () => {
    const state = position("K932.A4.K932.765", opened("3H"), "N");
    expect(chooseCall(state, "N").call).toBe("P");
  });

  it("passes with too little to respond", () => {
    const state = position("9432.643.9432.65", opened("1S"), "N");
    expect(chooseCall(state, "N").call).toBe("P");
  });
});

describe("chooseCall — safety", () => {
  // The properties that keep a TABLE working, as opposed to bidding well.
  const SEATS: Seat[] = ["N", "E", "S", "W"];
  let seed = 8675309;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const randomDeal = (): Record<Seat, Card[]> => {
    const pack: Card[] = [];
    for (const s of ["S", "H", "D", "C"] as Suit[])
      for (let r = 2; r <= 14; r++) pack.push({ suit: s, rank: r as Rank });
    for (let i = 51; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pack[i]!, pack[j]!] = [pack[j]!, pack[i]!];
    }
    return { N: pack.slice(0, 13), E: pack.slice(13, 26), S: pack.slice(26, 39), W: pack.slice(39) };
  };

  it("always answers with a legal call, and every auction ends", () => {
    // A bidder that never stops would hang a table forever, and one that
    // answers illegally would be rejected by the engine mid-board. Neither is
    // recoverable in play, so both are checked over many deals.
    let contracts = 0;
    let passedOut = 0;
    for (let n = 0; n < 200; n++) {
      const hands = randomDeal();
      const auction: AuctionCall[] = [];
      let seat: Seat = SEATS[n % 4]!;
      let calls = 0;

      for (;;) {
        const state: GameState = {
          boardRef: "t",
          dealer: SEATS[n % 4]!,
          vul: "none",
          hands,
          auction,
          contract: null,
          phase: "auction",
          turn: seat,
          tricks: [],
          trickCount: { NS: 0, EW: 0 },
        } satisfies GameState;

        const { call } = chooseCall(state, seat);
        expect(legalCalls(auction, seat).has(call), `deal ${n}: ${call} is not legal`).toBe(true);
        auction.push({ seat, call });
        calls++;
        expect(calls, `deal ${n}: the auction would not end`).toBeLessThan(60);

        // Three passes after any call, or four passes from the start, ends it.
        const tail = auction.slice(-3);
        const allPass = tail.length === 3 && tail.every((c) => c.call === "P");
        if (allPass && auction.length >= 4) break;
        seat = SEATS[(SEATS.indexOf(seat) + 1) % 4]!;
      }

      if (auction.every((c) => c.call === "P")) passedOut++;
      else contracts++;
    }

    // Not a quality bar — a floor. A bidder that passed almost everything out
    // would satisfy "terminates" and "is legal" while making the table useless.
    expect(contracts + passedOut).toBe(200);
    expect(contracts, `only ${contracts}/200 boards reached a contract`).toBeGreaterThan(120);
  });
});
