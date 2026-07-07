/**
 * Zone 2 — Domain Contracts: the DomainPlugin interface each domain
 * implements to give the platform its domain-specific meaning.
 */
import type { EvaluatorContract } from "./evaluation.js";

export interface DomainPlugin {
  domainId: string;
  conceptCategories: string[];
  eventTypes: string[];
  ruleTypes: string[];
  getEvaluator(): EvaluatorContract<any, any>;
}
