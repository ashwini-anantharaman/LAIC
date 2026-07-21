// Expanded play behaviors (2026-07-21): each technique fires on its trigger,
// self-gates otherwise, and decides only from legitimate information.
// Scenario style follows bridgebot's playCompetence tests: build a mid-play
// GameState, realize the behavior, assert the exact card (or null).

import type { Card, Contract, Seat, Suit } from "@bridge/events";
import type { PlayBehavior } from "@bridge/kb";
import { describe, expect, it } from "vitest";
import { initialState, type GameState, type Trick } from "../state";
import { realizePlayBehavior } from "./actions";

const rankOf: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const cards = (spec: string): Card[] =>
  spec.trim() === ""
    ? []
    : spec.split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: rankOf[t[1]!]! as Card["rank"] }));
const card = (t: string): Card => cards(t)[0]!;

/** Mid-play state: 4S by South unless overridden (dummy = North). */
function playState(opts: {
  hands: Partial<Record<Seat, string>>;
  contract?: Partial<Contract>;
  tricks?: Trick[];
  turn: Seat;
}): GameState {
  const s = initialState("t", "N", "none", {
    N: cards(opts.hands.N ?? ""),
    E: cards(opts.hands.E ?? ""),
    S: cards(opts.hands.S ?? ""),
    W: cards(opts.hands.W ?? ""),
  });
  s.phase = "play";
  s.contract = { level: 4, strain: "S", doubled: 0, declarer: "S", ...opts.contract };
  s.tricks = opts.tricks ?? [];
  s.turn = opts.turn;
  return s;
}

const go = (b: PlayBehavior, state: GameState, seat: Seat) =>
  realizePlayBehavior(b, state, seat);

// An opening lead has been made in most scenarios (dummy visible): trick 1
// complete, won by declarer side, so the tested seat is on lead at trick 2.
const OPENING: Trick = {
  leader: "W",
  plays: [
    { seat: "W", card: card("D2") },
    { seat: "N", card: card("D3") },
    { seat: "E", card: card("D4") },
    { seat: "S", card: card("DA") },
  ],
  winner: "S",
};

describe("declarer techniques", () => {
  it("draw_trumps cashes the master trump while opponents still hold trumps", () => {
    const state = playState({
      turn: "S",
      tricks: [OPENING],
      hands: {
        S: "SA SK SQ H2 H3", // declarer holds top trumps
        N: "S5 S4 H7 H8 H9", // dummy
        E: "S9 S8 D5 D6 D7",
        W: "S7 S6 C2 C3 C4",
      },
    });
    expect(go("draw_trumps", state, "S")).toEqual(card("SA"));
  });

  it("draw_trumps stands down once the trumps are drawn", () => {
    // All 13 spades are accounted for: 5 with declarer, 5 in dummy, 3 played.
    const spadeTrick: Trick = {
      leader: "W",
      plays: [
        { seat: "W", card: card("S2") },
        { seat: "N", card: card("S3") },
        { seat: "E", card: card("S4") },
        { seat: "S", card: card("D2") },
      ],
      winner: "E",
    };
    const state = playState({
      turn: "S",
      tricks: [spadeTrick],
      hands: {
        S: "SA SK SQ SJ ST",
        N: "S9 S8 S7 S6 S5",
        E: "D5 D6 D7 D8 D9",
        W: "C2 C3 C4 C5 C6",
      },
    });
    expect(go("draw_trumps", state, "S")).toBeNull();
  });

  it("finesse_toward_tenace leads low toward dummy's AQ", () => {
    const state = playState({
      turn: "S",
      contract: { declarer: "S" },
      tricks: [OPENING],
      hands: {
        S: "H2 H3 S2 S3 S4", // declarer: small hearts
        N: "HA HQ S5 S6 S7", // dummy: AQ tenace (K out)
        E: "HK H7 D5 D6 D7",
        W: "H8 H9 C2 C3 C4",
      },
    });
    expect(go("finesse_toward_tenace", state, "S")).toEqual(card("H2"));
  });

  it("finesse respects eight-ever-nine-never (9+ combined, queen out → no finesse)", () => {
    const state = playState({
      turn: "S",
      tricks: [OPENING],
      hands: {
        // Combined hearts: A K J T 9 8 7 6 5 = 9 cards missing the QUEEN.
        S: "H2 H5 H6 H7 H8",
        N: "HA HK HJ HT H9",
        E: "HQ D5 D6 D7 D8",
        W: "C2 C3 C4 C5 C6",
      },
    });
    expect(go("finesse_toward_tenace", state, "S")).toBeNull();
  });

  it("hold_up_stopper ducks the defenders' suit with the lone ace in NT", () => {
    const state = playState({
      turn: "S",
      contract: { strain: "N", declarer: "S" },
      tricks: [
        { leader: "W", plays: [{ seat: "W", card: card("HK") }] }, // W leads HK vs 3NT
      ],
      hands: {
        S: "HA H4 H2 C2 C3", // lone ace, third round not yet
        N: "D2 D3 D4 D5 D6",
        E: "HQ HJ S2 S3 S4",
        W: "HT H9 H8 S5 S6",
      },
    });
    expect(go("hold_up_stopper", state, "S")).toEqual(card("H2"));
  });

  it("establish_long_suit attacks the 7+ card suit that still has a boss out", () => {
    const state = playState({
      turn: "S",
      contract: { strain: "N", declarer: "S" },
      tricks: [OPENING],
      hands: {
        S: "CK CQ CJ H2 H3", // KQJ sequence, ace out — drive it
        N: "CT C9 C8 C7 D5",
        E: "CA S2 S3 S4 S5",
        W: "C2 H7 H8 H9 HT",
      },
    });
    expect(go("establish_long_suit", state, "S")).toEqual(card("CK"));
  });

  it("ruff_loser ruffs the opponents' winner when void", () => {
    const state = playState({
      turn: "S",
      tricks: [
        {
          leader: "W",
          plays: [
            { seat: "W", card: card("HA") },
            { seat: "N", card: card("H2") },
            { seat: "E", card: card("H3") },
          ],
        },
      ],
      hands: {
        S: "S2 S3 D2 D3 C2", // void in hearts, holds trumps
        N: "H2 H4 D4 D5 D6".replace("H2 ", "H5 "), // already played H2 above
        E: "C3 C4 C5 C6 C7",
        W: "D7 D8 D9 C8 C9",
      },
    });
    expect(go("ruff_loser", state, "S")).toEqual(card("S2"));
  });

  it("cash_out_when_enough cashes masters when sure winners cover the contract", () => {
    const state = playState({
      turn: "S",
      // 1S by S: needs 7 tricks, has won 6 already; one master = enough.
      contract: { level: 1, declarer: "S" },
      tricks: [
        ...Array.from({ length: 6 }, (_, i) => ({
          leader: "S" as Seat,
          plays: [
            { seat: "S" as Seat, card: { suit: "D" as Suit, rank: (14 - i) as Card["rank"] } },
            { seat: "W" as Seat, card: { suit: "D" as Suit, rank: (8 - i) as Card["rank"] } },
            { seat: "N" as Seat, card: { suit: "C" as Suit, rank: (14 - i) as Card["rank"] } },
            { seat: "E" as Seat, card: { suit: "C" as Suit, rank: (8 - i) as Card["rank"] } },
          ],
          winner: "S" as Seat,
        })),
      ],
      hands: {
        S: "SA H2 H3", // the boss trump = a sure 7th trick
        N: "H4 H5 H6",
        E: "S5 H7 H8",
        W: "S6 H9 HT",
      },
    });
    expect(go("cash_out_when_enough", state, "S")).toEqual(card("SA"));
  });
});

describe("defense techniques", () => {
  it("return_partner_suit sends back partner's opening lead", () => {
    // Contract by N (declarer side N/S); E and W defend. W led spades.
    const state = playState({
      turn: "E",
      contract: { declarer: "N", strain: "H" },
      tricks: [
        {
          leader: "W",
          plays: [
            { seat: "W", card: card("SK") },
            { seat: "N", card: card("SA") },
            { seat: "E", card: card("S2") },
            { seat: "S", card: card("S3") },
          ],
          winner: "N",
        },
        // N led a heart, E won with the ace (E now on lead).
        {
          leader: "N",
          plays: [
            { seat: "N", card: card("H2") },
            { seat: "E", card: card("HA") },
            { seat: "S", card: card("H3") },
            { seat: "W", card: card("H4") },
          ],
          winner: "E",
        },
      ],
      hands: {
        E: "S9 S8 D2 D3 C2",
        W: "SQ SJ D4 D5 C3",
        N: "H5 H6 D6 D7 C4",
        S: "H7 H8 D8 D9 C5",
      },
    });
    // Top of the remaining doubleton back.
    expect(go("return_partner_suit", state, "E")).toEqual(card("S9"));
  });

  it("hold_up_ace ducks declarer's suit in NT", () => {
    const state = playState({
      turn: "E",
      contract: { declarer: "S", strain: "N" },
      tricks: [
        OPENING,
        { leader: "S", plays: [{ seat: "S", card: card("CQ") }] },
      ],
      hands: {
        E: "CA C7 C2 S2 S3",
        W: "C8 C9 S4 S5 S6",
        N: "CK CJ H2 H3 H4",
        S: "CT H5 H6 H7 H8",
      },
    });
    expect(go("hold_up_ace", state, "E")).toEqual(card("C2"));
  });

  it("overruff_or_discard overruffs cheaply", () => {
    const state = playState({
      turn: "W",
      contract: { declarer: "S", strain: "S" },
      tricks: [
        {
          leader: "N",
          plays: [
            { seat: "N", card: card("H9") },
            { seat: "E", card: card("HT") },
            { seat: "S", card: card("S4") }, // declarer ruffs low
          ],
        },
      ],
      hands: {
        W: "S6 S5 D2 D3 C2", // void in hearts, can overruff with S5
        N: "H2 H3 D4 D5 C3",
        E: "H4 H5 D6 D7 C4",
        S: "S2 S3 D8 D9 C5",
      },
    });
    expect(go("overruff_or_discard", state, "W")).toEqual(card("S5"));
  });

  it("second_hand_rise_vs_honor rises with the ace over a led honor", () => {
    const state = playState({
      turn: "W",
      contract: { declarer: "S", strain: "N" },
      tricks: [OPENING, { leader: "S", plays: [{ seat: "S", card: card("HJ") }] }],
      hands: {
        W: "HA H5 H2 C2 C3",
        N: "HK HQ D2 D3 D4",
        E: "H7 H8 S2 S3 S4",
        S: "H9 C4 C5 C6 C7",
      },
    });
    expect(go("second_hand_rise_vs_honor", state, "W")).toEqual(card("HA"));
    // Low card led → no rise, defer to other rules.
    const low = playState({
      turn: "W",
      contract: { declarer: "S", strain: "N" },
      tricks: [OPENING, { leader: "S", plays: [{ seat: "S", card: card("H3") }] }],
      hands: {
        W: "HA H5 H2 C2 C3",
        N: "HK HQ D2 D3 D4",
        E: "H7 H8 S2 S3 S4",
        S: "H9 C4 C5 C6 C7",
      },
    });
    expect(go("second_hand_rise_vs_honor", low, "W")).toBeNull();
  });
});
