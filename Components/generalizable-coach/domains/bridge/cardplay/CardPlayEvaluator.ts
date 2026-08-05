/**
 * Zone 3 — Bridge implementation: card-play evaluator.
 *
 * Implements EvaluatorContract<CardPlayScenario, CardPlayAction>. The scenario
 * (which carries the correct play) is passed in as the game state, so the
 * evaluator simply grades the learner's chosen card against it.
 */
import type {
  EvaluatorContract,
  EvaluationResult,
  Correctness,
} from "../../../platform/types/index";
import type { CardPlayScenario, CardPlayAction } from "./types";
import { normalizeCard } from "./scenarios";

export class CardPlayEvaluator
  implements EvaluatorContract<CardPlayScenario, CardPlayAction>
{
  async evaluate(
    scenario: CardPlayScenario,
    action: CardPlayAction,
  ): Promise<EvaluationResult> {
    const played = normalizeCard(action.card);
    const best = scenario.bestCards.map(normalizeCard);
    const acceptable = scenario.acceptableCards.map(normalizeCard);

    let correctness: Correctness;
    if (best.includes(played)) correctness = "correct";
    else if (acceptable.includes(played)) correctness = "acceptable";
    else correctness = "incorrect";

    const isRight = correctness === "correct" || correctness === "acceptable";
    const explanation = isRight
      ? scenario.reasonBest
      : `${scenario.reasonWrong} ${scenario.reasonBest}`;

    return {
      correctness,
      confidence: 0.95,
      bestAction: scenario.bestCards[0],
      alternativeActions: scenario.acceptableCards,
      conceptIds: scenario.conceptIds,
      skillIds: scenario.skillIds,
      explanation,
      severity: isRight ? "minor" : scenario.severityIfWrong,
    };
  }
}
