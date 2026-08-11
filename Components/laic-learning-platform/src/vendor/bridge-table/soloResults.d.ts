import { type ChallengeFormat, type ChallengeScoring, type FigureTone, type ReachedContract } from "@bridge/challenges";
import type { BoardSquare, ScorecardColumn, ScorecardRow, ScorecardCell } from "@bridge/table-ui";
/** The scorecard column key BEN's line travels under. */
export declare const BEN_KEY = "BEN";
export declare const YOU_KEY = "YOU";
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
    headline: {
        text: string;
        sub: string;
        tone: FigureTone;
    };
    columns: ScorecardColumn[];
    rows: ScorecardRow[];
    totals: ScorecardCell[];
    /** The compact board strip under the sheet. */
    squares: BoardSquare[];
    /** The board-by-board prose, keyed by board number. */
    details: Record<number, {
        headline: string;
        sub: string;
        tone: FigureTone;
    }>;
    mark: SoloChallengeMark;
}
/** How one played board stood beside BEN's, in the challenge's scoring mode. */
export declare function headToHead(mode: ChallengeScoring, yours: number, bens: number): number;
export declare function buildSoloResults(input: SoloResultsInput): SoloResultsView;
