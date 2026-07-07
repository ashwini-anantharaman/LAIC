/**
 * Zone 3 — Bridge implementation: routes a learner action to the right
 * evaluator so the single generic AdaptiveCoachRuntime can coach everything:
 *   - a `bid`                       → BridgeEvaluator (bidding)
 *   - a `card` WITH a `scenarioId`  → CardPlayEvaluator (curated drill)
 *   - a `card` WITHOUT a scenarioId → LiveCardPlayEvaluator (arbitrary play)
 */
import type {
  EvaluatorContract,
  EvaluationResult,
} from "../../../platform/types/index.js";
import { BridgeEvaluator } from "./BridgeEvaluator.js";
import { CardPlayEvaluator } from "../cardplay/CardPlayEvaluator.js";
import { LiveCardPlayEvaluator } from "../cardplay/LiveCardPlayEvaluator.js";

export class RouterEvaluator implements EvaluatorContract<any, any> {
  constructor(
    private readonly bidding = new BridgeEvaluator(),
    private readonly cardplay = new CardPlayEvaluator(),
    private readonly liveCardplay = new LiveCardPlayEvaluator(),
  ) {}

  evaluate(state: any, action: any): Promise<EvaluationResult> {
    if (action && typeof action.card === "string") {
      return typeof action.scenarioId === "string"
        ? this.cardplay.evaluate(state, action)
        : this.liveCardplay.evaluate(state, action);
    }
    return this.bidding.evaluate(state, action);
  }
}
