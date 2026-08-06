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
// Reach is now the whole hand. This used to be budget-gated — the hand-written
// solver took ~53ms at five cards a hand and ~23s at eight, so anything before
// trick 7 was simply unanswerable. The engine underneath is a WASM build of Bo
// Haglund's dds: 0.4ms at eight cards, ~13ms at thirteen. Every card of every
// trick can be asked about, and the answers are right, which the old solver's
// were not.

import type { Correctness, EvaluationBudget, Finding, Severity } from "@laic/coach/core";
import { LiveCardPlayEvaluator } from "@laic/coach/domains/bridge";
import { DdsOracle, scoreEveryCard } from "../ddsOracle";

import { livePlayState } from "../cardVerdicts";
import type { AssessContext, MoveUnderReview } from "./context";

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
    // NO DEPTH CAP ANY MORE. The old solver grew about sevenfold per card and
    // could not be asked about anything before trick 7; this engine does a full
    // thirteen-card deal in ~13ms, so every card of every trick is answerable and
    // the budget-to-depth lookup that used to gate this is gone.
    void budget;

    const live = livePlayState(move.before, move.learnerSeat, move.actor);
    if (!live) return null;

    // Asked rather than judged: probe any legal card purely to read `bestCards`
    // out of the verdict. The probe is not a claim about what was played.
    const subject = move.asking ? live.legalCards[0] : move.action.card;
    if (!subject) return null;

    // THE SOLVER SPEAKS FIRST, AND ITS SILENCE IS THE ABSTENTION. This assessor
    // exists to carry one authority's opinion; if the solver could not read the
    // position there is no finding to make, whatever else might have an opinion.
    //
    // It used to be decided the other way round — the evaluator ran, and a
    // low-confidence "acceptable" from its fallback principle engine meant abstain.
    // That made the solution authority appear or vanish according to what a
    // DIFFERENT layer thought of one specific card, and it broke the invariant that
    // judging and asking consult the same authorities: judging looked at the card
    // played, asking probed the first legal card, the principle engine rated them
    // differently, and only one of the two produced a `solution` finding.
    const scores = await scoreEveryCard(live);
    if (!scores?.length) return null;
    // A card the solver did not score is one it cannot speak about — an illegal
    // play, or a position the caller and the engine disagree about.
    const played = scores.find((s) => s.card === subject);
    if (!played) return null;

    const evaluator = new LiveCardPlayEvaluator(new DdsOracle());
    const result = await evaluator.evaluate(live, {
      card: subject,
      position: move.actor,
      live: true,
    });

    // Every card that ties for best, not just the first. "Either black ace" is true
    // where "the A♠" is arbitrary, and a learner who played the A♣ deserves to be
    // told they were right. The evaluator's `bestAction` is a single card, which is
    // how the coach came to name one of several equals as though it mattered.
    const bestTricks = Math.max(...scores.map((s) => s.tricks));
    const best = scores.filter((s) => s.tricks === bestTricks).map((s) => s.card);

    // The exact figure. This used to be reverse-engineered from the severity band —
    // critical→3, major→2, otherwise 1 — a guess made in front of an engine holding
    // the number.
    const tricksLost = move.asking ? 0 : bestTricks - played.tricks;

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
      // THE COST TABLE, carried so an explanation can be written. It says which
      // cards were equivalent and which were disasters — the discriminating
      // information — while naming no hidden card, because a trick count is a
      // consequence and not a holding.
      ...(scores.length ? { bridge: { scores } } : {}),
      ...(result.skillIds?.length ? { skillIds: result.skillIds } : {}),
      ...(result.conceptIds?.length ? { conceptIds: result.conceptIds } : {}),
    };
  },
};
