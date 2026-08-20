// The results view model — everything the results surface renders, derived in
// ONE pure pass from the stored records (spec §6 "Challenge page", ADDENDUM A5).
//
// Nothing here touches React, the store or a request. The page reads the six
// record kinds, hands them over, and gets back plain props for <Leaderboard>,
// <Scorecard> and <BoardSquares> — which is why this file is unit-tested and
// the client component is a renderer with no arithmetic in it.
//
// Two rules the whole file bends around:
//
//  1. THE FIELD IS COMPLETED HUMANS ONLY (A3). Standings come from
//     `challengeScores().standings`, which keeps only players with a scored
//     result on EVERY board — final ranks only. BEN never joins the field; it
//     is the unranked benchmark footer and a scorecard column.
//
//  2. THE LEADER IS COMPUTED ON THE DISPLAYED FIGURE (A5). So every cell
//     carries `value` = the number that was actually printed (matchpoints are
//     rounded to the integer the cell shows), never the unrounded score.
//
// A BIDDING-ONLY challenge (owner, 2026-08-10) obeys both, but its figure is
// not a score: the board ends with the auction, so a cell holds the CONTRACT
// reached and the standings hold "matched BEN's contract on N of M boards".
// Rule 1 still decides who is ranked (a complete card, every board); rule 2
// still decides what is tinted (a match, and only a match). The two paths meet
// in `assemble` and share every part of the surface that is not a figure.

import {
  biddingScores,
  cellValue,
  challengeScores,
  contractCell,
  contractPhrase,
  formatCell,
  formatTotal,
  challengeFormat,
  isBiddingOnly,
  scoringName,
  scoringShort,
  scoringUnit,
  toneFor,
  verdictLabel,
  verdictTone,
} from "@bridge/challenges";
// The FORMATTERS now live in @bridge/challenges (src/format.ts) so the
// embedded solo player prints the same fact the same way. Re-exported here
// because this module is where the app — and this file's own unit test — have
// always reached for them.
export {
  cellValue,
  contractCell,
  contractPhrase,
  formatCell,
  formatTotal,
  scoringName,
  scoringShort,
  scoringUnit,
  toneFor,
  verdictLabel,
  verdictTone,
};
import type {
  BiddingBoardResult,
  BiddingScores,
  Challenge,
  ChallengeBaseline,
  ChallengeBoard,
  ChallengeInvite,
  ChallengePlay,
  ContractVerdict,
  ReachedContract,
} from "@bridge/challenges";
import type {
  BoardSquare,
  ChallengeTone,
  LeaderboardBenchRow,
  LeaderboardMark,
  LeaderboardRow,
  ScorecardCell,
  ScorecardColumn,
  ScorecardRow,
} from "@bridge/table-ui";
import type { Seat, Vul } from "@bridge/events";

/** Glyphs as escapes, so nothing invisible is ever smuggled in by a paste. */
const MIDDOT = "\u00B7";
const EDITOR = "\u25C6"; // the teal "set the boards" diamond
const EMDASH = "\u2014";

/** The scorecard column key BEN's benchmark line travels under. */
export const BEN_KEY = "BEN";

// ── formatting ──────────────────────────────────────────────────────────────
// The figure and contract formatters live in @bridge/challenges and are
// re-exported at the top of this file. Only the ones that are about a FIELD of
// named players stay here — a solo board has neither.

/**
 * The 2-letter code a scorecard column head carries (the viewer reads "You").
 * Two names give their initials; one name gives its first two letters, so a
 * mononym never shrinks to a single ambiguous letter.
 */
export function shortCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const code =
    words.length >= 2
      ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
      : (words[0] ?? name).slice(0, 2);
  return (code || name.slice(0, 2)).toUpperCase();
}

const VUL_LABEL: Record<Vul, string> = {
  none: "None vul",
  ns: "N-S vul",
  ew: "E-W vul",
  both: "Both vul",
};

const SEAT_LABEL: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };

// ── the view model ──────────────────────────────────────────────────────────

/** One done board of the viewer's own, opened from the Boards tab. */
export interface BoardDetail {
  boardNo: number;
  /** "4S +1" from the frozen snapshot, or an em-dash when it carries no label. */
  contract: string;
  /** "Dealer N . Both vul . you sat South". */
  sub: string;
  /** The duplicate raw score from the viewer's side, signed. */
  raw: string;
  rawTone: ChallengeTone;
  /** "IMPs vs datum" / "Matchpoints" / "Total points". */
  unit: string;
  /** The challenge figure for this board, formatted for a headline. */
  score: string;
  scoreTone: ChallengeTone;
  /** Whether a full-BEN reference line exists to compare against. */
  benReady: boolean;
}

export interface ScorecardView {
  columns: ScorecardColumn[];
  rows: ScorecardRow[];
  totals: ScorecardCell[];
}

/**
 * THE REPLAY AFFORDANCE NAMES ITS EXERCISE (owner, 2026-08-10). A practice copy
 * honours the challenge's format, so on a bidding-only challenge it ends where
 * the scored board ended — with the auction. The button says which of the two
 * it opens BEFORE it is tapped, rather than letting the learner discover it at
 * the felt.
 */
export const PRACTICE_LABEL = "Replay for practice (unscored)";
export const BIDDING_PRACTICE_LABEL = "Bid it again for practice (unscored)";

export interface ResultsView {
  challengeId: string;
  /** The scorecard column key BEN travels under, for the compare links. */
  benKey: string;
  title: string;
  /** "8 boards . IMPs . by Marta <>". */
  subtitle: string;
  description: string;
  /** Standings, board-by-board and comparisons are all behind this one flag. */
  resultsUnlocked: boolean;
  viewerFinished: boolean;
  /** The rank chip on the Results tab. Null until the viewer is in the field. */
  viewerRank: number | null;
  scoringLabel: string;
  scoringUnit: string;
  /** "5 finished . 2 still playing (including you) . 2 invited". */
  summaryLine: string;
  /** Why standings are visible before the viewer finished, or null. */
  earlyNote: string | null;
  leaderboard: LeaderboardRow[];
  benRow: LeaderboardBenchRow | null;
  /** Null when nobody has finished — there is no grid to disclose. */
  scorecard: ScorecardView | null;
  boardsCaption: string;
  squares: BoardSquare[];
  /** Keyed by board number; only the viewer's own done boards, once unlocked. */
  details: Record<number, BoardDetail>;
  /** What the unscored replay button says — see `PRACTICE_LABEL`. */
  practiceLabel: string;
  progress: { done: number; total: number; pct: number };
}

export interface ResultsViewInput {
  challenge: Challenge;
  boards: readonly ChallengeBoard[];
  /** Every play on the challenge, every participant, any status. */
  plays: readonly ChallengePlay[];
  invites: readonly ChallengeInvite[];
  baselines: readonly ChallengeBaseline[];
  viewerId: string;
  viewerFinished: boolean;
  viewerIsModerator: boolean;
  resultsUnlocked: boolean;
  /** userId -> display name. The viewer's own rows always read "You". */
  names: Readonly<Record<string, string>>;
}


/**
 * The results surface for one challenge.
 *
 * TWO PATHS, ONE SHELL. A `full` challenge is scored against a field of
 * completed humans (IMPs vs datum / matchpoints / total points); a
 * `bidding-only` challenge has no field at all — its board ends with the
 * auction, and the result is the contract reached beside the contract BEN
 * reached on the same deal. Everything they share — the roster line, the
 * header, the viewer's own progress, the marks — is computed once below; only
 * the FIGURES differ, and each path builds its own.
 */
export function buildResultsView(input: ResultsViewInput): ResultsView {
  if (challengeFormat(input.challenge) === "puzzle") return buildPuzzleResultsView(input);
  return isBiddingOnly(input.challenge)
    ? buildBiddingResultsView(input)
    : buildFieldResultsView(input);
}

// ── the puzzle path ─────────────────────────────────────────────────────────
// A puzzle board has exactly one figure: SOLVED or not, graded at the freeze
// (ChallengePlay.puzzleSolved). No field maths, no datum, no BEN yardstick —
// the standing is how many of the set you solved.

export const PUZZLE_UNIT = "Puzzles solved";
export const PUZZLE_LABEL = "solved";

function buildPuzzleResultsView(input: ResultsViewInput): ResultsView {
  const { viewerId, resultsUnlocked } = input;
  const common = commonParts(input);
  const { boards, nameOf, marksFor, myPlays, nextBoardNo } = common;

  const completed = input.plays.filter((p) => p.status === "completed");
  /** boardNo -> userId -> solved. Absent = not attempted or not graded. */
  const solvedByBoard = new Map<number, Map<string, boolean>>();
  for (const p of completed) {
    if (!solvedByBoard.has(p.boardNo)) solvedByBoard.set(p.boardNo, new Map());
    solvedByBoard.get(p.boardNo)!.set(p.userId, p.puzzleSolved === true);
  }

  const players = [...new Set(completed.map((p) => p.userId))];
  const tally = (userId: string) => {
    let solved = 0;
    let attempted = 0;
    for (const p of completed)
      if (p.userId === userId) {
        attempted++;
        if (p.puzzleSolved === true) solved++;
      }
    return { solved, attempted };
  };

  const ranked = players
    .map((userId) => ({ userId, ...tally(userId) }))
    .sort((a, b) => b.solved - a.solved || b.attempted - a.attempted);
  let rank = 0;
  let lastSolved = -1;
  const standings = ranked.map((r, i) => {
    if (r.solved !== lastSolved) {
      rank = i + 1;
      lastSolved = r.solved;
    }
    return { ...r, rank };
  });

  const leaderboard: LeaderboardRow[] = standings.map((s) => ({
    rank: s.rank,
    name: nameOf(s.userId),
    total: `${s.solved}/${boards.length}`,
    value: s.solved,
    tone: s.solved === boards.length && boards.length > 0 ? "pos" : "neutral",
    marks: marksFor(s.userId),
    isYou: s.userId === viewerId,
  }));

  const cellText = (solved: boolean | undefined) =>
    solved === undefined ? "" : solved ? "✓" : "✗";
  const scorecard: ScorecardView | null = players.length
    ? {
        columns: players.map<ScorecardColumn>((id) => ({
          key: id,
          label: id === viewerId ? "You" : shortCode(nameOf(id)),
          name: nameOf(id),
          isYou: id === viewerId,
        })),
        rows: boards.map<ScorecardRow>((b) => ({
          boardNo: b.boardNo,
          cells: players.map((id) => {
            const solved = solvedByBoard.get(b.boardNo)?.get(id);
            return {
              text: cellText(solved),
              ...(solved ? { value: 1 } : {}),
              tone: solved === undefined ? "neutral" : solved ? "pos" : "neg",
            };
          }),
        })),
        totals: players.map<ScorecardCell>((id) => {
          const t = tally(id);
          return {
            text: `${t.solved}/${boards.length}`,
            tone: t.solved === boards.length && boards.length > 0 ? "pos" : "neutral",
          };
        }),
      }
    : null;

  const squares: BoardSquare[] = boards.map((b) => {
    const play = myPlays.get(b.boardNo);
    const done = play?.status === "completed";
    const solved = done ? play?.puzzleSolved === true : undefined;
    const show = done && resultsUnlocked;
    return {
      boardNo: b.boardNo,
      state: done ? "done" : b.boardNo === nextBoardNo ? "current" : "todo",
      score: show ? (solved ? "Solved" : "Not solved") : undefined,
      ...(show && solved ? { value: 1 } : {}),
      tone: show ? (solved ? "pos" : "neg") : undefined,
      disabled: !(done && resultsUnlocked),
    };
  });

  const details: Record<number, BoardDetail> = {};
  if (resultsUnlocked) {
    for (const b of boards) {
      const play = myPlays.get(b.boardNo);
      if (!play || play.status !== "completed") continue;
      const solved = play.puzzleSolved === true;
      details[b.boardNo] = {
        boardNo: b.boardNo,
        contract: play.snapshot?.contractLabel ?? (solved ? "Solved" : "Not solved"),
        sub: `Dealer ${b.dealer} ${MIDDOT} ${VUL_LABEL[b.vul]} ${MIDDOT} you sat ${SEAT_LABEL[b.humanSeat]}`,
        // The authored ANSWER, in the slot the field path keeps for figures —
        // exactly what a puzzle's detail should say.
        raw: b.puzzle?.explanation ?? "",
        rawTone: "neutral",
        unit: PUZZLE_UNIT,
        score: solved ? "Solved" : "Not solved",
        scoreTone: solved ? "pos" : "neg",
        benReady: true,
      };
    }
  }

  return assemble(input, common, {
    scoringUnit: PUZZLE_UNIT,
    scoringLabel: PUZZLE_LABEL,
    unitName: "puzzles",
    leaderboard,
    benRow: null,
    scorecard,
    viewerRank: standings.find((s) => s.userId === viewerId)?.rank ?? null,
    finishedIds: new Set(
      players.filter((id) => completed.filter((p) => p.userId === id).length >= boards.length),
    ),
    squares,
    details,
    practiceLabel: "Replay for practice (unscored)",
  });
}

// ── the parts both paths share ──────────────────────────────────────────────

interface CommonParts {
  boards: ChallengeBoard[];
  total: number;
  nameOf: (userId: string) => string;
  marksFor: (userId: string) => LeaderboardMark[];
  /** The viewer's own plays, by board number. */
  myPlays: Map<number, ChallengePlay>;
  doneCount: number;
  nextBoardNo: number | null;
}

function commonParts(input: ResultsViewInput): CommonParts {
  const { challenge, invites, viewerId } = input;
  const boards = [...input.boards].sort((a, b) => a.boardNo - b.boardNo);

  const nameOf = (userId: string): string =>
    userId === viewerId ? "You" : (input.names[userId] ?? userId);

  const editorId = challenge.editorBadge ? challenge.createdBy : null;
  const moderators = new Set(invites.filter((i) => i.moderator).map((i) => i.userId));
  moderators.add(challenge.createdBy); // the creator is always a moderator (A2)
  const marksFor = (userId: string): LeaderboardMark[] => {
    const marks: LeaderboardMark[] = [];
    if (userId === editorId) marks.push("editor");
    if (moderators.has(userId)) marks.push("moderator");
    return marks;
  };

  const myPlays = new Map(
    input.plays.filter((p) => p.userId === viewerId).map((p) => [p.boardNo, p]),
  );

  return {
    boards,
    total: boards.length,
    nameOf,
    marksFor,
    myPlays,
    doneCount: [...myPlays.values()].filter((p) => p.status === "completed").length,
    nextBoardNo:
      boards.find((b) => myPlays.get(b.boardNo)?.status !== "completed")?.boardNo ?? null,
  };
}

/** Everything a path computes for itself: the figures and how they read. */
interface ResultsFigures {
  /** The unit chip over the standings. */
  scoringUnit: string;
  /** The standings column head. */
  scoringLabel: string;
  /** The word in the header subtitle. */
  unitName: string;
  leaderboard: LeaderboardRow[];
  benRow: LeaderboardBenchRow | null;
  scorecard: ScorecardView | null;
  viewerRank: number | null;
  /** The players with a complete card — the "finished" count on the roster line. */
  finishedIds: Set<string>;
  squares: BoardSquare[];
  details: Record<number, BoardDetail>;
  /** What a replay of one of THESE boards opens — see `PRACTICE_LABEL`. */
  practiceLabel: string;
}

/**
 * The shell: header, roster line, unlock note and progress, wrapped around
 * whichever set of figures the challenge's format produced.
 */
function assemble(
  input: ResultsViewInput,
  common: CommonParts,
  figures: ResultsFigures,
): ResultsView {
  const { challenge, invites, viewerId, viewerFinished, resultsUnlocked } = input;
  const { total, doneCount } = common;

  // ── the roster line ───────────────────────────────────────────────────────
  // finished = the field. still playing = accepted participants without a
  // complete card (the viewer included when they have not finished, said out
  // loud). invited = invites still pending a response.
  const roster = new Set(invites.filter((i) => i.status === "accepted").map((i) => i.userId));
  roster.add(viewerId);
  const stillPlaying = [...roster].filter((id) => !figures.finishedIds.has(id)).length;
  const invited = invites.filter((i) => i.status === "pending").length;
  const summaryLine =
    `${figures.finishedIds.size} finished ${MIDDOT} ` +
    `${stillPlaying} still playing${viewerFinished ? "" : " (including you)"} ${MIDDOT} ` +
    `${invited} invited`;

  const earlyNote =
    resultsUnlocked && !viewerFinished
      ? input.viewerIsModerator
        ? "You are a moderator, so you see the standings before you finish. Your own row will be marked MOD once you are in it."
        : `This challenge shows standings to everyone from the start. You are not ranked until you finish all ${total} boards.`
      : null;

  const boardsCaption = viewerFinished
    ? `All ${total} boards played ${MIDDOT} tap one to review it.`
    : resultsUnlocked
      ? `${doneCount} of ${total} played ${MIDDOT} tap a played board to review it.`
      : `${doneCount} of ${total} played ${MIDDOT} scores appear when you finish.`;

  const creatorName =
    challenge.createdBy === viewerId
      ? "you"
      : ((input.names[challenge.createdBy] ?? challenge.createdByName ?? challenge.createdBy).split(
          /\s+/,
        )[0] ?? challenge.createdBy);
  const subtitle =
    `${total} board${total === 1 ? "" : "s"} ${MIDDOT} ${figures.unitName} ${MIDDOT} ` +
    `by ${creatorName}${challenge.editorBadge ? ` ${EDITOR}` : ""}`;

  return {
    challengeId: challenge.challengeId,
    benKey: BEN_KEY,
    title: challenge.title,
    subtitle,
    description: challenge.description ?? "",
    resultsUnlocked,
    viewerFinished,
    viewerRank: figures.viewerRank,
    scoringLabel: figures.scoringLabel,
    scoringUnit: figures.scoringUnit,
    summaryLine,
    earlyNote,
    leaderboard: figures.leaderboard,
    benRow: figures.benRow,
    scorecard: figures.scorecard,
    boardsCaption,
    squares: figures.squares,
    details: figures.details,
    practiceLabel: figures.practiceLabel,
    progress: {
      done: doneCount,
      total,
      pct: total ? Math.round((doneCount / total) * 100) : 0,
    },
  };
}

// ── path 1: a board scored against the field (the v1 challenge) ─────────────

function buildFieldResultsView(input: ResultsViewInput): ResultsView {
  const { challenge, viewerId, resultsUnlocked } = input;
  const mode = challenge.scoring;
  const common = commonParts(input);
  const { boards, nameOf, marksFor, myPlays, nextBoardNo } = common;

  // Only completed plays carrying a raw score are in a field; an in-progress
  // board contributes nothing to anyone's datum.
  const completed = input.plays.filter(
    (p) => p.status === "completed" && typeof p.rawScore === "number",
  );
  const benRawByBoard = new Map<number, number>();
  for (const b of input.baselines) {
    if (b.kind === "full_ben" && b.status === "ready" && typeof b.rawScore === "number") {
      benRawByBoard.set(b.boardNo, b.rawScore);
    }
  }

  const scores = challengeScores({
    mode,
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      scores: completed
        .filter((p) => p.boardNo === b.boardNo)
        .map((p) => ({ userId: p.userId, rawScore: p.rawScore as number })),
      benRawScore: benRawByBoard.get(b.boardNo),
    })),
  });

  /** boardNo -> userId -> that board's figure in the challenge's mode. */
  const figureByBoard = new Map<number, Map<string, number>>();
  for (const board of scores.boards) {
    figureByBoard.set(board.boardNo, new Map(board.field.scores.map((s) => [s.userId, s.score])));
  }
  const benFigureByBoard = new Map<number, number>();
  for (const board of scores.boards) {
    if (board.benchmark !== null) benFigureByBoard.set(board.boardNo, board.benchmark);
  }

  // ── standings ─────────────────────────────────────────────────────────────
  // Final ranks only: `standings` already holds just the players with a scored
  // result on every board. Ties share a rank.
  const leaderboard: LeaderboardRow[] = scores.standings.map((s) => ({
    rank: s.rank,
    name: nameOf(s.userId),
    total: formatTotal(mode, s.total),
    value: s.total,
    tone: toneFor(mode, s.total),
    marks: marksFor(s.userId),
    isYou: s.userId === viewerId,
  }));

  // BEN is measured AGAINST the field, so with no field there is nothing to
  // benchmark: an empty leaderboard shows no benchmark footer either.
  const benRow: LeaderboardBenchRow | null =
    scores.benTotal === null || scores.standings.length === 0
      ? null
      : { total: formatTotal(mode, scores.benTotal) };

  // ── the board-by-board grid ───────────────────────────────────────────────
  // Columns are the field in rank order plus BEN. A player who has not
  // finished has no column, for the same reason they have no rank.
  const fieldIds = scores.standings.map((s) => s.userId);
  const totalByUser = new Map(scores.totals.map((t) => [t.userId, t.total]));

  const cellFor = (value: number | undefined): ScorecardCell =>
    value === undefined
      ? { text: "" }
      : { text: formatCell(mode, value), value: cellValue(value), tone: toneFor(mode, value) };

  const scorecard: ScorecardView | null = fieldIds.length
    ? {
        columns: [
          ...fieldIds.map<ScorecardColumn>((id) => ({
            key: id,
            label: id === viewerId ? "You" : shortCode(nameOf(id)),
            name: nameOf(id),
            isYou: id === viewerId,
          })),
          { key: BEN_KEY, label: "BEN", name: "BEN", isBenchmark: true },
        ],
        rows: boards.map<ScorecardRow>((b) => {
          const byUser = figureByBoard.get(b.boardNo);
          return {
            boardNo: b.boardNo,
            cells: [
              ...fieldIds.map((id) => cellFor(byUser?.get(id))),
              cellFor(benFigureByBoard.get(b.boardNo)),
            ],
          };
        }),
        totals: [
          ...fieldIds.map((id) => {
            const t = totalByUser.get(id);
            return t === undefined
              ? { text: "" }
              : { text: formatTotal(mode, t), value: t, tone: toneFor(mode, t) };
          }),
          scores.benTotal === null
            ? { text: "" }
            : { text: formatTotal(mode, scores.benTotal), value: scores.benTotal },
        ],
      }
    : null;

  // ── the viewer's own boards ───────────────────────────────────────────────
  const squares: BoardSquare[] = boards.map((b) => {
    const play = myPlays.get(b.boardNo);
    const done = play?.status === "completed";
    const figure = figureByBoard.get(b.boardNo)?.get(viewerId);
    const showScore = done && resultsUnlocked && figure !== undefined;
    return {
      boardNo: b.boardNo,
      state: done ? "done" : b.boardNo === nextBoardNo ? "current" : "todo",
      score: showScore ? formatCell(mode, figure) : undefined,
      value: showScore ? cellValue(figure) : undefined,
      tone: showScore ? toneFor(mode, figure) : undefined,
      // Only a done board with a visible result opens a detail; everything
      // else is a diagram here, because play starts from the list (A1).
      disabled: !(done && resultsUnlocked),
    };
  });

  const details: Record<number, BoardDetail> = {};
  if (resultsUnlocked) {
    for (const b of boards) {
      const play = myPlays.get(b.boardNo);
      if (!play || play.status !== "completed") continue;
      const figure = figureByBoard.get(b.boardNo)?.get(viewerId);
      const raw = play.rawScore ?? 0;
      const contract = [play.snapshot?.contractLabel, play.snapshot?.resultLabel]
        .filter(Boolean)
        .join(" ");
      details[b.boardNo] = {
        boardNo: b.boardNo,
        contract: contract || EMDASH,
        sub: `Dealer ${b.dealer} ${MIDDOT} ${VUL_LABEL[b.vul]} ${MIDDOT} you sat ${SEAT_LABEL[b.humanSeat]}`,
        raw: `${raw >= 0 ? "+" : ""}${raw} (your side)`,
        rawTone: raw > 0 ? "pos" : raw < 0 ? "neg" : "neutral",
        unit: mode === "mp" ? "Matchpoints" : mode === "total" ? "Total points" : "IMPs vs datum",
        score:
          figure === undefined
            ? EMDASH
            : mode === "mp"
              ? `${Math.round(figure)}%`
              : formatCell(mode, figure),
        scoreTone: figure === undefined ? "neutral" : toneFor(mode, figure),
        benReady: benRawByBoard.has(b.boardNo),
      };
    }
  }

  return assemble(input, common, {
    scoringUnit: scoringUnit(mode),
    scoringLabel: scoringShort(mode),
    unitName: scoringName(mode),
    leaderboard,
    benRow,
    scorecard,
    viewerRank: scores.standings.find((s) => s.userId === viewerId)?.rank ?? null,
    finishedIds: new Set(scores.standings.map((s) => s.userId)),
    squares,
    details,
    practiceLabel: PRACTICE_LABEL,
  });
}

// ── path 2: a board that ends with the auction ──────────────────────────────

/** The chip, the column head and the header word for a bidding-only challenge. */
export const BIDDING_UNIT = "Contract vs BEN";
export const BIDDING_LABEL = "vs BEN";
export const BIDDING_NAME = "Bidding only";

function buildBiddingResultsView(input: ResultsViewInput): ResultsView {
  const { viewerId, resultsUnlocked } = input;
  const common = commonParts(input);
  const { boards, nameOf, marksFor, myPlays, nextBoardNo } = common;

  // BEN's own auction on each deal, from the full-BEN reference line. A
  // bidding-only baseline stops at the end of the auction, so it carries a
  // contract but no raw score — `undefined` means "no reference yet" and
  // `null` means "BEN passed it out", which is a result, not a gap.
  const benContractByBoard = new Map<number, ReachedContract>();
  for (const b of input.baselines) {
    if (b.kind !== "full_ben" || b.status !== "ready" || !b.snapshot) continue;
    if (b.snapshot.contract === undefined) continue;
    benContractByBoard.set(b.boardNo, b.snapshot.contract);
  }

  // A completed attempt is one that carries a frozen line. There is no raw
  // score to filter on here — that is precisely what this format does not have.
  const completed = input.plays.filter((p) => p.status === "completed" && p.snapshot);
  // Every bidding-only freeze writes `contract` (null when the board was passed
  // out), because that IS the result it records — so the fallback here is only
  // ever exercised by a record that could not exist in this format.
  const contractOf = (play: ChallengePlay): ReachedContract => play.snapshot?.contract ?? null;

  const scores: BiddingScores = biddingScores({
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      contracts: completed
        .filter((p) => p.boardNo === b.boardNo)
        .map((p) => ({ userId: p.userId, contract: contractOf(p) })),
      // `has` first: a stored `null` is a real answer and must not be read as
      // an absent one.
      ...(benContractByBoard.has(b.boardNo)
        ? { benContract: benContractByBoard.get(b.boardNo) as ReachedContract }
        : {}),
    })),
  });

  /** boardNo -> userId -> how that auction stood beside BEN's. */
  const resultByBoard = new Map<number, Map<string, BiddingBoardResult>>();
  for (const board of scores.boards) {
    resultByBoard.set(board.boardNo, new Map(board.results.map((r) => [r.userId, r])));
  }
  const talliesByUser = new Map(scores.totals.map((t) => [t.userId, t]));

  /** "3/5" — matched on 3 of the 5 boards BEN has bid. Never a bare number. */
  const tallyText = (userId: string): string => {
    const t = talliesByUser.get(userId);
    if (!t || t.rated === 0) return EMDASH;
    return `${t.matched}/${t.rated}`;
  };
  /** Tinted only when every rated board matched. There is no negative tone. */
  const tallyTone = (userId: string): ChallengeTone => {
    const t = talliesByUser.get(userId);
    return t && t.rated > 0 && t.matched === t.rated ? "pos" : "neutral";
  };

  const leaderboard: LeaderboardRow[] = scores.standings.map((s) => ({
    rank: s.rank,
    name: nameOf(s.userId),
    total: tallyText(s.userId),
    value: s.total,
    tone: tallyTone(s.userId),
    marks: marksFor(s.userId),
    isYou: s.userId === viewerId,
  }));

  // NO BENCHMARK FOOTER. Every figure on this surface is already measured
  // against BEN, so a BEN row would read "BEN matched itself on every board".
  // BEN is the yardstick here, not a rival.
  const benRow: LeaderboardBenchRow | null = null;

  const fieldIds = scores.standings.map((s) => s.userId);

  /**
   * One grid cell. `value` is set ONLY on a match, so `leaderFlags` tints the
   * players who found BEN's contract and tints nobody when nobody did — a
   * contract's text ("4♠S", "Pass") parses to NaN, which is exactly the "no
   * readable figure" the leader math already handles.
   */
  const cellFor = (result: BiddingBoardResult | undefined): ScorecardCell => {
    if (!result) return { text: "" };
    return {
      text: contractCell(result.contract),
      ...(result.verdict === "matched" ? { value: 1 } : {}),
      tone: verdictTone(result.verdict),
    };
  };

  const scorecard: ScorecardView | null = fieldIds.length
    ? {
        columns: [
          ...fieldIds.map<ScorecardColumn>((id) => ({
            key: id,
            label: id === viewerId ? "You" : shortCode(nameOf(id)),
            name: nameOf(id),
            isYou: id === viewerId,
          })),
          { key: BEN_KEY, label: "BEN", name: "BEN", isBenchmark: true },
        ],
        rows: boards.map<ScorecardRow>((b) => {
          const byUser = resultByBoard.get(b.boardNo);
          const ben = benContractByBoard.has(b.boardNo)
            ? (benContractByBoard.get(b.boardNo) as ReachedContract)
            : undefined;
          return {
            boardNo: b.boardNo,
            cells: [
              ...fieldIds.map((id) => cellFor(byUser?.get(id))),
              // BEN's own cell carries no value: it is the line every other
              // cell is measured against, so it is never itself a leader.
              { text: contractCell(ben) },
            ],
          };
        }),
        totals: [
          ...fieldIds.map<ScorecardCell>((id) => ({
            text: tallyText(id),
            tone: tallyTone(id),
          })),
          { text: "" },
        ],
      }
    : null;

  const squares: BoardSquare[] = boards.map((b) => {
    const play = myPlays.get(b.boardNo);
    const done = play?.status === "completed";
    const mine = resultByBoard.get(b.boardNo)?.get(viewerId);
    const show = done && resultsUnlocked && mine !== undefined;
    return {
      boardNo: b.boardNo,
      state: done ? "done" : b.boardNo === nextBoardNo ? "current" : "todo",
      score: show ? contractCell(mine.contract) : undefined,
      ...(show && mine.verdict === "matched" ? { value: 1 } : {}),
      tone: show ? verdictTone(mine.verdict) : undefined,
      disabled: !(done && resultsUnlocked),
    };
  });

  const details: Record<number, BoardDetail> = {};
  if (resultsUnlocked) {
    for (const b of boards) {
      const play = myPlays.get(b.boardNo);
      if (!play || play.status !== "completed") continue;
      const mine = resultByBoard.get(b.boardNo)?.get(viewerId);
      const benKnown = benContractByBoard.has(b.boardNo);
      const ben = benKnown ? (benContractByBoard.get(b.boardNo) as ReachedContract) : undefined;
      const verdict: ContractVerdict = mine?.verdict ?? "unrated";
      details[b.boardNo] = {
        boardNo: b.boardNo,
        // The learner's contract, printed the way the table printed it.
        contract: play.snapshot?.contractLabel ?? contractPhrase(contractOf(play)),
        sub: `Dealer ${b.dealer} ${MIDDOT} ${VUL_LABEL[b.vul]} ${MIDDOT} you sat ${SEAT_LABEL[b.humanSeat]}`,
        // THE COMPARISON, in the slot a raw score occupies on a scored board:
        // your contract, and next to it BEN's on the same deal.
        raw: benKnown ? `BEN: ${contractPhrase(ben)}` : "BEN has not bid it yet",
        rawTone: "neutral",
        unit: BIDDING_UNIT,
        score: verdictLabel(verdict, mine?.sameDeclarer ?? false),
        scoreTone: verdictTone(verdict),
        benReady: benKnown,
      };
    }
  }

  return assemble(input, common, {
    scoringUnit: BIDDING_UNIT,
    scoringLabel: BIDDING_LABEL,
    unitName: BIDDING_NAME,
    leaderboard,
    benRow,
    scorecard,
    viewerRank: scores.standings.find((s) => s.userId === viewerId)?.rank ?? null,
    finishedIds: new Set(scores.standings.map((s) => s.userId)),
    squares,
    details,
    // A replay here ends with the auction, exactly as the scored board did.
    practiceLabel: BIDDING_PRACTICE_LABEL,
  });
}
