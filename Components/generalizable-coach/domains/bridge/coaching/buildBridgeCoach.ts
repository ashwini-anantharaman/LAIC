/**
 * Zone 3 — Bridge implementation: composition root.
 *
 * Wires the generic platform pipeline together with the Bridge plugin,
 * evaluator, and Beginner 1 knowledge package into a ready-to-use coach.
 * This is the only place Bridge wiring meets the platform core.
 */
import { LearnerStore } from "../../../platform/learner-model/index.js";
import { KnowledgeRetriever } from "../../../platform/knowledge/index.js";
import {
  InterventionPolicyEngine,
  AdaptiveCoachRuntime,
} from "../../../platform/coach-runtime/index.js";
import {
  ResponseGenerator,
  LLMClient,
  type LLMLike,
} from "../../../platform/llm/index.js";
import { SessionEngine } from "../../../platform/session/index.js";
import { bridgePlugin } from "../plugin/BridgePlugin.js";
import { BridgePromptBuilder } from "./BridgePromptBuilder.js";
import { RouterEvaluator } from "../evaluator/RouterEvaluator.js";
import { BridgeEvaluator } from "../evaluator/BridgeEvaluator.js";
import { CardPlayEvaluator } from "../cardplay/CardPlayEvaluator.js";
import { LiveCardPlayEvaluator } from "../cardplay/LiveCardPlayEvaluator.js";
import type { DoubleDummyOracle } from "../cardplay/oracle.js";
import { loadBridgeKnowledge } from "../knowledge/loadPackage.js";

export interface BridgeCoach {
  runtime: AdaptiveCoachRuntime;
  learnerStore: LearnerStore;
  sessionEngine: SessionEngine;
  knowledgeRetriever: KnowledgeRetriever;
  plugin: typeof bridgePlugin;
}

export interface BuildOptions {
  /** inject a mock LLM for tests; defaults to the real Anthropic client */
  llm?: LLMLike;
  /**
   * Inject a double-dummy oracle to give authoritative correctness on
   * arbitrary live card plays. Omit to run the principle engine alone.
   */
  oracle?: DoubleDummyOracle;
  /**
   * Inject persistent stores (e.g. SQLite-backed) so the learner model and
   * session logs survive restarts. Default to in-memory when omitted.
   */
  learnerStore?: LearnerStore;
  sessionEngine?: SessionEngine;
}

export function buildBridgeCoach(opts: BuildOptions = {}): BridgeCoach {
  const learnerStore = opts.learnerStore ?? new LearnerStore();
  // Combined bidding + card-play knowledge, so the coach can teach both.
  const knowledgeRetriever = new KnowledgeRetriever(loadBridgeKnowledge());
  const interventionEngine = new InterventionPolicyEngine();
  const llm = opts.llm ?? new LLMClient();
  const responseGenerator = new ResponseGenerator(llm, new BridgePromptBuilder());
  const sessionEngine = opts.sessionEngine ?? new SessionEngine();

  const runtime = new AdaptiveCoachRuntime({
    // Router dispatches bidding, curated card-play, and live card-play actions
    // to the right evaluator. The live evaluator gets the injected oracle.
    evaluator: new RouterEvaluator(
      new BridgeEvaluator(),
      new CardPlayEvaluator(),
      new LiveCardPlayEvaluator(opts.oracle),
    ),
    knowledgeRetriever,
    interventionEngine,
    responseGenerator,
    learnerStore,
    sessionEngine,
  });

  return {
    runtime,
    learnerStore,
    sessionEngine,
    knowledgeRetriever,
    plugin: bridgePlugin,
  };
}
