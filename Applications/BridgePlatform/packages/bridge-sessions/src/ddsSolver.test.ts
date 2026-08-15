import { describe, expect, it } from "vitest";

import type { GameState } from "@bridge/engine";
import type { Card, Rank, Seat, Suit } from "@bridge/events";

import { solvePlay, toPbn } from "./ddsSolver";

const RANKS: Record<string, Rank> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const NEXT: Record<Seat, Seat> = { N: "E", E: "S", S: "W", W: "N" };
const NS = (s: Seat) => s === "N" || s === "S";

/** "SA SQ" → cards. */
const hand = (spec: string): Card[] =>
  spec
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ suit: t[0] as Suit, rank: RANKS[t[1]!]! }));

/** Just enough GameState for the solver and the engine's legality view. */
function position(
  hands: Record<Seat, Card[]>,
  strain: Suit | "N",
  trick: { seat: Seat; card: Card }[] = [],
): GameState {
  return {
    boardRef: "t",
    dealer: "N",
    vul: "none",
    hands,
    auction: [],
    contract: { level: 1, strain, doubled: 0, declarer: "N" },
    phase: "play",
    turn: "N",
    tricks: trick.length ? [{ leader: trick[0]!.seat, plays: trick }] : [],
    trickCount: { NS: 0, EW: 0 },
  } satisfies GameState;
}

const deal = (n: string, e: string, s: string, w: string): Record<Seat, Card[]> => ({
  N: hand(n),
  E: hand(e),
  S: hand(s),
  W: hand(w),
});

describe("toPbn", () => {
  it("writes hands clockwise from the named seat, high to low", () => {
    // Clockwise from South is West, North, East — get the rotation wrong and
    // DDS answers confidently about the wrong hand.
    const pbn = toPbn(deal("SA SQ", "S5 S6", "S4 S2", "SK S3"), "S");
    expect(pbn).toBe("S:42... K3... AQ... 65...");
  });

  it("writes a void as an empty field, not a dash", () => {
    const pbn = toPbn(deal("SA", "HK", "DQ", "CJ"), "N");
    expect(pbn).toBe("N:A... .K.. ..Q. ...J");
  });
});

describe("solvePlay", () => {
  // The finesse is the check that the solver really sees all four hands: the
  // SAME cards north and south are worth two tricks or one depending only on
  // which opponent holds the king.
  it("finesses when the king is onside — two tricks", async () => {
    const res = await solvePlay(position(deal("SA SQ", "S5 S6", "S4 S2", "SK S3"), "N"), "S");
    expect(res?.tricks).toBe(2);
  });

  it("cannot finesse when the king is offside — one trick", async () => {
    const res = await solvePlay(position(deal("SA SQ", "SK S3", "S4 S2", "S5 S6"), "N"), "S");
    expect(res?.tricks).toBe(1);
  });

  it("ruffs: two small trumps beat the ace-king of the suit led", async () => {
    const res = await solvePlay(position(deal("H2 H3", "D4 D5", "SQ SJ", "SA SK"), "H"), "S");
    expect(res?.tricks).toBe(2);
  });

  it("answers mid-trick, about the seat actually on play", async () => {
    // South has led the five; West follows. Only spades are on offer.
    const state = position(deal("SA H2", "S3 H4", "H6", "S7 H8"), "N", [
      { seat: "S", card: { suit: "S", rank: 5 } },
    ]);
    const res = await solvePlay(state, "W");
    expect(res).not.toBeNull();
    expect(res!.candidates.every((c) => c.card.suit === "S")).toBe(true);
  });

  it("refuses a position whose turn does not add up rather than guessing", async () => {
    // South led, so the next seat is West — asking for North's card would get a
    // confident answer about the wrong hand.
    const state = position(deal("SA H2", "S3 H4", "H6", "S7 H8"), "N", [
      { seat: "S", card: { suit: "S", rank: 5 } },
    ]);
    expect(await solvePlay(state, "N")).toBeNull();
  });

  // ── THE TEST THAT MATTERS ────────────────────────────────────────────────
  //
  // A solver's trick count is only meaningful if the line it recommends
  // actually takes that many. So: solve, play its own card, re-solve, all the
  // way to the last trick, and count. Double dummy play by all four seats
  // preserves the value of the position, so the two numbers must agree every
  // single time.
  //
  // This is here because it is the check that caught a hand-written solver
  // being wrong — it agreed with itself on 29 of 40 five-card endings. The
  // cross-check that came before it (against naive minimax on THREE-card
  // endings) passed 45 out of 45, because three-card endings barely exercise a
  // transposition table. Anything claiming to solve double dummy must pass this
  // one, at a depth where the search actually has to work.
  const playOut = async (keep: number, rounds: number) => {
    let seed = 424242;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const disagreed: string[] = [];

    for (let n = 0; n < rounds; n++) {
      const pack: Card[] = [];
      for (const su of ["S", "H", "D", "C"] as Suit[])
        for (let r = 2; r <= 14; r++) pack.push({ suit: su, rank: r as Rank });
      for (let i = 51; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pack[i]!, pack[j]!] = [pack[j]!, pack[i]!];
      }
      let hands: Record<Seat, Card[]> = {
        N: pack.slice(0, keep),
        E: pack.slice(13, 13 + keep),
        S: pack.slice(26, 26 + keep),
        W: pack.slice(39, 39 + keep),
      };
      const strain = (["N", "S", "H", "D", "C"] as const)[n % 5]!;
      const first = (["N", "E", "S", "W"] as Seat[])[n % 4]!;

      const claimed = (await solvePlay(position(hands, strain), first))!.tricks;

      let toMove = first;
      let trick: { seat: Seat; card: Card }[] = [];
      let took = 0;
      for (let c = 0; c < keep * 4; c++) {
        const step = await solvePlay(position(hands, strain, trick), toMove);
        const card = step!.card;
        hands = {
          ...hands,
          [toMove]: hands[toMove]!.filter((x) => !(x.suit === card.suit && x.rank === card.rank)),
        };
        trick = [...trick, { seat: toMove, card }];
        if (trick.length === 4) {
          const led = trick[0]!.card.suit;
          let best = trick[0]!;
          for (const p of trick.slice(1)) {
            const pt = strain !== "N" && p.card.suit === strain;
            const bt = strain !== "N" && best.card.suit === strain;
            if (pt && !bt) best = p;
            else if (!pt && bt) continue;
            else if (pt && bt) {
              if (p.card.rank > best.card.rank) best = p;
            } else if (
              p.card.suit === led &&
              best.card.suit === led &&
              p.card.rank > best.card.rank
            ) {
              best = p;
            }
          }
          if (NS(best.seat) === NS(first)) took++;
          toMove = best.seat;
          trick = [];
        } else {
          toMove = NEXT[toMove];
        }
      }
      if (took !== claimed) disagreed.push(`#${n} ${strain}: claimed ${claimed}, took ${took}`);
    }
    return disagreed;
  };

  it("takes exactly the tricks it claims, over 40 five-card endings", async () => {
    expect(await playOut(5, 40)).toEqual([]);
  }, 120_000);

  it("takes exactly the tricks it claims, over 40 eight-card endings", async () => {
    expect(await playOut(8, 40)).toEqual([]);
  }, 120_000);

  it("solves a full thirteen-trick deal — no horizon, no budget", async () => {
    // The thing the hand-written solver could not do at all: it ran out of
    // budget around trick five and answered from a truncated search.
    expect(await playOut(13, 3)).toEqual([]);
  }, 120_000);
});
