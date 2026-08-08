// Field-scoring behaviours, against HAND-COMPUTED fixtures: the IMP table
// (every published band boundary, both signs, and the gaps the published table
// leaves), the three field modes, and the edge cases that break naive
// implementations — a flat/passed-out board, a field of one, an empty field,
// negative datums, shared ranks, and players who have not finished every board.

import { describe, expect, it } from "vitest";
import {
  benchmarkScore,
  boardLeaders,
  challengeScores,
  combineBoardScores,
  fieldScores,
  IMP_TABLE,
  impFromDiff,
  rankStandings,
  type PlayerRawScore,
} from "./scoring";

describe("IMP_TABLE", () => {
  it("runs 0…24 IMPs in order", () => {
    expect(IMP_TABLE.map((b) => b.imps)).toEqual(
      Array.from({ length: 25 }, (_, i) => i),
    );
  });
  it("has strictly ascending, non-overlapping bounds", () => {
    for (let i = 0; i < IMP_TABLE.length; i++) {
      const band = IMP_TABLE[i]!;
      expect(band.from).toBeLessThanOrEqual(band.to);
      if (i > 0) expect(band.from).toBeGreaterThan(IMP_TABLE[i - 1]!.to);
    }
  });
  it("carries the nine bands the Girkar deck's cpt-imp-scoring prose writes out", () => {
    // "0–10 = 0 IMPs, 20–40 = 1, 50–80 = 2, 90–120 = 3, 130–160 = 4,
    //  170–210 = 5, 220–260 = 6, 270–310 = 7, 320–360 = 8"
    const prose = [
      [0, 0, 10], [1, 20, 40], [2, 50, 80], [3, 90, 120], [4, 130, 160],
      [5, 170, 210], [6, 220, 260], [7, 270, 310], [8, 320, 360],
    ];
    for (const [imps, from, to] of prose) {
      const band = IMP_TABLE.find((b) => b.imps === imps)!;
      expect([band.imps, band.from, band.to]).toEqual([imps, from, to]);
    }
  });
});

describe("impFromDiff", () => {
  // Every published boundary of the standard table.
  const boundaries: [number, number][] = [
    [0, 0], [10, 0],
    [20, 1], [40, 1],
    [50, 2], [80, 2],
    [90, 3], [120, 3],
    [130, 4], [160, 4],
    [170, 5], [210, 5],
    [220, 6], [260, 6],
    [270, 7], [310, 7],
    [320, 8], [360, 8],
    [370, 9], [420, 9],
    [430, 10], [490, 10],
    [500, 11], [590, 11],
    [600, 12], [740, 12],
    [750, 13], [890, 13],
    [900, 14], [1090, 14],
    [1100, 15], [1290, 15],
    [1300, 16], [1490, 16],
    [1500, 17], [1740, 17],
    [1750, 18], [1990, 18],
    [2000, 19], [2240, 19],
    [2250, 20], [2490, 20],
    [2500, 21], [2990, 21],
    [3000, 22], [3490, 22],
    [3500, 23], [3990, 23],
    [4000, 24],
  ];
  it("converts every band boundary", () => {
    for (const [points, imps] of boundaries) expect(impFromDiff(points)).toBe(imps);
  });
  it("is symmetric in sign", () => {
    // The zero band has no sign to mirror — and must never come back as -0,
    // which would print as "-0 IMPs" and break equality checks downstream.
    for (const [points, imps] of boundaries) {
      expect(impFromDiff(-points)).toBe(imps === 0 ? 0 : -imps);
    }
    expect(Object.is(impFromDiff(-5), 0)).toBe(true);
    expect(Object.is(impFromDiff(-10), 0)).toBe(true);
    expect(Object.is(impFromDiff(-0), 0)).toBe(true);
  });
  it("caps at 24 above the table", () => {
    expect(impFromDiff(7600)).toBe(24);
    expect(impFromDiff(-7600)).toBe(-24);
  });
  it("takes the next band up inside a published gap", () => {
    // Real differences are multiples of 10, so 11–19 cannot occur; the
    // function must still be total.
    expect(impFromDiff(15)).toBe(1);
    expect(impFromDiff(-15)).toBe(-1);
  });
});

// A four-player field, hand-computed throughout this block.
//   raw: alice +620, bob +170, cara −100, dan +140
//   sum 830, mean 207.5 → datum 210 (nearest ten)
const FIELD: PlayerRawScore[] = [
  { userId: "alice", rawScore: 620 },
  { userId: "bob", rawScore: 170 },
  { userId: "cara", rawScore: -100 },
  { userId: "dan", rawScore: 140 },
];

describe("fieldScores — imps (Butler vs datum)", () => {
  const result = fieldScores(FIELD, "imps");
  it("uses the field mean rounded to the nearest ten as the datum", () => {
    expect(result.datum).toBe(210);
  });
  it("converts each player's difference through the IMP table", () => {
    // 620−210=+410 → 9 · 170−210=−40 → −1 · −100−210=−310 → −7 · 140−210=−70 → −2
    expect(result.scores.map((s) => s.score)).toEqual([9, -1, -7, -2]);
  });
  it("keeps the input order and the raw scores", () => {
    expect(result.scores.map((s) => s.userId)).toEqual(["alice", "bob", "cara", "dan"]);
    expect(result.scores.map((s) => s.rawScore)).toEqual([620, 170, -100, 140]);
  });
  it("rounds the datum away from zero, so a negative field is symmetric", () => {
    // [−50, −140] → mean −95 → datum −100 (not −90).
    const negative = fieldScores(
      [
        { userId: "a", rawScore: -50 },
        { userId: "b", rawScore: -140 },
      ],
      "imps",
    );
    expect(negative.datum).toBe(-100);
    expect(negative.scores.map((s) => s.score)).toEqual([2, -1]);
  });
});

describe("fieldScores — matchpoints", () => {
  const result = fieldScores(FIELD, "mp");
  it("offers n−1 matchpoints per player", () => {
    expect(result.topMatchpoints).toBe(3);
  });
  it("scores 1 per player beaten, ½ per tie, as a percentage of the top", () => {
    // alice beats 3 → 3/3 · bob beats 2 → 2/3 · cara beats 0 · dan beats 1
    expect(result.scores.map((s) => s.matchpoints)).toEqual([3, 2, 0, 1]);
    expect(result.scores.map((s) => s.score)).toEqual([100, 66.67, 0, 33.33]);
  });
  it("splits a tie down the middle", () => {
    // 620, 620, 100 → the two leaders each beat one and tie one: 1.5/2 = 75%.
    const tied = fieldScores(
      [
        { userId: "a", rawScore: 620 },
        { userId: "b", rawScore: 620 },
        { userId: "c", rawScore: 100 },
      ],
      "mp",
    );
    expect(tied.scores.map((s) => s.score)).toEqual([75, 75, 0]);
  });
});

describe("fieldScores — total points", () => {
  it("is the raw score itself", () => {
    const result = fieldScores(FIELD, "total");
    expect(result.scores.map((s) => s.score)).toEqual([620, 170, -100, 140]);
    expect(result.datum).toBeNull();
    expect(result.topMatchpoints).toBeNull();
  });
});

describe("a passed-out board scores flat for the whole field", () => {
  // With plain random deals and BEN bidding, a board may pass out (spec §10):
  // everyone scores 0 raw, so nobody gains or loses on it.
  const passedOut: PlayerRawScore[] = [
    { userId: "a", rawScore: 0 },
    { userId: "b", rawScore: 0 },
    { userId: "c", rawScore: 0 },
  ];
  it("is 0 IMPs for everyone", () => {
    const r = fieldScores(passedOut, "imps");
    expect(r.datum).toBe(0);
    expect(r.scores.map((s) => s.score)).toEqual([0, 0, 0]);
  });
  it("is 50% for everyone", () => {
    expect(fieldScores(passedOut, "mp").scores.map((s) => s.score)).toEqual([50, 50, 50]);
  });
  it("highlights every player as a leader", () => {
    expect(boardLeaders(fieldScores(passedOut, "mp"))).toEqual(["a", "b", "c"]);
  });
});

describe("a field of one", () => {
  const solo: PlayerRawScore[] = [{ userId: "a", rawScore: 620 }];
  it("scores 0 IMPs — the datum is the player's own score", () => {
    const r = fieldScores(solo, "imps");
    expect(r.datum).toBe(620);
    expect(r.scores[0]!.score).toBe(0);
  });
  it("scores 50% — no comparison can be won or lost", () => {
    const r = fieldScores(solo, "mp");
    expect(r.topMatchpoints).toBe(0);
    expect(r.scores[0]!.score).toBe(50);
  });
  it("still reports the raw total unchanged", () => {
    expect(fieldScores(solo, "total").scores[0]!.score).toBe(620);
  });
});

describe("an empty field", () => {
  it("produces no scores and no datum", () => {
    for (const mode of ["imps", "mp", "total"] as const) {
      const r = fieldScores([], mode);
      expect(r.scores).toEqual([]);
      expect(boardLeaders(r)).toEqual([]);
    }
    expect(fieldScores([], "imps").datum).toBeNull();
  });
});

describe("benchmarkScore — BEN measured against the field, never inside it", () => {
  it("takes IMPs off the human datum", () => {
    const field = fieldScores(FIELD, "imps"); // datum 210
    // BEN +400 → 400−210 = 190 → 5 IMPs.
    expect(benchmarkScore(field, 400)).toBe(5);
    // The human scores are untouched by asking.
    expect(field.scores.map((s) => s.score)).toEqual([9, -1, -7, -2]);
  });
  it("matchpoints against all n field members (BEN never compares with itself)", () => {
    const field = fieldScores(FIELD, "mp");
    // BEN +200 beats 170, −100, 140 → 3/4 = 75%.
    expect(benchmarkScore(field, 200)).toBe(75);
  });
  it("returns the raw score at total points", () => {
    expect(benchmarkScore(fieldScores(FIELD, "total"), 400)).toBe(400);
  });
  it("is 50% against an empty field", () => {
    expect(benchmarkScore(fieldScores([], "mp"), 400)).toBe(50);
  });
});

describe("boardLeaders", () => {
  it("names the single best displayed figure", () => {
    expect(boardLeaders(fieldScores(FIELD, "imps"))).toEqual(["alice"]);
  });
  it("names every player tied for best", () => {
    const tied = fieldScores(
      [
        { userId: "a", rawScore: 620 },
        { userId: "b", rawScore: 620 },
        { userId: "c", rawScore: 100 },
      ],
      "total",
    );
    expect(boardLeaders(tied)).toEqual(["a", "b"]);
  });
});

describe("combineBoardScores", () => {
  it("sums IMPs and total points", () => {
    expect(combineBoardScores("imps", [9, -6, 2])).toBe(5);
    expect(combineBoardScores("total", [620, -100])).toBe(520);
  });
  it("averages matchpoint percentages into a session percentage", () => {
    expect(combineBoardScores("mp", [100, 50])).toBe(75);
    expect(combineBoardScores("mp", [100, 66.67, 0])).toBe(55.56);
  });
  it("is 0 with nothing to combine", () => {
    expect(combineBoardScores("imps", [])).toBe(0);
  });
});

describe("rankStandings", () => {
  it("ranks by total, highest first", () => {
    const rows = rankStandings([
      { userId: "b", total: 4, boardsScored: 2 },
      { userId: "a", total: 9, boardsScored: 2 },
      { userId: "c", total: -3, boardsScored: 2 },
    ]);
    expect(rows.map((r) => [r.userId, r.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });
  it("shares a rank on a tie and consumes the places below it", () => {
    const rows = rankStandings([
      { userId: "a", total: 10, boardsScored: 3 },
      { userId: "b", total: 10, boardsScored: 3 },
      { userId: "c", total: 5, boardsScored: 3 },
      { userId: "d", total: 5, boardsScored: 3 },
      { userId: "e", total: 1, boardsScored: 3 },
    ]);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3, 3, 5]);
  });
  it("orders a tie deterministically by userId", () => {
    const rows = rankStandings([
      { userId: "zoe", total: 10, boardsScored: 1 },
      { userId: "amy", total: 10, boardsScored: 1 },
    ]);
    expect(rows.map((r) => r.userId)).toEqual(["amy", "zoe"]);
  });
  it("handles an empty leaderboard", () => {
    expect(rankStandings([])).toEqual([]);
  });
});

describe("challengeScores — the whole challenge, hand-computed", () => {
  // Two boards at IMPs. Cara has finished board 1 only.
  //  Board 1 field 620/170/−100 → sum 690, mean 230 → datum 230
  //          alice +390 → 9 · bob −60 → −2 · cara −330 → −8 ; BEN 140 → −90 → −3
  //  Board 2 field −50/400 → sum 350, mean 175 → datum 180
  //          alice −230 → −6 · bob +220 → +6 ; no BEN figure yet
  const result = challengeScores({
    mode: "imps",
    boards: [
      {
        boardNo: 1,
        benRawScore: 140,
        scores: [
          { userId: "alice", rawScore: 620 },
          { userId: "bob", rawScore: 170 },
          { userId: "cara", rawScore: -100 },
        ],
      },
      {
        boardNo: 2,
        scores: [
          { userId: "alice", rawScore: -50 },
          { userId: "bob", rawScore: 400 },
        ],
      },
    ],
  });

  it("scores each board against its own field of completed humans", () => {
    expect(result.boards[0]!.field.datum).toBe(230);
    expect(result.boards[0]!.field.scores.map((s) => s.score)).toEqual([9, -2, -8]);
    expect(result.boards[1]!.field.datum).toBe(180);
    expect(result.boards[1]!.field.scores.map((s) => s.score)).toEqual([-6, 6]);
  });
  it("flags the per-board leader", () => {
    expect(result.boards[0]!.leaders).toEqual(["alice"]);
    expect(result.boards[1]!.leaders).toEqual(["bob"]);
  });
  it("keeps BEN out of the field but reports its benchmark", () => {
    expect(result.boards[0]!.benchmark).toBe(-3);
    expect(result.boards[1]!.benchmark).toBeNull();
    expect(result.benTotal).toBe(-3);
    // BEN's +140 never entered the board-1 datum (which would have been 207.5).
    expect(result.boards[0]!.field.datum).toBe(230);
  });
  it("totals everyone who has scored at least one board", () => {
    expect(result.totals).toEqual([
      { userId: "bob", total: 4, boardsScored: 2 },
      { userId: "alice", total: 3, boardsScored: 2 },
      { userId: "cara", total: -8, boardsScored: 1 },
    ]);
  });
  it("ranks ONLY players who have finished every board (final ranks only)", () => {
    expect(result.standings.map((s) => [s.userId, s.rank, s.total])).toEqual([
      ["bob", 1, 4],
      ["alice", 2, 3],
    ]);
    expect(result.standings.some((s) => s.userId === "cara")).toBe(false);
  });
});

describe("challengeScores — matchpoints across boards", () => {
  it("averages the board percentages into the session figure", () => {
    const result = challengeScores({
      mode: "mp",
      boards: [
        {
          boardNo: 1,
          scores: [
            { userId: "alice", rawScore: 620 },
            { userId: "bob", rawScore: 170 },
          ],
        },
        {
          boardNo: 2,
          scores: [
            { userId: "alice", rawScore: 100 },
            { userId: "bob", rawScore: 100 },
          ],
        },
      ],
    });
    expect(result.boards[0]!.field.scores.map((s) => s.score)).toEqual([100, 0]);
    expect(result.boards[1]!.field.scores.map((s) => s.score)).toEqual([50, 50]);
    expect(result.standings.map((s) => [s.userId, s.rank, s.total])).toEqual([
      ["alice", 1, 75],
      ["bob", 2, 25],
    ]);
  });
});

describe("challengeScores — nobody has finished anything", () => {
  it("produces empty totals and an empty leaderboard", () => {
    const result = challengeScores({
      mode: "imps",
      boards: [
        { boardNo: 1, scores: [] },
        { boardNo: 2, scores: [] },
      ],
    });
    expect(result.totals).toEqual([]);
    expect(result.standings).toEqual([]);
    expect(result.benTotal).toBeNull();
  });
});
