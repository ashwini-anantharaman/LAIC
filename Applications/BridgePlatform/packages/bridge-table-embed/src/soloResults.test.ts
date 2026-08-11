// The solo results maths — the half of the challenge player that has no DOM in
// it. What is checked here is exactly what "there is no field" means in
// arithmetic: a board is measured against BEN and against nothing else, and a
// board BEN never answered is UNRATED rather than lost.

import { describe, expect, it } from "vitest";
import type { Contract } from "@bridge/events";
import { buildSoloResults, headToHead, type SoloBoardOutcome } from "./soloResults";

const contract = (level: number, strain: string, declarer: string, doubled = 0): Contract =>
  ({ level, strain, declarer, doubled }) as unknown as Contract;

const played = (raw: number, label = "4♠", result = "="): SoloBoardOutcome["you"] => ({
  contract: contract(4, "S", "S"),
  contractLabel: label,
  resultLabel: result,
  rawScore: raw,
});

describe("headToHead", () => {
  it("scores IMPs off the difference, using the standard table", () => {
    // 620 - 170 = 450 points, which is 10 IMPs.
    expect(headToHead("imps", 620, 170)).toBe(10);
    expect(headToHead("imps", 170, 620)).toBe(-10);
    expect(headToHead("imps", 400, 400)).toBe(0);
  });

  it("scores total points as the plain difference", () => {
    expect(headToHead("total", 620, 170)).toBe(450);
    expect(headToHead("total", 100, 300)).toBe(-200);
  });

  it("matchpoints a single comparison as the whole top, a half, or nothing", () => {
    expect(headToHead("mp", 620, 170)).toBe(100);
    expect(headToHead("mp", 170, 170)).toBe(50);
    expect(headToHead("mp", 100, 170)).toBe(0);
  });
});

describe("buildSoloResults — a played board", () => {
  const view = (outcomes: SoloBoardOutcome[], boardsTotal = 2) =>
    buildSoloResults({
      format: "full",
      scoring: "imps",
      boardsTotal,
      outcomes,
      currentBoardNo: 2,
    });

  it("sets your line beside BEN's and sums the IMPs", () => {
    const v = view([
      { boardNo: 1, you: played(620), ben: { contract: contract(3, "N", "N"), rawScore: 170 } },
      { boardNo: 2, you: played(-100), ben: { contract: contract(3, "N", "N"), rawScore: 140 } },
    ]);
    expect(v.rows[0]?.cells[0]?.text).toBe("+10");
    expect(v.rows[0]?.cells[1]?.text).toBe("+170");
    expect(v.rows[1]?.cells[0]?.text).toBe("-6");
    expect(v.headline.text).toBe("+4");
    expect(v.mark.boardsWon).toBe(1);
    expect(v.mark.rated).toBe(2);
    expect(v.mark.completed).toBe(true);
    expect(v.mark.percent).toBe(50);
  });

  it("names each contract once — the engine's result line already says it", () => {
    const v = view([
      {
        boardNo: 1,
        you: { ...played(-100, "1NT by N", "1NT by N, down 2"), rawScore: -100 },
        ben: { contractLabel: "4H by S", resultLabel: "4H by S, down 4", rawScore: -200 },
      },
    ]);
    expect(v.details[1]?.sub).toBe("You: 1NT by N, down 2 (-100) · BEN: 4H by S, down 4 (-200)");
  });

  it("counts a board level with BEN as won — flat is not behind", () => {
    const v = view([
      { boardNo: 1, you: played(420), ben: { contract: contract(4, "S", "S"), rawScore: 420 } },
    ]);
    expect(v.rows[0]?.cells[0]?.text).toBe("0");
    expect(v.mark.boardsWon).toBe(1);
    expect(v.headline.tone).toBe("neutral");
  });

  it("leaves a board BEN has not played UNRATED, not lost", () => {
    const v = view([{ boardNo: 1, you: played(620) }]);
    expect(v.mark.rated).toBe(0);
    expect(v.mark.boardsWon).toBe(0);
    expect(v.mark.boardsDone).toBe(1);
    expect(v.headline.text).toBe("—");
    expect(v.details[1]?.headline).toBe("BEN is still playing this board");
  });

  it("says so when BEN was asked and could not answer", () => {
    const v = view([{ boardNo: 1, you: played(620), benFailed: true }]);
    expect(v.details[1]?.headline).toBe("BEN could not play this board");
  });

  it("marks the open board current and the unplayed ones todo", () => {
    const v = view([{ boardNo: 1, you: played(620) }]);
    expect(v.squares.map((s) => s.state)).toEqual(["done", "current"]);
    expect(v.squares[1]?.disabled).toBe(true);
    expect(v.mark.completed).toBe(false);
  });

  it("averages matchpoints and sums points, as the platform combines them", () => {
    const outcomes: SoloBoardOutcome[] = [
      { boardNo: 1, you: played(620), ben: { rawScore: 170 } },
      { boardNo: 2, you: played(100), ben: { rawScore: 400 } },
    ];
    const mp = buildSoloResults({ format: "full", scoring: "mp", boardsTotal: 2, outcomes });
    expect(mp.headline.text).toBe("50.0%");
    const total = buildSoloResults({ format: "full", scoring: "total", boardsTotal: 2, outcomes });
    expect(total.headline.text).toBe("+150");
  });
});

describe("buildSoloResults — a board that ends with the auction", () => {
  const view = (outcomes: SoloBoardOutcome[], boardsTotal = outcomes.length) =>
    buildSoloResults({ format: "bidding-only", scoring: "imps", boardsTotal, outcomes });

  it("tallies the contracts that matched BEN's", () => {
    const v = view([
      { boardNo: 1, you: { contract: contract(4, "S", "S") }, ben: { contract: contract(4, "S", "N") } },
      { boardNo: 2, you: { contract: contract(3, "N", "S") }, ben: { contract: contract(4, "S", "S") } },
    ]);
    expect(v.headline.text).toBe("1/2");
    expect(v.mark.boardsWon).toBe(1);
    expect(v.rows[0]?.cells[0]?.value).toBe(1);
    expect(v.rows[1]?.cells[0]?.value).toBeUndefined();
  });

  it("matches on level, strain and doubling — not on which partner declares", () => {
    const v = view([
      { boardNo: 1, you: { contract: contract(4, "S", "S") }, ben: { contract: contract(4, "S", "N") } },
    ]);
    expect(v.details[1]?.headline).toBe("Matched BEN, from the other side");
  });

  it("never calls a different contract wrong", () => {
    const v = view([
      { boardNo: 1, you: { contract: contract(3, "N", "S") }, ben: { contract: contract(4, "S", "S") } },
    ]);
    expect(v.details[1]?.headline).toBe("A different contract");
    expect(v.details[1]?.tone).toBe("neutral");
  });

  it("treats two passouts as a match", () => {
    const v = view([{ boardNo: 1, you: { contract: null }, ben: { contract: null } }]);
    expect(v.rows[0]?.cells[0]?.text).toBe("Pass");
    expect(v.mark.boardsWon).toBe(1);
    expect(v.details[1]?.headline).toBe("Matched BEN");
  });

  it("prints no play score at all — the contract IS the result", () => {
    const v = view([
      { boardNo: 1, you: { contract: contract(4, "S", "S") }, ben: { contract: contract(4, "S", "S") } },
    ]);
    expect(v.rows[0]?.cells[1]?.text).toBe("4♠S");
    expect(v.unitLabel).toBe("vs BEN");
  });
});
