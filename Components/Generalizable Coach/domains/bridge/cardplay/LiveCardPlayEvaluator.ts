/**
 * Zone 3 — Bridge: evaluator for ARBITRARY live card plays.
 *
 * Unlike CardPlayEvaluator (which grades against a curated scenario that
 * already carries the answer), this judges any position from the full deal.
 * It implements the hybrid design:
 *   - a DoubleDummyOracle (if wired) decides correctness/severity, and
 *   - the principle engine names the tactic and provides a safe fallback when
 *     no solver is available.
 *
 * When neither the oracle nor a principle can judge the play, it returns an
 * "acceptable / minor" result with low confidence, which the intervention
 * policy treats as silence — the coach only speaks when it has something solid.
 */
import type {
  EvaluatorContract,
  EvaluationResult,
  Correctness,
  Severity,
} from "../../../platform/types/index.js";
import type { Seat } from "../plugin/events.js";
import * as C from "../plugin/constants.js";
import { normalizeCard } from "./scenarios.js";
import { runPrinciples } from "./principles.js";
import { NullOracle, type DoubleDummyOracle } from "./oracle.js";

export interface TrickCard {
  seat: Seat;
  /** "HQ", "ST", "C2" — suit first */
  card: string;
}

/** The payload of a live "card_played" event. */
export interface LiveCardPlayAction {
  /** the card the learner played, "HQ" form */
  card: string;
  /** the seat the learner played from */
  position: Seat;
  /** marks this as a live play (no curated scenarioId). */
  live?: true;
}

/** Full-information table state at the moment the learner plays. */
export interface LiveCardPlayState {
  contract: string;
  trump: "S" | "H" | "D" | "C" | "NT";
  declarer: Seat;
  learnerSeat: Seat;
  role: "declarer" | "defender" | "dummy";
  dummySeat: Seat;
  /** every seat's remaining cards, "S:AK4 H:Q2 ..." (full info from the host) */
  hands: { [seat in Seat]?: string };
  /** the seat whose card is being chosen (learner's, or dummy for a declarer play) */
  playFromSeat: Seat;
  toLead: boolean;
  leadSuit?: "S" | "H" | "D" | "C";
  trickSoFar: TrickCard[];
  legalCards: string[];
  /** completed tricks so far (0..12) */
  tricksPlayed: number;
}

const SEVERITY_BY_TRICKS_LOST: Record<number, { correctness: Correctness; severity: Severity }> = {
  0: { correctness: "correct", severity: "minor" },
  1: { correctness: "suboptimal", severity: "moderate" },
};

export class LiveCardPlayEvaluator
  implements EvaluatorContract<LiveCardPlayState, LiveCardPlayAction>
{
  constructor(private readonly oracle: DoubleDummyOracle = new NullOracle()) {}

  async evaluate(
    state: LiveCardPlayState,
    action: LiveCardPlayAction,
  ): Promise<EvaluationResult> {
    const played = normalizeCard(action.card);
    const findings = runPrinciples(state, played);
    const violated = findings.find((f) => !f.ok);
    const matched = violated ?? findings[0];

    const verdict = await this.oracle.evaluate(state, played);

    // --- Oracle present: it is the authority on correctness. ---------------
    if (verdict) {
      const grade =
        SEVERITY_BY_TRICKS_LOST[verdict.tricksLost] ??
        ({ correctness: "incorrect", severity: verdict.tricksLost >= 3 ? "critical" : "major" } as const);

      const principleWhy = violated?.reason ?? matched?.reason;
      const ddWhy =
        verdict.tricksLost === 0
          ? "This is the best play double-dummy."
          : `This gives up ${verdict.tricksLost} trick${verdict.tricksLost > 1 ? "s" : ""} versus best play.`;

      return {
        correctness: grade.correctness,
        confidence: 0.9,
        bestAction: verdict.bestCards[0],
        alternativeActions: verdict.bestCards,
        conceptIds: matched ? [matched.concept] : [C.CONCEPT_PLAN_PLAY],
        skillIds: matched ? [matched.skill] : [C.SKILL_PLAN_TRICKS],
        explanation: principleWhy ? `${ddWhy} ${principleWhy}` : ddWhy,
        severity: grade.severity,
      };
    }

    // --- No oracle: rely on high-confidence principles only. ---------------
    if (violated) {
      const severity = violated.severityIfWrong;
      const correctness: Correctness = severity === "minor" ? "suboptimal" : "incorrect";
      return {
        correctness,
        confidence: 0.6,
        conceptIds: [violated.concept],
        skillIds: [violated.skill],
        explanation: violated.reason,
        severity,
      };
    }

    // Nothing solid to say — stay silent (acceptable + minor → no interruption).
    return {
      correctness: "acceptable",
      confidence: 0.2,
      conceptIds: matched ? [matched.concept] : [],
      skillIds: matched ? [matched.skill] : [],
      explanation:
        matched?.reason ?? "No high-confidence card-play issue detected in this position.",
      severity: "minor",
    };
  }
}
