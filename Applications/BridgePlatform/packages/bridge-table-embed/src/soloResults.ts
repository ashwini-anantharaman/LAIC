// The SOLO results view model — what the player's results sheet renders,
// derived in one pure pass from the frozen boards.
//
// THERE IS NO FIELD. That is the whole difference from the platform's
// resultsView.ts, and it removes rather than adds: no datum (an average of one
// player is that player), no matchpointing against a field of one, no
// standings, no ranks, no benchmark-measured-against-the-field. What is left is
// the comparison that was always underneath — YOUR LINE AND BEN'S, board by
// board — so this module builds a two-column scorecard and a headline, and
// nothing else.
//
// EVERY FIGURE IS BORROWED. `impFromDiff` and `sameContractReached` are
// @bridge/challenges' own, and so is every formatter (`formatCell`,
// `contractCell`, `verdictLabel`…). This file decides WHAT to compare; it does
// not do arithmetic the platform already does.

import {
  contractCell,
  contractPhrase,
  formatCell,
  formatTotal,
  impFromDiff,
  sameContractReached,
  verdictLabel,
  verdictTone,
  type ChallengeFormat,
  type ChallengeScoring,
  type ContractVerdict,
  type FigureTone,
  type ReachedContract,
} from "@bridge/challenges";
import type { BoardSquare, ScorecardColumn, ScorecardRow, ScorecardCell } from "@bridge/table-ui";

const MIDDOT = "·";
const EMDASH = "—";

/** The scorecard column key BEN's line travels under. */
export const BEN_KEY = "BEN";
export const YOU_KEY = "YOU";

/** One line of play, frozen — the learner's, or BEN's reference on the same deal. */
export interface SoloLine {
  /** The contract reached. `null` = passed out; absent = no line yet. */
  contract?: ReachedContract;
  /** "4♠×" as the table printed it. */
  contractLabel?: string;
  /** "+1", "=", "-2" — absent on a bidding-only board, which has no play. */
  resultLabel?: string;
  /**
   * The duplicate raw score FROM THE LEARNER'S SIDE (positive = good for the
   * learner), i.e. `scoreBoard(...).nsScore` signed for the board's humanSeat —
   * the same convention `ChallengePlay.rawScore` uses, so the two are directly
   * comparable. Absent on a bidding-only board: no score is not a score of 0.
   */
  rawScore?: number;
}

/** One board of the challenge, as far as it has got. */
export interface SoloBoardOutcome {
  boardNo: number;
  /** The learner's line. Absent until the board is frozen. */
  you?: SoloLine;
  /** BEN's reference line on the same deal. Absent until it lands. */
  ben?: SoloLine;
  /** BEN was asked and could not answer — the board stays unrated, and says so. */
  benFailed?: boolean;
}

export interface SoloResultsInput {
  format: ChallengeFormat;
  scoring: ChallengeScoring;
  boardsTotal: number;
  outcomes: readonly SoloBoardOutcome[];
  /** The board open at the table behind the sheet. */
  currentBoardNo?: number;
}

/** The mark a host reports onward: completion, and how it went. */
export interface SoloChallengeMark {
  boardsTotal: number;
  boardsDone: number;
  /** True once every board carries a frozen line. */
  completed: boolean;
  /**
   * The quiz-shaped numerator: boards the learner MATCHED OR BEAT BEN on. For
   * bidding-only that is "reached BEN's contract"; for a played board it is
   * "was not behind BEN's result". Boards BEN never answered are not counted
   * either way — they are absent from `rated`, not scored as a loss.
   */
  boardsWon: number;
  /** Boards a comparison could be made on at all. */
  rated: number;
  /** The headline figure, e.g. "+7" or "3/5". */
  scoreText: string;
  /** The number behind it: summed IMPs/points, or the matched count. */
  scoreValue: number;
  /** `boardsWon` as a percentage of `rated` — what a pass mark is read against. */
  percent: number;
}

export interface SoloResultsView {
  /** The column head over the figures, e.g. "IMPs vs BEN". */
  unitLabel: string;
  /** The long form, for the sheet's subtitle. */
  unitName: string;
  /** One line: "4 boards · IMPs vs BEN". */
  subtitle: string;
  /** The headline figure and how it reads. */
  headline: { text: string; sub: string; tone: FigureTone };
  columns: ScorecardColumn[];
  rows: ScorecardRow[];
  totals: ScorecardCell[];
  /** The compact board strip under the sheet. */
  squares: BoardSquare[];
  /** The board-by-board prose, keyed by board number. */
  details: Record<number, { headline: string; sub: string; tone: FigureTone }>;
  mark: SoloChallengeMark;
}

/** How one played board stood beside BEN's, in the challenge's scoring mode. */
export function headToHead(
  mode: ChallengeScoring,
  yours: number,
  bens: number,
): number {
  if (mode === "imps") return impFromDiff(yours - bens);
  if (mode === "total") return yours - bens;
  // Matchpoints over a single comparison: the whole top for beating BEN, half
  // for tying it. This is `fieldScores`' mp rule with n = 2, written out rather
  // than run through a field builder that would have to be handed a BEN row —
  // and BEN is never in a field.
  return yours > bens ? 100 : yours === bens ? 50 : 0;
}

/** The unit chip: always "vs BEN" here, because there is nothing else to be vs. */
function unitFor(format: ChallengeFormat, mode: ChallengeScoring): { label: string; name: string } {
  if (format === "bidding-only") return { label: "vs BEN", name: "Contract vs BEN" };
  if (mode === "mp") return { label: "MP %", name: "Matchpoints vs BEN" };
  if (mode === "total") return { label: "Pts", name: "Points vs BEN" };
  return { label: "IMPs", name: "IMPs vs BEN" };
}

/** How the learner's auction stands beside BEN's — never a judgement. */
function verdictOf(you: SoloLine | undefined, ben: SoloLine | undefined): ContractVerdict {
  if (!you || !ben || ben.contract === undefined) return "unrated";
  return sameContractReached(you.contract, ben.contract) ? "matched" : "differed";
}

/**
 * One played line in prose: "1NT by N, down 2 (-100)".
 *
 * `resultLabel` is the ENGINE's full sentence and already names the contract,
 * so printing `contractLabel` beside it says the contract twice ("1NT by N 1NT
 * by N, down 2"). The label is the fallback for a line that has no result — a
 * board that ended with the auction.
 */
function playedLine(line: SoloLine | undefined): string {
  if (!line) return EMDASH;
  const said = line.resultLabel || line.contractLabel || EMDASH;
  const raw = line.rawScore;
  return typeof raw === "number" ? `${said} (${raw > 0 ? "+" : ""}${raw})` : said;
}

function sameDeclarerAs(you: SoloLine | undefined, ben: SoloLine | undefined): boolean {
  const a = you?.contract;
  const b = ben?.contract;
  if (a != null && b != null) return a.declarer === b.declarer;
  return a === null && b === null;
}

export function buildSoloResults(input: SoloResultsInput): SoloResultsView {
  const { format, scoring, boardsTotal, outcomes, currentBoardNo } = input;
  const biddingOnly = format === "bidding-only";
  const unit = unitFor(format, scoring);

  const byBoard = new Map(outcomes.map((o) => [o.boardNo, o]));
  const order = Array.from({ length: boardsTotal }, (_, i) => i + 1);

  const columns: ScorecardColumn[] = [
    { key: YOU_KEY, label: "You", name: "You", isYou: true },
    { key: BEN_KEY, label: "BEN", name: "BEN", isBenchmark: true },
  ];

  const rows: ScorecardRow[] = [];
  const squares: BoardSquare[] = [];
  const details: SoloResultsView["details"] = {};

  let boardsDone = 0;
  let rated = 0;
  let boardsWon = 0;
  const figures: number[] = [];

  for (const boardNo of order) {
    const o = byBoard.get(boardNo);
    const you = o?.you;
    const ben = o?.ben;
    const done = !!you;
    if (done) boardsDone += 1;

    let youCell: ScorecardCell = { text: "" };
    let benCell: ScorecardCell = { text: "" };
    let squareText: string | undefined;
    let squareValue: number | undefined;
    let squareTone: FigureTone | undefined;

    if (biddingOnly) {
      // THE CONTRACT IS THE RESULT. A cell holds the contract reached; only a
      // match carries a `value`, so the grid tints the boards where the two
      // auctions arrived at the same place and nothing else.
      const verdict = verdictOf(you, ben);
      if (verdict !== "unrated" && done) rated += 1;
      if (verdict === "matched") boardsWon += 1;
      youCell = done
        ? {
            text: contractCell(you?.contract),
            ...(verdict === "matched" ? { value: 1 } : {}),
            tone: verdictTone(verdict),
          }
        : { text: "" };
      benCell = { text: ben ? contractCell(ben.contract) : "" };
      if (done) {
        squareText = contractCell(you?.contract);
        if (verdict === "matched") squareValue = 1;
        squareTone = verdictTone(verdict);
        details[boardNo] = {
          headline: verdictLabel(verdict, sameDeclarerAs(you, ben)),
          sub:
            ben === undefined
              ? o?.benFailed
                ? "BEN could not bid this board"
                : "BEN is still bidding this board"
              : `You: ${contractPhrase(you?.contract)} ${MIDDOT} BEN: ${contractPhrase(ben.contract)}`,
          tone: verdictTone(verdict),
        };
      }
    } else {
      // A PLAYED BOARD. The figure is your result set against BEN's on the same
      // deal, in the mode the author chose.
      const yourRaw = you?.rawScore;
      const benRaw = ben?.rawScore;
      const comparable = typeof yourRaw === "number" && typeof benRaw === "number";
      if (comparable) {
        rated += 1;
        const figure = headToHead(scoring, yourRaw, benRaw);
        figures.push(figure);
        const par = scoring === "mp" ? 50 : 0;
        if (figure >= par) boardsWon += 1;
        youCell = {
          text: formatCell(scoring, figure),
          value: Math.round(figure),
          tone: figure > par ? "pos" : figure < par ? "neg" : "neutral",
        };
        squareText = youCell.text;
        squareValue = youCell.value;
        squareTone = youCell.tone;
      } else if (done) {
        youCell = { text: EMDASH };
        squareText = EMDASH;
        squareTone = "neutral";
      }
      // BEN's own column prints the RAW score it made, which is the fact the
      // figure was computed from. It carries no value: it is the line the
      // learner is measured against, so it is never itself a leader.
      benCell = { text: typeof benRaw === "number" ? `${benRaw > 0 ? "+" : ""}${benRaw}` : "" };
      if (done) {
        details[boardNo] = {
          headline: comparable
            ? `${formatCell(scoring, headToHead(scoring, yourRaw as number, benRaw as number))} ${unit.label}`
            : ben === undefined
              ? o?.benFailed
                ? "BEN could not play this board"
                : "BEN is still playing this board"
              : EMDASH,
          sub:
            `You: ${playedLine(you)}` +
            (typeof benRaw === "number" ? ` ${MIDDOT} BEN: ${playedLine(ben)}` : ""),
          tone: comparable ? youCell.tone ?? "neutral" : "neutral",
        };
      }
    }

    rows.push({ boardNo, cells: [youCell, benCell] });
    squares.push({
      boardNo,
      state: done ? "done" : boardNo === currentBoardNo ? "current" : "todo",
      ...(squareText === undefined ? {} : { score: squareText }),
      ...(squareValue === undefined ? {} : { value: squareValue }),
      ...(squareTone === undefined ? {} : { tone: squareTone }),
      disabled: !done,
    });
  }

  // ── the totals, and the one figure the sheet leads with ────────────────────
  const completed = boardsDone === boardsTotal && boardsTotal > 0;

  let scoreText: string;
  let scoreValue: number;
  let headlineTone: FigureTone;
  let headlineSub: string;

  if (biddingOnly) {
    scoreValue = boardsWon;
    scoreText = rated === 0 ? EMDASH : `${boardsWon}/${rated}`;
    headlineTone = rated > 0 && boardsWon === rated ? "pos" : "neutral";
    headlineSub =
      rated === 0
        ? "BEN has not bid any of these boards yet"
        : `Reached BEN's contract on ${boardsWon} of ${rated} board${rated === 1 ? "" : "s"}`;
  } else {
    // IMPs and points SUM; matchpoints AVERAGE — the platform's own
    // `combineBoardScores` rule, over a comparison of two rather than a field.
    const sum = figures.reduce((a, b) => a + b, 0);
    scoreValue = figures.length === 0 ? 0 : scoring === "mp" ? sum / figures.length : sum;
    scoreText = figures.length === 0 ? EMDASH : formatTotal(scoring, scoreValue);
    const par = scoring === "mp" ? 50 : 0;
    headlineTone =
      figures.length === 0 ? "neutral" : scoreValue > par ? "pos" : scoreValue < par ? "neg" : "neutral";
    headlineSub =
      figures.length === 0
        ? "BEN has not played any of these boards yet"
        : scoreValue > par
          ? `Ahead of BEN over ${figures.length} board${figures.length === 1 ? "" : "s"}`
          : scoreValue < par
            ? `Behind BEN over ${figures.length} board${figures.length === 1 ? "" : "s"}`
            : `Level with BEN over ${figures.length} board${figures.length === 1 ? "" : "s"}`;
  }

  const totals: ScorecardCell[] = [
    { text: scoreText, ...(headlineTone === "neutral" ? {} : { tone: headlineTone }) },
    { text: "" },
  ];

  return {
    unitLabel: unit.label,
    unitName: unit.name,
    subtitle: `${boardsTotal} board${boardsTotal === 1 ? "" : "s"} ${MIDDOT} ${unit.name}`,
    headline: { text: scoreText, sub: headlineSub, tone: headlineTone },
    columns,
    rows,
    totals,
    squares,
    details,
    mark: {
      boardsTotal,
      boardsDone,
      completed,
      boardsWon,
      rated,
      scoreText,
      scoreValue,
      percent: rated === 0 ? 0 : Math.round((boardsWon / rated) * 100),
    },
  };
}
