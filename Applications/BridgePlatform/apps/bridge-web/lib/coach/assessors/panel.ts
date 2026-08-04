// The panel: every authority that can speak about this move, does.
//
// Replaces a chain of fallbacks where the first answer ended the search. That
// chain had two faults beyond the ordering: judging a card and asking about the
// same position consulted DIFFERENT authorities in different orders (an artifact
// of the two being written a week apart), and when the solver answered, the
// learner's own rulebook was never asked — making the most instructive case in
// bridge unreachable. Both are fixed by asking everyone.
//
// Cost is bounded by `applies` being cheap and by the budget: the solver declines
// on its own when the position is deeper than the caller can afford, so a full
// board still costs one pass over the rules per card and no search until the
// endgame.

import { reconcile, type Assessment, type EvaluationBudget } from "@laic/coach/core";

import type { AssessContext, MoveUnderReview } from "./context";
import { conventionAssessor } from "./conventions";
import { doubleDummyAssessor } from "./doubleDummy";
import { kbAuctionAssessor } from "./kbAuction";
import { kbCardPlayAssessor } from "./kbCardPlay";

/**
 * Registered in no particular order — `reconcile` ranks by authority, so the
 * array's order carries no meaning and cannot become a hidden dependency the way
 * the old fallback chain did.
 */
const ASSESSORS = [
  kbAuctionAssessor,
  kbCardPlayAssessor,
  doubleDummyAssessor,
  conventionAssessor,
];

/** Budgets, named for what the caller is doing rather than for a depth. */
export const BUDGET = {
  /**
   * Judging a whole board during a page render: this is paid once per card the
   * learner played, so it has to stay small. 60ms buys a five-card search.
   */
  review: { ms: 60 } satisfies EvaluationBudget,
  /**
   * One position, because someone pressed a button and is watching a spinner.
   * 3s buys a seven-card search — two tricks deeper than review.
   */
  asked: { ms: 3000 } satisfies EvaluationBudget,
};

/**
 * Assess one move.
 *
 * Never throws: an assessor that fails is an authority that abstained, and the
 * others still report. Failing loudly here would mean one broken source silences
 * the whole coach.
 */
export async function assessMove(
  move: MoveUnderReview,
  ctx: AssessContext,
  budget: EvaluationBudget,
): Promise<Assessment> {
  const applicable = ASSESSORS.filter((a) => a.applies(move));

  const findings = (
    await Promise.all(
      applicable.map(async (a) => {
        try {
          return await a.assess(move, ctx, budget);
        } catch (err) {
          console.error(`[coach] assessor ${a.id} failed`, err);
          return null;
        }
      }),
    )
  ).filter((f): f is NonNullable<typeof f> => f !== null);

  return reconcile(findings, { silentBecause: silence(move, applicable.length) });
}

/**
 * Why nobody spoke — so silence is always attributable.
 *
 * An unexplained empty panel is indistinguishable from a broken one, which is
 * the failure this whole surface keeps running into: a coach with nothing to say
 * and a coach that was never wired up look identical.
 */
function silence(move: MoveUnderReview, applicable: number): string {
  if (!applicable) {
    return move.action.kind === "card" && !move.before.contract
      ? "no contract yet — there is no card play to judge"
      : "no authority covers this kind of move";
  }
  // Learner-facing, so it names the RULEBOOK first — the calculator is the
  // auditor, not the primary adviser, and leading with "too deep for the search"
  // put the demoted authority in front. It also has to read as an answer to
  // "what should I play?", because that is where it appears.
  return move.action.kind === "call"
    ? "no agreement in this system covers this position"
    : "your system has no agreement for this card, and the hand is too deep to work out exactly";
}

export type { AssessContext, BridgeFinding, MoveUnderReview } from "./context";
export { searchDepthFor } from "./context";
