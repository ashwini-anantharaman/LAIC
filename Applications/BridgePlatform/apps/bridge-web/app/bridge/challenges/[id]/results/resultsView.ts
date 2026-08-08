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

import { challengeScores } from "@bridge/challenges";
import type {
  Challenge,
  ChallengeBaseline,
  ChallengeBoard,
  ChallengeInvite,
  ChallengePlay,
  ChallengeScoring,
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

/** The unit chip over the standings, e.g. "IMPs vs datum". */
export function scoringUnit(mode: ChallengeScoring): string {
  return mode === "mp" ? "Matchpoints %" : mode === "total" ? "Total points" : "IMPs vs datum";
}

/** The standings column head, e.g. "IMPs". */
export function scoringShort(mode: ChallengeScoring): string {
  return mode === "mp" ? "MP %" : mode === "total" ? "Pts" : "IMPs";
}

/** The scoring name in the header subtitle. */
export function scoringName(mode: ChallengeScoring): string {
  return mode === "mp" ? "Matchpoints" : mode === "total" ? "Total points" : "IMPs";
}

/**
 * The figure printed in a grid cell or a board square. IMPs and total points
 * are signed integers; matchpoints are a bare rounded percentage (the "%" is
 * carried by the column head — a 46px cell has no room for it).
 */
export function formatCell(mode: ChallengeScoring, value: number): string {
  const r = Math.round(value);
  if (mode === "mp") return `${r}`;
  return r > 0 ? `+${r}` : `${r}`;
}

/**
 * The number BEHIND a printed cell — what the leader highlight reads. It is
 * the rounded figure, not the raw score, so what is tinted matches what is
 * read (A5).
 */
export function cellValue(value: number): number {
  const r = Math.round(value);
  return r === 0 ? 0 : r;
}

/**
 * A challenge total. Matchpoints are a session percentage to one decimal;
 * IMPs are signed integers; total points are signed and grouped.
 */
export function formatTotal(mode: ChallengeScoring, value: number): string {
  if (mode === "mp") return `${value.toFixed(1)}%`;
  const r = Math.round(value);
  if (mode === "total") return `${r >= 0 ? "+" : ""}${r.toLocaleString("en-US")}`;
  return `${r >= 0 ? "+" : ""}${r}`;
}

/**
 * How a figure reads. Matchpoints are NOT zero-centred — 50% is flat — so the
 * tone is always passed explicitly rather than derived from the sign.
 */
export function toneFor(mode: ChallengeScoring, value: number): ChallengeTone {
  if (mode === "mp") return value >= 55 ? "pos" : value <= 45 ? "neg" : "neutral";
  return value > 0 ? "pos" : value < 0 ? "neg" : "neutral";
}

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

export function buildResultsView(input: ResultsViewInput): ResultsView {
  const { challenge, invites, viewerId, viewerFinished, resultsUnlocked } = input;
  const mode = challenge.scoring;
  const boards = [...input.boards].sort((a, b) => a.boardNo - b.boardNo);
  const total = boards.length;

  const nameOf = (userId: string): string =>
    userId === viewerId ? "You" : (input.names[userId] ?? userId);

  // ── scoring ───────────────────────────────────────────────────────────────
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
  const editorId = challenge.editorBadge ? challenge.createdBy : null;
  const moderators = new Set(invites.filter((i) => i.moderator).map((i) => i.userId));
  moderators.add(challenge.createdBy); // the creator is always a moderator (A2)

  const leaderboard: LeaderboardRow[] = scores.standings.map((s) => {
    const marks: LeaderboardMark[] = [];
    if (s.userId === editorId) marks.push("editor");
    if (moderators.has(s.userId)) marks.push("moderator");
    return {
      rank: s.rank,
      name: nameOf(s.userId),
      total: formatTotal(mode, s.total),
      value: s.total,
      tone: toneFor(mode, s.total),
      marks,
      isYou: s.userId === viewerId,
    };
  });

  // BEN is measured AGAINST the field, so with no field there is nothing to
  // benchmark: an empty leaderboard shows no benchmark footer either.
  const benRow: LeaderboardBenchRow | null =
    scores.benTotal === null || scores.standings.length === 0
      ? null
      : { total: formatTotal(mode, scores.benTotal) };

  const viewerRank = scores.standings.find((s) => s.userId === viewerId)?.rank ?? null;

  // ── the summary line ──────────────────────────────────────────────────────
  // finished = the field. still playing = accepted participants without a
  // complete card (the viewer included when they have not finished, said out
  // loud). invited = invites still pending a response.
  const finishedIds = new Set(scores.standings.map((s) => s.userId));
  const roster = new Set(
    invites.filter((i) => i.status === "accepted").map((i) => i.userId),
  );
  roster.add(viewerId);
  const stillPlaying = [...roster].filter((id) => !finishedIds.has(id)).length;
  const invited = invites.filter((i) => i.status === "pending").length;
  const summaryLine =
    `${finishedIds.size} finished ${MIDDOT} ` +
    `${stillPlaying} still playing${viewerFinished ? "" : " (including you)"} ${MIDDOT} ` +
    `${invited} invited`;

  const earlyNote =
    resultsUnlocked && !viewerFinished
      ? input.viewerIsModerator
        ? "You are a moderator, so you see the standings before you finish. Your own row will be marked MOD once you are in it."
        : `This challenge shows standings to everyone from the start. You are not ranked until you finish all ${total} boards.`
      : null;

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
  const myPlays = new Map(
    input.plays.filter((p) => p.userId === viewerId).map((p) => [p.boardNo, p]),
  );
  const doneCount = [...myPlays.values()].filter((p) => p.status === "completed").length;
  const nextBoardNo =
    boards.find((b) => myPlays.get(b.boardNo)?.status !== "completed")?.boardNo ?? null;

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

  const boardsCaption = viewerFinished
    ? `All ${total} boards played ${MIDDOT} tap one to review it.`
    : resultsUnlocked
      ? `${doneCount} of ${total} played ${MIDDOT} tap a played board to review it.`
      : `${doneCount} of ${total} played ${MIDDOT} scores appear when you finish.`;

  // ── header ────────────────────────────────────────────────────────────────
  const creatorName =
    challenge.createdBy === viewerId
      ? "you"
      : ((input.names[challenge.createdBy] ?? challenge.createdByName ?? challenge.createdBy).split(
          /\s+/,
        )[0] ?? challenge.createdBy);
  const subtitle =
    `${total} board${total === 1 ? "" : "s"} ${MIDDOT} ${scoringName(mode)} ${MIDDOT} ` +
    `by ${creatorName}${challenge.editorBadge ? ` ${EDITOR}` : ""}`;

  return {
    challengeId: challenge.challengeId,
    benKey: BEN_KEY,
    title: challenge.title,
    subtitle,
    description: challenge.description ?? "",
    resultsUnlocked,
    viewerFinished,
    viewerRank,
    scoringLabel: scoringShort(mode),
    scoringUnit: scoringUnit(mode),
    summaryLine,
    earlyNote,
    leaderboard,
    benRow,
    scorecard,
    boardsCaption,
    squares,
    details,
    progress: {
      done: doneCount,
      total,
      pct: total ? Math.round((doneCount / total) * 100) : 0,
    },
  };
}
