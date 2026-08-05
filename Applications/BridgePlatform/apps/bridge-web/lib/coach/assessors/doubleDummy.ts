// Authority: a solved position. The auditor.
//
// THE ONLY ASSESSOR THAT LOOKS AT HIDDEN CARDS, and the only one that can
// measure a cost. It plays the remainder out for every legal card, assuming
// perfect play by all four, and counts tricks.
//
// It declares `usedHiddenCards: true`, and `reconcile` then refuses to let its
// reason become the note's explanation. That distinction is not fussiness:
//
//   · "that cost you a trick" is a CONCLUSION, and the learner is owed it;
//   · "because West is void in hearts" is a DERIVATION from cards they cannot
//     see, and quoting it teaches them to reason from information they will
//     never have at a table.
//
// So it contributes a verdict, a severity and a cost — and never the lesson.
// Which is also why the reconciler ranks the learner's own rulebook above it for
// explaining, however much more this one knows.
//
// Reach is set by the caller's time budget rather than a constant: ~53ms at five
// cards a hand, ~400ms at six, ~3s at seven, ~23s at eight. See `searchDepthFor`.

import type { Correctness, EvaluationBudget, Finding, Severity } from "@laic/coach/core";
import { LiveCardPlayEvaluator, LocalDoubleDummyOracle } from "@laic/coach/domains/bridge";
import type { Seat } from "@bridge/events";

import { livePlayState } from "../cardVerdicts";
import { searchDepthFor, type AssessContext, type MoveUnderReview } from "./context";

const SEATS: Seat[] = ["N", "E", "S", "W"];

export const doubleDummyAssessor = {
  id: "dds",
  authority: "solution" as const,

  applies(move: MoveUnderReview): boolean {
    return move.action.kind === "card" && Boolean(move.before.contract);
  },

  async assess(
    move: MoveUnderReview,
    _ctx: AssessContext,
    budget: EvaluationBudget,
  ): Promise<Finding | null> {
    const depth = searchDepthFor(budget.ms);
    const cardsLeft = Math.max(...SEATS.map((s) => move.before.hands[s]?.length ?? 0));
    if (cardsLeft > depth) return null; // too deep for what the caller can wait

    const live = livePlayState(move.before, move.learnerSeat, move.actor);
    if (!live) return null;

    // Asked rather than judged: probe any legal card purely to read `bestCards`
    // out of the verdict. The probe is not a claim about what was played.
    const subject = move.asking ? live.legalCards[0] : move.action.card;
    if (!subject) return null;

    const oracle = new LocalDoubleDummyOracle(depth);
    const evaluator = new LiveCardPlayEvaluator(oracle);
    const result = await evaluator.evaluate(live, {
      card: subject,
      position: move.actor,
      live: true,
    });

    // The evaluator returns a low-confidence "acceptable" to mean "I could not
    // judge this". Treat that as no finding rather than a quiet endorsement of a
    // card nobody actually checked.
    if (result.correctness === "acceptable" && (result.confidence ?? 0) < 0.5) return null;

    const best = typeof result.bestAction === "string" ? [result.bestAction] : [];
    const tricksLost =
      move.asking || result.correctness === "correct"
        ? 0
        : result.severity === "critical"
          ? 3
          : result.severity === "major"
            ? 2
            : 1;

    return {
      assessor: "dds",
      authority: "solution",
      correctness: (move.asking ? "acceptable" : result.correctness) as Correctness,
      severity: result.severity as Severity,
      confidence: result.confidence ?? 0.9,
      // The declaration everything else hangs off.
      usedHiddenCards: true,
      // Deliberately no `because`. Its reasoning is not the learner's to borrow;
      // the cost below is the part they are owed, and the note states it plainly.
      ...(tricksLost > 0 ? { cost: { tricks: tricksLost } } : {}),
      ...(best.length ? { recommends: best } : {}),
      ...(result.skillIds?.length ? { skillIds: result.skillIds } : {}),
      ...(result.conceptIds?.length ? { conceptIds: result.conceptIds } : {}),
    };
  },
};
