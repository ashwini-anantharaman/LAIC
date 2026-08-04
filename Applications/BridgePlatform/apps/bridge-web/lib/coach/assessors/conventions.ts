// Authority: general guidelines. The fallback beneath your rulebook.
//
// Three rules, all about FOLLOWING a card someone else led — second hand low,
// third hand high, fourth hand wins cheaply — hardcoded in the coaching
// component (`domains/bridge/cardplay/principles.ts`). They predate this
// integration; they are the component's own bridge knowledge, which is what lets
// it coach a table whose knowledge base has no card-play rules at all.
//
// Which is exactly the role they should keep: BENEATH the learner's own rulebook,
// never instead of it. Your KB covers the same three positions and does it more
// precisely — its third-hand rule adds "but the lower of touching honours", a
// real refinement these lack. Two copies of the same knowledge will drift, so the
// reconciler prefers yours for explaining and this one only speaks where yours
// is silent.
//
// It cannot cite anything. A constant has no author and no document, which is the
// other reason it ranks below a knowledge item.

import type { Correctness, Severity } from "@laic/coach/core";
import { runPrinciples } from "@laic/coach/domains/bridge";

import { livePlayState } from "../cardVerdicts";
import type { AssessContext, BridgeFinding, MoveUnderReview } from "./context";

export const conventionAssessor = {
  id: "conventions",
  authority: "convention" as const,

  applies(move: MoveUnderReview): boolean {
    return move.action.kind === "card" && Boolean(move.before.contract);
  },

  async assess(move: MoveUnderReview, _ctx: AssessContext): Promise<BridgeFinding | null> {
    const live = livePlayState(move.before, move.learnerSeat, move.actor);
    if (!live) return null;

    // ASKED: run the guidelines across every card the learner could legally play
    // and look for a split — some break a rule, others do not. That split is the
    // recommendation. No split means the guidelines have nothing to say here,
    // which is the correct output rather than a card picked at random.
    if (move.asking) {
      const ok: string[] = [];
      let broken: string | undefined;
      for (const card of live.legalCards) {
        const findings = runPrinciples(live, card);
        if (!findings.length) continue;
        const bad = findings.find((f) => !f.ok);
        if (bad) broken ??= bad.reason;
        else ok.push(card);
      }
      if (!broken || !ok.length) return null;
      return {
        assessor: "conventions",
        authority: "convention",
        correctness: "acceptable",
        severity: "minor",
        confidence: 0.6,
        usedHiddenCards: false,
        because: broken,
        recommends: ok,
      };
    }

    // JUDGED: the guidelines that apply to the card actually played.
    const played = move.action.card;
    if (!played) return null;
    const findings = runPrinciples(live, played);
    if (!findings.length) return null;

    const violated = findings.find((f) => !f.ok);
    const matched = violated ?? findings[0]!;
    const severity = matched.severityIfWrong as Severity;
    const correctness: Correctness = !violated
      ? "correct"
      : severity === "minor"
        ? "suboptimal"
        : "incorrect";

    return {
      assessor: "conventions",
      authority: "convention",
      correctness,
      severity,
      // Deliberately below the rulebook's: a guideline is right often, not
      // always, and the reconciler should never let it outvote an agreement.
      confidence: 0.6,
      usedHiddenCards: false,
      because: matched.reason,
      ...(matched.skill ? { skillIds: [matched.skill] } : {}),
      ...(matched.concept ? { conceptIds: [matched.concept] } : {}),
    };
  },
};
