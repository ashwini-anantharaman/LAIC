// The results view model, against hand-computed fixtures. Everything the
// results surface shows is decided here, so this is where the binding rules of
// ADDENDUM A3/A5 are pinned: the field is completed humans only, BEN is a
// benchmark and never a rank, ties share a rank, and the number behind a cell
// is the number that was printed.

import type {
  Challenge,
  ChallengeBaseline,
  ChallengeBoard,
  ChallengeInvite,
  ChallengePlay,
  ChallengeScoring,
} from "@bridge/challenges";
import type { Contract } from "@bridge/events";
import { describe, expect, it } from "vitest";
import {
  BEN_KEY,
  BIDDING_PRACTICE_LABEL,
  PRACTICE_LABEL,
  buildResultsView,
  formatCell,
  formatTotal,
  shortCode,
  toneFor,
  type ResultsViewInput,
} from "./resultsView";

const VIEWER = "u-you";

function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    challengeId: "ch1",
    title: "Tuesday Night Teams",
    scoring: "imps",
    createdBy: "u-marta",
    createdByName: "Marta Okonkwo",
    status: "open",
    editorBadge: true,
    standingsVisibility: "after-finish",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function board(boardNo: number): ChallengeBoard {
  return {
    challengeId: "ch1",
    boardNo,
    pack: { N: [], E: [], S: [], W: [] },
    dealer: "N",
    vul: "none",
    humanSeat: "S",
    controlOverrides: {},
  };
}

function play(
  userId: string,
  boardNo: number,
  rawScore: number | undefined,
  status: ChallengePlay["status"] = "completed",
): ChallengePlay {
  return {
    challengeId: "ch1",
    boardNo,
    userId,
    sessionId: `s-${userId}-${boardNo}`,
    status,
    rawScore,
    snapshot:
      status === "completed"
        ? {
            name: `Board ${boardNo}`,
            dealer: "N",
            vul: "none",
            hands: { N: [], E: [], S: [], W: [] },
            auction: [],
            play: [],
            contractLabel: "4S",
            resultLabel: "+1",
          }
        : undefined,
    startedAt: "2026-08-02T00:00:00.000Z",
    completedAt: status === "completed" ? "2026-08-02T01:00:00.000Z" : undefined,
  };
}

function invite(
  userId: string,
  status: ChallengeInvite["status"] = "accepted",
  moderator = false,
): ChallengeInvite {
  return {
    challengeId: "ch1",
    userId,
    userName: userId === "u-marta" ? "Marta Okonkwo" : `Player ${userId.slice(-2)}`,
    status,
    moderator,
    invitedBy: "u-marta",
    invitedAt: "2026-08-01T00:00:00.000Z",
  };
}

function benBaseline(boardNo: number, rawScore: number): ChallengeBaseline {
  return {
    challengeId: "ch1",
    boardNo,
    kind: "full_ben",
    status: "ready",
    rawScore,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

/**
 * Two boards, three humans. Board 1: you 620, Marta 620, Devang 170 (datum
 * 470 -> +4 / +4 / -7). Board 2: you 140, Marta -100, Devang 140 (datum 60 ->
 * +2 / -4 / +2). Totals: you +6, Devang -5, Marta 0. BEN: 660 / 170 -> +5, +3.
 */
function baseInput(overrides: Partial<ResultsViewInput> = {}): ResultsViewInput {
  return {
    challenge: challenge(),
    boards: [board(1), board(2)],
    plays: [
      play(VIEWER, 1, 620),
      play("u-marta", 1, 620),
      play("u-devang", 1, 170),
      play(VIEWER, 2, 140),
      play("u-marta", 2, -100),
      play("u-devang", 2, 140),
    ],
    invites: [
      invite("u-marta", "accepted", true),
      invite(VIEWER),
      invite("u-devang"),
      invite("u-sam", "pending"),
    ],
    baselines: [benBaseline(1, 660), benBaseline(2, 170)],
    viewerId: VIEWER,
    viewerFinished: true,
    viewerIsModerator: false,
    resultsUnlocked: true,
    names: { "u-marta": "Marta Okonkwo", "u-devang": "Devang Rao", [VIEWER]: "You Yourself" },
    ...overrides,
  };
}

describe("formatting", () => {
  it("prints IMPs as signed integers and totals without separators", () => {
    expect(formatCell("imps", 3)).toBe("+3");
    expect(formatCell("imps", -2)).toBe("-2");
    expect(formatCell("imps", 0)).toBe("0");
    expect(formatTotal("imps", 14)).toBe("+14");
    expect(formatTotal("imps", -14)).toBe("-14");
  });

  it("prints matchpoints as a bare cell percentage and a one-decimal total", () => {
    expect(formatCell("mp", 55.6)).toBe("56");
    expect(formatTotal("mp", 56.25)).toBe("56.3%");
  });

  it("groups total points and always signs them", () => {
    expect(formatTotal("total", 3120)).toBe("+3,120");
    expect(formatTotal("total", -1430)).toBe("-1,430");
    expect(formatCell("total", -420)).toBe("-420");
  });

  it("treats 50% as flat, because matchpoints are not zero-centred", () => {
    expect(toneFor("mp", 50)).toBe("neutral");
    expect(toneFor("mp", 60)).toBe("pos");
    expect(toneFor("mp", 40)).toBe("neg");
    expect(toneFor("imps", 0)).toBe("neutral");
    expect(toneFor("imps", -1)).toBe("neg");
  });

  it("codes a column head from the first two initials", () => {
    expect(shortCode("Marta Okonkwo")).toBe("MO");
    expect(shortCode("Devang")).toBe("DE");
  });
});

describe("standings", () => {
  it("ranks the completed field and leaves BEN out of it", () => {
    const view = buildResultsView(baseInput());
    expect(view.leaderboard.map((r) => [r.rank, r.name, r.total])).toEqual([
      [1, "You", "+6"],
      [2, "Marta Okonkwo", "+0"],
      [3, "Devang Rao", "-5"],
    ]);
    // BEN is a hairline footer, never a row and never a rank.
    expect(view.leaderboard.some((r) => r.name === "BEN")).toBe(false);
    expect(view.benRow).toEqual({ total: "+8" });
    expect(view.viewerRank).toBe(1);
  });

  it("shares a rank on a tie", () => {
    const view = buildResultsView(
      baseInput({
        plays: [
          play(VIEWER, 1, 620),
          play("u-marta", 1, 620),
          play(VIEWER, 2, 140),
          play("u-marta", 2, 140),
        ],
      }),
    );
    expect(view.leaderboard.map((r) => r.rank)).toEqual([1, 1]);
  });

  it("keeps a player who has not finished every board out of the field", () => {
    const view = buildResultsView(
      baseInput({
        plays: [
          play(VIEWER, 1, 620),
          play("u-marta", 1, 620),
          play("u-devang", 1, 170),
          play(VIEWER, 2, 140),
          play("u-marta", 2, -100),
          // Devang is still on board 2.
          play("u-devang", 2, undefined, "in_progress"),
        ],
      }),
    );
    expect(view.leaderboard.map((r) => r.name)).toEqual(["You", "Marta Okonkwo"]);
    expect(view.summaryLine).toBe(`2 finished · 1 still playing · 1 invited`);
  });

  it("says out loud that the unfinished viewer is one of the still-playing", () => {
    const view = buildResultsView(
      baseInput({
        viewerFinished: false,
        viewerIsModerator: true,
        plays: [play("u-marta", 1, 620), play("u-marta", 2, -100), play(VIEWER, 1, 620)],
      }),
    );
    expect(view.summaryLine).toBe(`1 finished · 2 still playing (including you) · 1 invited`);
    expect(view.viewerRank).toBeNull();
    expect(view.earlyNote).toMatch(/moderator/);
  });

  it("explains early sight from an always-visible challenge without moderation", () => {
    const view = buildResultsView(
      baseInput({
        challenge: challenge({ standingsVisibility: "always" }),
        viewerFinished: false,
        plays: [play("u-marta", 1, 620), play("u-marta", 2, -100)],
      }),
    );
    expect(view.earlyNote).toMatch(/shows standings to everyone/);
  });

  it("marks the pack editor and every competing moderator", () => {
    const view = buildResultsView(baseInput());
    const marta = view.leaderboard.find((r) => r.name === "Marta Okonkwo");
    // Marta created the challenge, opened the pack editor, and moderates.
    expect(marta?.marks).toEqual(["editor", "moderator"]);
    expect(view.leaderboard.find((r) => r.name === "You")?.marks).toEqual([]);
  });

  it("drops the editor mark when the creator never opened the pack editor", () => {
    const view = buildResultsView({ ...baseInput(), challenge: challenge({ editorBadge: false }) });
    expect(view.leaderboard.find((r) => r.name === "Marta Okonkwo")?.marks).toEqual(["moderator"]);
  });
});

describe("the board-by-board grid", () => {
  it("is boards x the ranked field with BEN as the last column", () => {
    const view = buildResultsView(baseInput());
    expect(view.scorecard?.columns.map((c) => c.key)).toEqual([
      VIEWER,
      "u-marta",
      "u-devang",
      BEN_KEY,
    ]);
    expect(view.scorecard?.columns.map((c) => c.label)).toEqual(["You", "MO", "DR", "BEN"]);
    expect(view.scorecard?.columns.at(-1)?.isBenchmark).toBe(true);
    expect(view.scorecard?.columns[0]?.isYou).toBe(true);
  });

  it("carries the printed figure AND the number behind it, so the tint matches", () => {
    const view = buildResultsView(baseInput());
    const row1 = view.scorecard?.rows[0];
    expect(row1?.boardNo).toBe(1);
    expect(row1?.cells.map((c) => c.text)).toEqual(["+4", "+4", "-7", "+5"]);
    expect(row1?.cells.map((c) => c.value)).toEqual([4, 4, -7, 5]);
    expect(view.scorecard?.totals.map((t) => t.text)).toEqual(["+6", "+0", "-5", "+8"]);
  });

  it("rounds a matchpoint cell to the figure it prints", () => {
    const view = buildResultsView({ ...baseInput(), challenge: challenge({ scoring: "mp" }) });
    // Matchpoints reorder the field: Marta and Devang both average 37.5%, and
    // a tie is broken for display by userId, so Devang takes the second column.
    expect(view.scorecard?.columns.map((c) => c.key)).toEqual([
      VIEWER,
      "u-devang",
      "u-marta",
      BEN_KEY,
    ]);
    const row1 = view.scorecard?.rows[0];
    // Board 1: you and Marta tie 620 over Devang's 170 -> 75 / 0 / 75, BEN 100.
    expect(row1?.cells.map((c) => c.text)).toEqual(["75", "0", "75", "100"]);
    expect(row1?.cells.map((c) => c.value)).toEqual([75, 0, 75, 100]);
    expect(row1?.cells[1]?.tone).toBe("neg");
    expect(view.scorecard?.totals.map((t) => t.text)).toEqual([
      "75.0%",
      "37.5%",
      "37.5%",
      "100.0%",
    ]);
  });

  it("leaves BEN's cell blank on a board with no baseline yet", () => {
    const view = buildResultsView({ ...baseInput(), baselines: [benBaseline(1, 660)] });
    expect(view.scorecard?.rows[1]?.cells.at(-1)).toEqual({ text: "" });
    expect(view.scorecard?.totals.at(-1)?.text).toBe("+5");
  });

  it("has no grid at all when nobody has finished", () => {
    const view = buildResultsView(
      baseInput({ plays: [play(VIEWER, 1, 620)], viewerFinished: false }),
    );
    expect(view.scorecard).toBeNull();
    expect(view.leaderboard).toEqual([]);
    // Nothing to benchmark against, so no benchmark footer either.
    expect(view.benRow).toBeNull();
  });
});

describe("the viewer's own boards", () => {
  it("shows a score in every done square once the results are unlocked", () => {
    const view = buildResultsView(baseInput());
    expect(view.squares.map((s) => [s.state, s.score])).toEqual([
      ["done", "+4"],
      ["done", "+2"],
    ]);
    expect(view.squares.every((s) => s.disabled === false)).toBe(true);
  });

  it("hides scores and refuses selection while the results are locked", () => {
    const view = buildResultsView(
      baseInput({
        viewerFinished: false,
        resultsUnlocked: false,
        plays: [play(VIEWER, 1, 620), play("u-marta", 1, 620), play("u-marta", 2, -100)],
      }),
    );
    expect(view.squares.map((s) => [s.state, s.score, s.disabled])).toEqual([
      ["done", undefined, true],
      ["current", undefined, true],
    ]);
    expect(view.details).toEqual({});
    expect(view.progress).toEqual({ done: 1, total: 2, pct: 50 });
    expect(view.boardsCaption).toMatch(/scores appear when you finish/);
  });

  it("describes a done board with its contract, raw score and challenge score", () => {
    const view = buildResultsView(baseInput());
    expect(view.details[1]).toMatchObject({
      boardNo: 1,
      contract: "4S +1",
      raw: "+620 (your side)",
      rawTone: "pos",
      unit: "IMPs vs datum",
      score: "+4",
      scoreTone: "pos",
      benReady: true,
    });
    expect(view.details[1]?.sub).toBe("Dealer N · None vul · you sat South");
  });

  it("prints the matchpoint detail with its percent sign", () => {
    const view = buildResultsView({ ...baseInput(), challenge: challenge({ scoring: "mp" }) });
    expect(view.details[1]?.score).toBe("75%");
    expect(view.details[1]?.unit).toBe("Matchpoints");
  });
});

describe("the header", () => {
  it("reads N boards . scoring . by creator, with the editor diamond", () => {
    const view = buildResultsView(baseInput());
    expect(view.subtitle).toBe("2 boards · IMPs · by Marta ◆");
    expect(view.benKey).toBe(BEN_KEY);
  });

  it("says 'by you' to the creator", () => {
    const view = buildResultsView({
      ...baseInput(),
      challenge: challenge({ createdBy: VIEWER, editorBadge: false }),
    });
    expect(view.subtitle).toBe("2 boards · IMPs · by you");
  });

  it("names the scoring mode the creator picked", () => {
    const modes: [ChallengeScoring, string][] = [
      ["mp", "Matchpoints"],
      ["total", "Total points"],
    ];
    for (const [scoring, label] of modes) {
      const view = buildResultsView({ ...baseInput(), challenge: challenge({ scoring }) });
      expect(view.subtitle).toContain(label);
    }
  });
});

// ── bidding-only ────────────────────────────────────────────────────────────
//
// The board ends with the auction, so the surface stops being about scores and
// starts being about contracts. What is pinned here: no raw score is ever
// printed where there is none, nobody is called wrong, and BEN is the yardstick
// rather than a rival.

const CONTRACT = (
  level: number,
  strain: Contract["strain"],
  declarer: Contract["declarer"],
  doubled: Contract["doubled"] = 0,
): Contract => ({ level, strain, declarer, doubled });

/** A frozen bidding-only attempt: a contract, and NO raw score. */
function bidPlay(
  userId: string,
  boardNo: number,
  contract: Contract | null,
  status: ChallengePlay["status"] = "completed",
): ChallengePlay {
  return {
    challengeId: "ch1",
    boardNo,
    userId,
    sessionId: `s-${userId}-${boardNo}`,
    status,
    snapshot:
      status === "completed"
        ? {
            name: `Board ${boardNo}`,
            dealer: "N",
            vul: "none",
            hands: { N: [], E: [], S: [], W: [] },
            auction: [],
            play: [],
            contractLabel: contract ? "4♠ by S" : undefined,
            contract,
          }
        : undefined,
    startedAt: "2026-08-02T00:00:00.000Z",
    completedAt: status === "completed" ? "2026-08-02T01:00:00.000Z" : undefined,
  };
}

/** A bidding-only reference line: a contract, and no rawScore either. */
function benBidBaseline(boardNo: number, contract: Contract | null): ChallengeBaseline {
  return {
    challengeId: "ch1",
    boardNo,
    kind: "full_ben",
    status: "ready",
    snapshot: {
      name: `Board ${boardNo} — BEN`,
      dealer: "N",
      vul: "none",
      hands: { N: [], E: [], S: [], W: [] },
      auction: [],
      play: [],
      contract,
    },
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

/**
 * Two boards, two humans. Board 1: BEN 4♠S — you 4♠S (matched), Devang 3NT S
 * (differed). Board 2: BEN 3NT N — you 2♥S (differed), Devang 3NT S (matched
 * from the other side). So both finish 1 of 2.
 */
function biddingInput(overrides: Partial<ResultsViewInput> = {}): ResultsViewInput {
  return {
    challenge: challenge({ format: "bidding-only" }),
    boards: [board(1), board(2)],
    plays: [
      bidPlay(VIEWER, 1, CONTRACT(4, "S", "S")),
      bidPlay("u-devang", 1, CONTRACT(3, "N", "S")),
      bidPlay(VIEWER, 2, CONTRACT(2, "H", "S")),
      bidPlay("u-devang", 2, CONTRACT(3, "N", "S")),
    ],
    invites: [invite("u-marta", "accepted", true), invite(VIEWER), invite("u-devang")],
    baselines: [
      benBidBaseline(1, CONTRACT(4, "S", "S")),
      benBidBaseline(2, CONTRACT(3, "N", "N")),
    ],
    viewerId: VIEWER,
    viewerFinished: true,
    viewerIsModerator: false,
    resultsUnlocked: true,
    names: { "u-marta": "Marta Okonkwo", "u-devang": "Devang Rao" },
    ...overrides,
  };
}

describe("bidding-only results", () => {
  it('names the format, not a scoring mode, everywhere the unit is printed', () => {
    const view = buildResultsView(biddingInput());
    expect(view.subtitle).toContain("Bidding only");
    expect(view.subtitle).not.toContain("IMPs");
    expect(view.scoringUnit).toBe("Contract vs BEN");
    expect(view.scoringLabel).toBe("vs BEN");
  });

  it('tallies "matched on N of M" instead of a score', () => {
    const view = buildResultsView(biddingInput());
    expect(view.leaderboard.map((r) => [r.name, r.total])).toEqual([
      ["Devang Rao", "1/2"],
      ["You", "1/2"],
    ]);
    // Tied, so both share rank 1 — the same rule the scored challenge uses.
    expect(view.leaderboard.map((r) => r.rank)).toEqual([1, 1]);
  });

  it("prints contracts in the grid, never a raw score", () => {
    const view = buildResultsView(biddingInput());
    const row1 = view.scorecard!.rows[0]!;
    expect(row1.cells.map((c) => c.text)).toEqual(["3NTS", "4♠S", "4♠S"]);
    // Columns are the field in rank order, then BEN.
    expect(view.scorecard!.columns.map((c) => c.key)).toEqual([
      "u-devang",
      VIEWER,
      BEN_KEY,
    ]);
    expect(view.scorecard!.columns[2]!.isBenchmark).toBe(true);
  });

  it("tints only the players who matched — and BEN's own cell never", () => {
    const view = buildResultsView(biddingInput());
    const [devang, you, ben] = view.scorecard!.rows[0]!.cells;
    expect(you!.tone).toBe("pos");
    expect(you!.value).toBe(1);
    // A different contract is NEUTRAL, never negative: nobody is told they are
    // wrong, because BEN's system is not necessarily the lesson's.
    expect(devang!.tone).toBe("neutral");
    expect(devang!.value).toBeUndefined();
    expect(ben!.value).toBeUndefined();
  });

  it("carries no BEN benchmark row — BEN is the yardstick, not a rival", () => {
    expect(buildResultsView(biddingInput()).benRow).toBeNull();
    expect(buildResultsView(biddingInput()).scorecard!.totals.at(-1)).toEqual({ text: "" });
  });

  it("sets your contract beside BEN's in the board detail, in neutral language", () => {
    const view = buildResultsView(biddingInput());
    expect(view.details[1]).toMatchObject({
      contract: "4♠ by S",
      raw: "BEN: 4♠ by S",
      rawTone: "neutral",
      unit: "Contract vs BEN",
      score: "Matched BEN",
      scoreTone: "pos",
      benReady: true,
    });
    expect(view.details[2]).toMatchObject({
      raw: "BEN: 3NT by N",
      score: "A different contract",
      scoreTone: "neutral",
    });
    // Nothing anywhere on this surface calls the learner wrong.
    expect(JSON.stringify(view)).not.toMatch(/wrong|incorrect/i);
  });

  it("says so, and rates nobody, when BEN has not bid a board yet", () => {
    const view = buildResultsView(biddingInput({ baselines: [] }));
    expect(view.details[1]!.score).toBe("BEN has not bid this board yet");
    expect(view.details[1]!.benReady).toBe(false);
    expect(view.scorecard!.rows[0]!.cells.every((c) => c.value === undefined)).toBe(true);
    // An unrated card is still a complete card, so the ranks stand — at 0 of 0.
    expect(view.leaderboard.map((r) => r.total)).toEqual(["—", "—"]);
  });

  it("reads a shared passout as a match", () => {
    const view = buildResultsView(
      biddingInput({
        boards: [board(1)],
        plays: [bidPlay(VIEWER, 1, null)],
        baselines: [benBidBaseline(1, null)],
      }),
    );
    expect(view.details[1]).toMatchObject({
      contract: "Passed out",
      raw: "BEN: Passed out",
      score: "Matched BEN",
    });
    expect(view.squares[0]!.score).toBe("Pass");
  });

  it("shows the contract in the viewer's own board square, tinted only on a match", () => {
    const view = buildResultsView(biddingInput());
    expect(view.squares.map((s) => [s.score, s.tone])).toEqual([
      ["4♠S", "pos"],
      ["2♥S", "neutral"],
    ]);
  });

  it("offers a replay that names the exercise it opens, not a board to play out", () => {
    // The practice copy honours the format, so the affordance says which of the
    // two it is BEFORE it is tapped — a bidding-only replay ends where the
    // scored board ended, with the auction.
    expect(buildResultsView(biddingInput()).practiceLabel).toBe(BIDDING_PRACTICE_LABEL);
    expect(BIDDING_PRACTICE_LABEL).toMatch(/Bid it again/);
    expect(buildResultsView(baseInput()).practiceLabel).toBe(PRACTICE_LABEL);
    expect(PRACTICE_LABEL).not.toBe(BIDDING_PRACTICE_LABEL);
  });

  it("keeps a half-finished player out of the standings, exactly as a scored one does", () => {
    const view = buildResultsView(
      biddingInput({
        plays: [
          bidPlay(VIEWER, 1, CONTRACT(4, "S", "S")),
          bidPlay(VIEWER, 2, CONTRACT(3, "N", "N")),
          bidPlay("u-devang", 1, CONTRACT(3, "N", "S")),
        ],
      }),
    );
    expect(view.leaderboard.map((r) => r.name)).toEqual(["You"]);
    expect(view.summaryLine).toBe("1 finished · 2 still playing · 0 invited");
  });
});

describe("an existing challenge is untouched by the new option", () => {
  it("behaves identically with no format field and with format: full", () => {
    const withoutFlag = buildResultsView(baseInput());
    const withFull = buildResultsView(
      baseInput({ challenge: challenge({ format: "full" }) }),
    );
    expect(withFull).toEqual(withoutFlag);
    expect(withoutFlag.scoringLabel).toBe("IMPs");
    expect(withoutFlag.benRow).not.toBeNull();
  });
});
