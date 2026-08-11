import type { DrillHand } from "./openingBidHands";
/** One hand's verdict, as the drill records it. */
export interface BiddingChallengeAnswer {
    /** Position in the set the drill was given (0-based). */
    index: number;
    /** The author's own hand number. */
    no: number;
    /** What the learner called, normalised. */
    yourCall: string;
    /** What the author teaches, normalised. */
    authorCall: string;
    matched: boolean;
}
/**
 * How the drill went, in the shape the platform's challenge already reports —
 * a total, a done count, a completion flag, a numerator over `rated`, and a
 * headline. The learning platform's block turns exactly these fields into the
 * quiz-shaped progress every assessed block reports, so a drill and a challenge
 * land in one tally.
 *
 * `rated` is not decorative here even though it always equals `handsDone`:
 * every authored hand carries an answer, so unlike a challenge board waiting on
 * BEN, a drill hand can always be judged. Keeping the field means the host does
 * not need a second arithmetic for the same idea.
 */
export interface BiddingChallengeMark {
    handsTotal: number;
    handsDone: number;
    completed: boolean;
    /** Hands where the learner's call is the author's call. */
    matched: number;
    /** Hands a comparison could be made on — for this drill, every answered one. */
    rated: number;
    /** The headline figure, e.g. "3/5". */
    scoreText: string;
    /** The number behind it — the matched count. */
    scoreValue: number;
    /** `matched` as a percentage of `rated`, which is what a pass mark reads. */
    percent: number;
}
/**
 * A call as this drill compares it: "1S", "1N", "P", "X", "XX" — or, when it is
 * none of those, the trimmed uppercase input, which will simply fail to match
 * rather than being coerced into a call the writer did not make.
 */
export declare function normalizeCall(raw: string): string;
/** True when two calls are the same bid, however either one was spelled. */
export declare function callsMatch(a: string, b: string): boolean;
/** Judge one hand. The author's `bid` is the truth; nothing else is consulted. */
export declare function judgeHand(hand: DrillHand, index: number, yourCall: string): BiddingChallengeAnswer;
/** The running mark, from whatever has been answered so far. */
export declare function markAnswers(answers: readonly BiddingChallengeAnswer[], handsTotal: number): BiddingChallengeMark;
