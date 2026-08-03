/**
 * Zone 3 — Bridge implementation: the DomainPlugin for bridge gameplay.
 * Supplies domain metadata and the evaluator to the platform runtime.
 */
import type {
  DomainPlugin,
  EvaluatorContract,
} from "../../../platform/types/index";
import { BridgeEvaluator } from "../evaluator/BridgeEvaluator";
import schema from "./bridge_gameplay.schema.json";
import { BRIDGE_DOMAIN_ID } from "./constants";

export class BridgePlugin implements DomainPlugin {
  readonly domainId = BRIDGE_DOMAIN_ID;
  readonly conceptCategories = schema.conceptCategories;
  readonly eventTypes = schema.eventTypes;
  readonly ruleTypes = schema.ruleTypes;

  private evaluator = new BridgeEvaluator();

  getEvaluator(): EvaluatorContract<any, any> {
    return this.evaluator;
  }
}

export const bridgePlugin = new BridgePlugin();
