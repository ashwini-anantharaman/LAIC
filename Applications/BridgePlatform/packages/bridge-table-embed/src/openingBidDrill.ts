// The opening-bid drill's arithmetic, kept apart from its pixels.
//
// THE AUTHOR'S CALL IS THE ANSWER. There is no engine in this file and there is
// no network: matching a learner's call against the author's is string work on
// two calls, and that is the entire judgement the drill makes. BEN is not
// consulted here or anywhere below <BiddingChallenge/> — it bids its own system
// and would contradict the lesson the hands were written to teach.
//
// Notation is normalised on BOTH sides before comparing. The bidding pad emits
// our own "1S" / "1N" / "P", but an author supplying their own set writes bridge
// the way bridge is written — "1NT", "Pass", "Dbl" — and a drill that marked
// "1NT" wrong against "1N" would be marking its own spelling, not the bid.

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

const FULL_CALL = /^([1-7])(NT?|[CDHS])$/;

/**
 * A call as this drill compares it: "1S", "1N", "P", "X", "XX" — or, when it is
 * none of those, the trimmed uppercase input, which will simply fail to match
 * rather than being coerced into a call the writer did not make.
 */
export function normalizeCall(raw: string): string {
  const s = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (s === "P" || s === "PASS" || s === "NB" || s === "NOBID") return "P";
  if (s === "X" || s === "DBL" || s === "DOUBLE") return "X";
  if (s === "XX" || s === "RDBL" || s === "REDBL" || s === "REDOUBLE") return "XX";
  const m = FULL_CALL.exec(s);
  // "1NT" and "1N" are one bid; the four suits are already single letters.
  if (m) return `${m[1]}${m[2] === "NT" ? "N" : m[2]}`;
  return s;
}

/** True when two calls are the same bid, however either one was spelled. */
export function callsMatch(a: string, b: string): boolean {
  return normalizeCall(a) === normalizeCall(b);
}

/** Judge one hand. The author's `bid` is the truth; nothing else is consulted. */
export function judgeHand(
  hand: DrillHand,
  index: number,
  yourCall: string,
): BiddingChallengeAnswer {
  const authorCall = normalizeCall(hand.bid);
  const yours = normalizeCall(yourCall);
  return { index, no: hand.no, yourCall: yours, authorCall, matched: yours === authorCall };
}

/** The running mark, from whatever has been answered so far. */
export function markAnswers(
  answers: readonly BiddingChallengeAnswer[],
  handsTotal: number,
): BiddingChallengeMark {
  const handsDone = answers.length;
  const matched = answers.filter((a) => a.matched).length;
  return {
    handsTotal,
    handsDone,
    completed: handsTotal > 0 && handsDone >= handsTotal,
    matched,
    rated: handsDone,
    scoreText: `${matched}/${handsDone || handsTotal}`,
    scoreValue: matched,
    percent: handsDone ? Math.round((matched / handsDone) * 100) : 0,
  };
}
