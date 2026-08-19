import { describe, expect, it } from "vitest";

import type { Call, Seat } from "@bridge/events";

import {
  gradeBiddingPuzzle,
  gradePlayPuzzle,
  puzzleAuctionSettled,
  puzzleBoardIsOver,
  puzzleKind,
} from "./types";

const calls = (...cs: string[]) =>
  cs.map((c, i) => ({ seat: (["N", "E", "S", "W"] as Seat[])[i % 4]!, call: c as Call }));

describe("the kind derives from the position", () => {
  it("an unfinished auction is a bidding puzzle", () => {
    // Partner opened, next hand overcalled — the learner's call is the answer.
    expect(puzzleKind({ auction: calls("1D", "1S") })).toBe("bidding");
    expect(puzzleKind({ auction: [] })).toBe("bidding");
  });

  it("a settled auction is a play puzzle", () => {
    expect(puzzleKind({ auction: calls("1S", "P", "2S", "P", "4S", "P", "P", "P") })).toBe("play");
  });

  it("three passes only settle an auction that has an opening", () => {
    expect(puzzleAuctionSettled(calls("P", "P", "P"))).toBe(false);
    expect(puzzleAuctionSettled(calls("1S", "P", "P", "P"))).toBe(true);
  });
});

describe("when a puzzle attempt is over", () => {
  const bidding = { auction: calls("1D", "1S") };
  const play = { auction: calls("1S", "P", "2S", "P", "4S", "P", "P", "P") };

  it("a bidding puzzle ends the moment the learner answers", () => {
    expect(puzzleBoardIsOver(bidding, "auction", 2)).toBe(false); // still thinking
    expect(puzzleBoardIsOver(bidding, "auction", 3)).toBe(true); // answered
  });

  it("a play puzzle runs to the last trick", () => {
    expect(puzzleBoardIsOver(play, "play", 8)).toBe(false);
    expect(puzzleBoardIsOver(play, "complete", 8)).toBe(true);
  });
});

describe("grading", () => {
  it("a bidding puzzle is solved by the authored call, at the authored moment", () => {
    const p = { auction: calls("1D", "1S"), solution: { kind: "call", call: "X" as Call } as const };
    expect(gradeBiddingPuzzle(p, calls("1D", "1S", "X"))).toBe(true);
    expect(gradeBiddingPuzzle(p, calls("1D", "1S", "P"))).toBe(false);
    // An unanswered puzzle is not solved.
    expect(gradeBiddingPuzzle(p, calls("1D", "1S"))).toBe(false);
  });

  it("a play puzzle defaults its target to the contract", () => {
    const p = { solution: { kind: "goal" } as const };
    expect(gradePlayPuzzle(p, 4, 10)).toBe(true); // made 4♠ exactly
    expect(gradePlayPuzzle(p, 4, 9)).toBe(false); // one down
  });

  it("an explicit trick target overrides the contract's", () => {
    const p = { solution: { kind: "goal", tricks: 12 } as const };
    expect(gradePlayPuzzle(p, 4, 11)).toBe(false);
    expect(gradePlayPuzzle(p, 4, 12)).toBe(true);
  });
});
