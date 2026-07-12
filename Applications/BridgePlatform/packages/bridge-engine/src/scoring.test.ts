// Law 77 scoring table cases (values cross-checked against the standard
// duplicate scoring table).

import { describe, expect, it } from "vitest";
import type { Contract, Seat, Vul } from "@bridge/events";
import { scoreBoard, resultLabel } from "./scoring";
import type { GameState } from "./state";

const completed = (
  contract: Contract | null,
  declarerTricks: number,
  vul: Vul,
): GameState => {
  const side = contract && (contract.declarer === "N" || contract.declarer === "S") ? "NS" : "EW";
  return {
    boardRef: "t", dealer: "N" as Seat, vul,
    hands: { N: [], E: [], S: [], W: [] },
    auction: [], contract, phase: "complete", turn: "N",
    tricks: [],
    trickCount:
      side === "NS"
        ? { NS: declarerTricks, EW: 13 - declarerTricks }
        : { NS: 13 - declarerTricks, EW: declarerTricks },
  };
};

const c = (level: number, strain: Contract["strain"], declarer: Seat, doubled: 0 | 1 | 2 = 0): Contract =>
  ({ level, strain, doubled, declarer });

describe("scoreBoard (Law 77)", () => {
  it("returns null for unfinished boards", () => {
    const s = completed(c(2, "S", "N"), 8, "none");
    expect(scoreBoard({ ...s, phase: "play" })).toBeNull();
  });

  it("passed-out board scores zero", () => {
    const score = scoreBoard(completed(null, 0, "both"))!;
    expect(score.declarerScore).toBe(0);
    expect(score.nsScore).toBe(0);
    expect(resultLabel(score)).toBe("Passed out");
  });

  it.each([
    // [contract, tricks, vul, expected declarer score]
    [c(2, "S", "N"), 8, "none", 110],          // partscore: 60 + 50
    [c(2, "S", "N"), 9, "none", 140],          // +1 overtrick
    [c(3, "N", "S"), 9, "none", 400],          // 3NT nv game: 100 + 300
    [c(3, "N", "S"), 9, "ns", 600],            // 3NT vul game: 100 + 500
    [c(4, "H", "E"), 10, "ew", 620],           // 4H vul game: 120 + 500
    [c(5, "C", "W"), 11, "none", 400],         // 5C nv game: 100 + 300
    [c(6, "S", "N"), 12, "none", 980],         // small slam nv: 180 + 300 + 500
    [c(7, "N", "S"), 13, "both", 2220],        // grand slam vul NT: 220 + 500 + 1500
    [c(1, "N", "N"), 7, "none", 90],           // 1NT: 40 + 50
    [c(2, "C", "N", 1), 8, "none", 180],       // 2C X made: 80 + 50 + 50 (doubled into partscore? 80<100)
    [c(2, "S", "N", 1), 8, "none", 470],       // 2S X made nv: 120 + 300 (doubled into game) + 50
    [c(3, "N", "S", 2), 9, "ns", 1000],        // 3NT XX vul: 400 + 500 + 100
    [c(4, "H", "E", 1), 11, "none", 690],      // 4H X +1 nv: 240 + 300 + 50 + 100
  ] as const)("%o taking %i tricks (%s vul) scores %i", (contract, tricks, vul, expected) => {
    expect(scoreBoard(completed(contract, tricks, vul))!.declarerScore).toBe(expected);
  });

  it.each([
    [c(4, "S", "N"), 9, "none", -50],          // down 1 nv
    [c(4, "S", "N"), 8, "ns", -200],           // down 2 vul
    [c(3, "N", "S", 1), 6, "none", -500],      // 3NT X down 3 nv: 100+200+200
    [c(3, "N", "S", 1), 5, "none", -800],      // down 4 nv doubled: +300
    [c(3, "N", "S", 1), 6, "ns", -800],        // down 3 vul doubled: 200+300+300
    [c(2, "H", "E", 2), 6, "none", -600],      // XX down 2 nv: (100+200)*2
  ] as const)("%o taking %i tricks (%s vul) goes for %i", (contract, tricks, vul, expected) => {
    expect(scoreBoard(completed(contract, tricks, vul))!.declarerScore).toBe(expected);
  });

  it("nsScore flips sign for EW declarers", () => {
    const score = scoreBoard(completed(c(4, "H", "E"), 10, "none"))!;
    expect(score.declarerScore).toBe(420);
    expect(score.nsScore).toBe(-420);
  });

  it("labels results readably", () => {
    expect(resultLabel(scoreBoard(completed(c(4, "S", "N"), 11, "none"))!)).toBe("4♠ by N, made +1");
    expect(resultLabel(scoreBoard(completed(c(3, "N", "S", 1), 6, "none"))!)).toBe("3NT X by S, down 3");
  });
});
