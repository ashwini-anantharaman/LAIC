// Field scoring for challenges (spec §5) — net-new: `scoreBoard` in
// @bridge/engine gives one board's RAW duplicate score, and nothing in the
// repo turns a set of raw scores into a competitive result. This module does,
// in three modes, over ONE field definition.
//
// THE FIELD IS COMPLETED HUMANS ONLY. A participant who has not finished a
// board is simply not in that board's field; BEN is never in it — BEN is a
// reference line whose figure is computed AGAINST the human field without
// joining it (`benchmarkScore`), so a benchmark never moves a human's score.
//
// Pure functions, no IO, no dates, no randomness.

import type { ChallengeScoring } from "./types";

// ── the IMP table ───────────────────────────────────────────────────────────

export interface ImpBand {
  imps: number;
  /** Inclusive point-difference bounds (absolute value). */
  from: number;
  to: number;
}

/**
 * The standard IMP scale (Laws of Duplicate Bridge, Law 78A). The first nine
 * bands are the ones written out in the Girkar deck's `cpt-imp-scoring` prose
 * ("0–10 = 0 IMPs, 20–40 = 1, 50–80 = 2, 90–120 = 3, 130–160 = 4, 170–210 = 5,
 * 220–260 = 6, 270–310 = 7, 320–360 = 8"); "and so on up the scale" is the
 * rest of the standard table, transcribed here.
 */
export const IMP_TABLE: readonly ImpBand[] = [
  { imps: 0, from: 0, to: 10 },
  { imps: 1, from: 20, to: 40 },
  { imps: 2, from: 50, to: 80 },
  { imps: 3, from: 90, to: 120 },
  { imps: 4, from: 130, to: 160 },
  { imps: 5, from: 170, to: 210 },
  { imps: 6, from: 220, to: 260 },
  { imps: 7, from: 270, to: 310 },
  { imps: 8, from: 320, to: 360 },
  { imps: 9, from: 370, to: 420 },
  { imps: 10, from: 430, to: 490 },
  { imps: 11, from: 500, to: 590 },
  { imps: 12, from: 600, to: 740 },
  { imps: 13, from: 750, to: 890 },
  { imps: 14, from: 900, to: 1090 },
  { imps: 15, from: 1100, to: 1290 },
  { imps: 16, from: 1300, to: 1490 },
  { imps: 17, from: 1500, to: 1740 },
  { imps: 18, from: 1750, to: 1990 },
  { imps: 19, from: 2000, to: 2240 },
  { imps: 20, from: 2250, to: 2490 },
  { imps: 21, from: 2500, to: 2990 },
  { imps: 22, from: 3000, to: 3490 },
  { imps: 23, from: 3500, to: 3990 },
  { imps: 24, from: 4000, to: Number.POSITIVE_INFINITY },
];

/**
 * Signed IMPs for a point difference: `impFromDiff(+430) === 10`,
 * `impFromDiff(-430) === -10`, `impFromDiff(0) === 0`.
 *
 * The published table has gaps (nothing sits between 10 and 20) because real
 * bridge scores are multiples of 10 and so are the differences between them.
 * A value landing in a gap takes the NEXT band up — each band's `to` is read
 * as its upper boundary — so the function is total for any input.
 */
export function impFromDiff(points: number): number {
  const magnitude = Math.abs(points);
  const band = IMP_TABLE.find((b) => magnitude <= b.to) ?? IMP_TABLE[IMP_TABLE.length - 1]!;
  // A flat result has no sign: never hand back -0, which renders as "-0 IMPs".
  if (band.imps === 0) return 0;
  return points < 0 ? -band.imps : band.imps;
}

// ── one board's field ───────────────────────────────────────────────────────

/** One completed human result on a board, from the participant's side. */
export interface PlayerRawScore {
  userId: string;
  rawScore: number;
}

export interface BoardFieldScore {
  userId: string;
  rawScore: number;
  /**
   * The competitive figure in the challenge's mode — IMPs vs datum, matchpoint
   * percentage (0–100), or the raw total. ALREADY ROUNDED TO THE FIGURE THAT
   * IS DISPLAYED, so leader highlighting computed on it matches what is read
   * (ADDENDUM A5).
   */
  score: number;
  /** Matchpoints won (mp mode only) — the numerator behind `score`. */
  matchpoints?: number;
}

export interface BoardFieldScores {
  mode: ChallengeScoring;
  /** The field average, rounded to the nearest 10 (imps mode; null otherwise). */
  datum: number | null;
  /** Matchpoints available to one player, i.e. field size − 1 (mp mode only). */
  topMatchpoints: number | null;
  /** One entry per input result, in input order. */
  scores: BoardFieldScore[];
}

/** Round half away from zero to the nearest 10 — the Butler datum convention,
 *  symmetric for negative fields. Normalizes -0 away. */
function roundToTen(x: number): number {
  const v = Math.sign(x) * Math.round(Math.abs(x) / 10) * 10;
  return v === 0 ? 0 : v;
}

/** Two decimals — the display precision for matchpoint percentages. */
function round2(x: number): number {
  const v = Math.round(x * 100) / 100;
  return v === 0 ? 0 : v;
}

/**
 * Score one board against its field.
 *
 * - **imps** — Butler: the datum is the mean of the field's raw scores rounded
 *   to the nearest 10; each player scores `impFromDiff(raw − datum)`.
 * - **mp** — standard matchpointing: 1 for each field member you beat, ½ for
 *   each you tie, expressed as a percentage of the `n − 1` available. A flat
 *   board is 50% for everyone; a field of one is 50% for the same reason (no
 *   comparison can be won or lost).
 * - **total** — the raw score itself.
 *
 * `rawScores` must be the COMPLETED HUMAN plays on this board, at most one per
 * player. BEN is not passed here — see `benchmarkScore`.
 */
export function fieldScores(
  rawScores: readonly PlayerRawScore[],
  mode: ChallengeScoring,
): BoardFieldScores {
  const n = rawScores.length;

  if (mode === "total") {
    return {
      mode,
      datum: null,
      topMatchpoints: null,
      scores: rawScores.map((r) => ({ userId: r.userId, rawScore: r.rawScore, score: r.rawScore })),
    };
  }

  if (mode === "imps") {
    const datum = n ? roundToTen(rawScores.reduce((sum, r) => sum + r.rawScore, 0) / n) : null;
    return {
      mode,
      datum,
      topMatchpoints: null,
      scores: rawScores.map((r) => ({
        userId: r.userId,
        rawScore: r.rawScore,
        score: datum === null ? 0 : impFromDiff(r.rawScore - datum),
      })),
    };
  }

  // mp
  const top = Math.max(0, n - 1);
  return {
    mode,
    datum: null,
    topMatchpoints: top,
    scores: rawScores.map((r, i) => {
      let mp = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const other = rawScores[j]!.rawScore;
        if (r.rawScore > other) mp += 1;
        else if (r.rawScore === other) mp += 0.5;
      }
      return {
        userId: r.userId,
        rawScore: r.rawScore,
        // A field of one has nothing to compare against — 50%, the same figure
        // a flat board of any size produces.
        score: top === 0 ? 50 : round2((mp / top) * 100),
        matchpoints: mp,
      };
    }),
  };
}

/**
 * BEN's figure on a board, computed against the human field WITHOUT joining
 * it: no human's score changes. IMPs are measured off the human datum;
 * matchpoints are BEN's share of `n` comparisons (BEN faces the whole field,
 * and unlike a field member it never compares with itself).
 */
export function benchmarkScore(field: BoardFieldScores, benRawScore: number): number {
  if (field.mode === "total") return benRawScore;
  if (field.mode === "imps") {
    return field.datum === null ? 0 : impFromDiff(benRawScore - field.datum);
  }
  const n = field.scores.length;
  if (n === 0) return 50;
  let mp = 0;
  for (const s of field.scores) {
    if (benRawScore > s.rawScore) mp += 1;
    else if (benRawScore === s.rawScore) mp += 0.5;
  }
  return round2((mp / n) * 100);
}

/**
 * The userIds holding the best DISPLAYED figure on a board — all of them when
 * tied (ADDENDUM A5: "the leader is the best score on that board; ties all
 * highlight; the highlight is computed on the displayed figure").
 */
export function boardLeaders(field: BoardFieldScores): string[] {
  if (!field.scores.length) return [];
  const best = Math.max(...field.scores.map((s) => s.score));
  return field.scores.filter((s) => s.score === best).map((s) => s.userId);
}

// ── challenge totals & ranking ──────────────────────────────────────────────

/**
 * How per-board figures combine into a challenge total: IMPs and total points
 * SUM; matchpoint percentages AVERAGE (the session percentage). Averaging the
 * already-rounded board figures keeps the total consistent with the grid.
 */
export function combineBoardScores(mode: ChallengeScoring, scores: readonly number[]): number {
  if (!scores.length) return 0;
  const sum = scores.reduce((a, b) => a + b, 0);
  return mode === "mp" ? round2(sum / scores.length) : sum;
}

export interface PlayerTotal {
  userId: string;
  total: number;
  /** How many of the challenge's boards this player has a scored result on. */
  boardsScored: number;
}

export interface StandingRow extends PlayerTotal {
  /**
   * Competition ranking: ties SHARE a rank and consume the places below it
   * (two players tied first are both #1, the next is #3).
   */
  rank: number;
}

/**
 * Rank rows by total, highest first, ties sharing a rank. Ordering inside a tie
 * is by userId so the list is deterministic across renders.
 */
export function rankStandings(rows: readonly PlayerTotal[]): StandingRow[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.userId.localeCompare(b.userId));
  const out: StandingRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    const previous = out[i - 1];
    const shares = previous !== undefined && sorted[i - 1]!.total === row.total;
    out.push({ ...row, rank: shares ? previous.rank : i + 1 });
  }
  return out;
}

// ── the whole challenge ─────────────────────────────────────────────────────

/** One board's completed human results, plus BEN's raw score when known. */
export interface BoardRawScores {
  boardNo: number;
  scores: readonly PlayerRawScore[];
  /** The full-BEN baseline's raw score, if it has been computed. */
  benRawScore?: number;
}

export interface ChallengeScoresInput {
  mode: ChallengeScoring;
  /** Every board of the challenge, whether or not anyone has finished it. */
  boards: readonly BoardRawScores[];
}

export interface ChallengeBoardScores {
  boardNo: number;
  field: BoardFieldScores;
  /** BEN's unranked benchmark figure, or null when no BEN score was supplied. */
  benchmark: number | null;
  /** userIds tied for the best displayed figure on this board. */
  leaders: string[];
}

export interface ChallengeScores {
  mode: ChallengeScoring;
  boards: ChallengeBoardScores[];
  /** Everyone with at least one scored board, ordered by total. */
  totals: PlayerTotal[];
  /**
   * The leaderboard: FINAL RANKS ONLY (spec §2) — only players who have a
   * scored result on every board appear. Everyone else is a "still playing"
   * count on the surface, not a row here.
   */
  standings: StandingRow[];
  /** BEN's combined benchmark over the boards it has a figure on; null if none. */
  benTotal: number | null;
}

/**
 * Score a whole challenge: every board against its own field, then totals and
 * the final-ranks-only leaderboard.
 */
export function challengeScores(input: ChallengeScoresInput): ChallengeScores {
  const { mode } = input;
  const boards: ChallengeBoardScores[] = input.boards.map((b) => {
    const field = fieldScores(b.scores, mode);
    return {
      boardNo: b.boardNo,
      field,
      benchmark: b.benRawScore === undefined ? null : benchmarkScore(field, b.benRawScore),
      leaders: boardLeaders(field),
    };
  });

  const byPlayer = new Map<string, number[]>();
  for (const board of boards) {
    for (const s of board.field.scores) {
      const list = byPlayer.get(s.userId);
      if (list) list.push(s.score);
      else byPlayer.set(s.userId, [s.score]);
    }
  }

  const totals: PlayerTotal[] = [...byPlayer.entries()]
    .map(([userId, scores]) => ({
      userId,
      total: combineBoardScores(mode, scores),
      boardsScored: scores.length,
    }))
    .sort((a, b) => b.total - a.total || a.userId.localeCompare(b.userId));

  const boardCount = input.boards.length;
  const standings = rankStandings(totals.filter((t) => t.boardsScored === boardCount));

  const benFigures = boards
    .map((b) => b.benchmark)
    .filter((v): v is number => v !== null);
  const benTotal = benFigures.length ? combineBoardScores(mode, benFigures) : null;

  return { mode, boards, totals, standings, benTotal };
}
