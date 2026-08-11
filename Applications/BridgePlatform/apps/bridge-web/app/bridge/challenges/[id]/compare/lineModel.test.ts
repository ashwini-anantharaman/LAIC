// WHEN IS A COMPARED LINE FINISHED? The question the comparison surface got
// wrong for a bidding-only board: a frozen auction-only line has a contract and
// no cards, which is indistinguishable BY SHAPE from a full board abandoned
// before the opening lead. Only the challenge's FORMAT tells them apart, which
// is why `buildCompareLine` takes it and asks `challengeBoardIsOver` rather
// than counting to 52.

import type { ChallengeSnapshot } from "@bridge/challenges";
import type { Call, Card, Rank, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";
import { buildCompareLine, type LineIdentity } from "./lineModel";

const card = (s: string): Card => ({ suit: s[0] as Suit, rank: Number(s.slice(1)) as Rank });

/** 1♥ - P - 4♥ - P - P - P, dealt by South: four hearts, declared by South. */
const AUCTION: { seat: Seat; call: Call }[] = [
  { seat: "S", call: "1H" },
  { seat: "W", call: "P" },
  { seat: "N", call: "4H" },
  { seat: "E", call: "P" },
  { seat: "S", call: "P" },
  { seat: "W", call: "P" },
];

const PASSED_OUT: { seat: Seat; call: Call }[] = (["S", "W", "N", "E"] as Seat[]).map((seat) => ({
  seat,
  call: "P" as Call,
}));

const SOUTH_CARDS: Card[] = [card("S14"), card("S13"), card("H10"), card("D5")];

/**
 * One trick of four spades (never the trump suit here), led by North, with the
 * top spade given to whichever side is meant to win it — so a whole board can
 * be built to a known number of tricks without a legality dance the display
 * model does not perform anyway.
 */
function spadeTrick(winner: "ns" | "ew"): { seat: Seat; card: Card }[] {
  const ranks = winner === "ns" ? [14, 13, 12, 11] : [11, 14, 13, 12];
  return (["N", "E", "S", "W"] as Seat[]).map((seat, i) => ({
    seat,
    card: card(`S${ranks[i]}`),
  }));
}

/** Thirteen tricks, ten of them to declarer's side: 4♥ made exactly. */
const MADE_FOUR = [
  ...Array.from({ length: 10 }, () => spadeTrick("ns")).flat(),
  ...Array.from({ length: 3 }, () => spadeTrick("ew")).flat(),
];

function snapshot(over: Partial<ChallengeSnapshot> = {}): ChallengeSnapshot {
  return {
    name: "Board 1",
    dealer: "S",
    vul: "none",
    hands: { N: [], E: [], S: SOUTH_CARDS, W: [] },
    auction: AUCTION,
    play: [],
    ...over,
  };
}

const IDENTITY: LineIdentity = {
  key: "u1",
  kind: "user",
  who: "You",
  short: "You",
  badge: "YOUR LINE",
  isViewer: true,
};

const build = (snap: ChallengeSnapshot, biddingOnly: boolean, rawScore?: number) =>
  buildCompareLine({
    identity: IDENTITY,
    snapshot: snap,
    board: { humanSeat: "S" },
    biddingOnly,
    ...(rawScore === undefined ? {} : { rawScore }),
  });

describe("a bidding-only line", () => {
  it("is FINISHED at the close of the auction, and reads as the contract reached", () => {
    const line = build(snapshot(), true);
    expect(line.contract).toBe("4♥");
    expect(line.byLine).toBe("by You");
    // The bug this replaces: with no cards, `play.length === 52` was false and
    // a completed auction was labelled a board someone walked away from.
    expect(line.result).toBe("Bidding only");
    expect(line.result).not.toMatch(/tricks so far/);
    // …and it is not a defeat either: no made/down was ever asked for.
    expect(line.result).not.toMatch(/Down/);
    expect(line.made).toBe(false);
    expect(line.resultTone).toBe("neutral");
  });

  it("prints no score, because there is none — not a zero", () => {
    expect(build(snapshot(), true).rawText).toBe("");
  });

  it("still calls a pass-out a pass-out", () => {
    const line = build(snapshot({ auction: PASSED_OUT }), true);
    expect(line.contract).toBe("Passed out");
    expect(line.result).toBe("Passed out");
    expect(line.resultTone).toBe("neutral");
  });

  it("carries the auction as its whole timeline", () => {
    const line = build(snapshot(), true);
    expect(line.auction).toHaveLength(AUCTION.length);
    expect(line.play).toEqual([]);
    expect(line.trickWinners).toEqual([]);
    expect(line.seatCards).toEqual(SOUTH_CARDS);
  });
});

describe("a full-board line, unchanged", () => {
  it("still reads an abandoned board as unfinished — the SAME snapshot shape", () => {
    // Identical to the bidding-only fixture above: a contract and no cards.
    // Only the format differs, and it is the whole difference.
    const line = build(snapshot(), false);
    expect(line.result).toBe("0 tricks so far");
    expect(line.made).toBe(false);
    expect(line.resultTone).toBe("bad");
  });

  it("counts completed tricks while a board is part-played", () => {
    const line = build(snapshot({ play: [...spadeTrick("ns"), ...spadeTrick("ew")] }), false);
    expect(line.result).toBe("1 tricks so far");
  });

  it("reports made and down off the thirteenth trick", () => {
    const made = build(snapshot({ play: MADE_FOUR }), false, 420);
    expect(made.result).toBe("Made 4");
    expect(made.made).toBe(true);
    expect(made.resultTone).toBe("good");
    expect(made.rawText).toBe("+420");

    // One trick handed back: nine to declarer against a need of ten.
    const down = build(
      snapshot({
        play: [
          ...Array.from({ length: 9 }, () => spadeTrick("ns")).flat(),
          ...Array.from({ length: 4 }, () => spadeTrick("ew")).flat(),
        ],
      }),
      false,
      -50,
    );
    expect(down.result).toBe("Down 1");
    expect(down.made).toBe(false);
    expect(down.resultTone).toBe("bad");
    expect(down.rawText).toBe("-50");
  });
});
