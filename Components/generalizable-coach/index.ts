/**
 * @laic/coach — public package API.
 *
 * A UI-agnostic adaptive coaching engine. The primary entry point for a host
 * UI is `createCoachSession`; everything else here is for advanced wiring,
 * custom evaluators, or type-safe event construction.
 *
 * Zones:
 *   - platform/*  : domain-agnostic core (runtime, learner model, ports)
 *   - domains/bridge/* : the bridge domain plugin, evaluators, knowledge
 */

// Side-effect: register the bridge domain with the platform registry so
// openCoachSession("bridge_gameplay", …) works for any host importing the package.
import "./domains/bridge/coaching/register.js";

// --- Embeddable facade + ports (what most hosts use) -----------------------
// The generic, domain-agnostic session factory lives in the platform. Each
// domain ships a thin wrapper (below, bridge exports createCoachSession).
export {
  createCoreCoachSession,
  type CoachSession,
  type CoachCore,
  type CoreCoachSessionOptions,
  type CoachAnswer,
  type ChatReply,
} from "./platform/embed/index";
// Domain registry (the "front desk"): resolve/open a coach by domainId.
export {
  registerDomain,
  getRegisteredDomain,
  listDomains,
  openCoachSession,
  type RegisteredDomain,
  type OpenCoachOptions,
  type DomainBuildContext,
} from "./platform/embed/index";
export { withOfflineFallback } from "./platform/embed/HeuristicLLM";
export type {
  CoachSuggestion,
  SuggestionListener,
  EventSource,
} from "./platform/embed/ports";
export { HeuristicLLM } from "./platform/embed/HeuristicLLM";

// --- Domain contracts / types ----------------------------------------------
export type {
  ActivityEvent,
  AdaptiveCoachResponse,
  CoachResponseType,
  CommonCoachPackage,
  CoachingPolicy,
  HintLevel,
  FeedbackStyle,
  ExplanationDepth,
  SkillLevel,
  EvaluationResult,
  EvaluatorContract,
  Correctness,
  Severity,
} from "./platform/types/index";

// --- Bridge domain: composition root + action/state contracts --------------
// The bridge-flavored createCoachSession (oracle + persona defaults) is the
// zero-config entry point for bridge hosts; it delegates to createCoreCoachSession.
export {
  createCoachSession,
  type CoachSessionOptions,
} from "./domains/bridge/coaching/createBridgeCoachSession";
export { BridgePromptBuilder } from "./domains/bridge/coaching/BridgePromptBuilder";
export {
  buildBridgeCoach,
  type BridgeCoach,
  type BuildOptions,
} from "./domains/bridge/coaching/buildBridgeCoach";
export { MockLLM } from "./domains/bridge/coaching/MockLLM";
export { LLMClient, type LLMClientOptions, type LLMProvider } from "./platform/llm/LLMClient";
export type { LLMLike } from "./platform/llm/index";
export type {
  Seat,
  BridgeBidAction,
  BridgeGameState,
} from "./domains/bridge/plugin/events";
export { BRIDGE_DOMAIN_ID } from "./domains/bridge/plugin/constants";

// --- Common Coach (weak-skill detection, recommendations, postmortem) -------
export {
  detectWeakSkills,
  recommendNextSkill,
  summarizeLearner,
  generatePostmortem,
  type WeakSkill,
  type Recommendation,
  type RecommendationKind,
  type Postmortem,
} from "./platform/common-coach/index";

// --- Retrieval (hybrid keyword + embeddings) --------------------------------
export {
  HybridRetriever,
  cosineSimilarity,
  OpenAIEmbeddingProvider,
  type EmbeddingProvider,
  type HybridOptions,
} from "./platform/knowledge/embeddings";

// --- Live card-play evaluation (arbitrary positions, not just scenarios) ----
export {
  LiveCardPlayEvaluator,
  type LiveCardPlayAction,
  type LiveCardPlayState,
} from "./domains/bridge/cardplay/LiveCardPlayEvaluator";
export {
  type DoubleDummyOracle,
  type OracleVerdict,
  NullOracle,
} from "./domains/bridge/cardplay/oracle";
// NO SOLVER IS EXPORTED, and none is bundled. The hand-written one that used to
// live here was wrong: it cached alpha-beta values after a cutoff, where the number
// is a bound rather than a result, keyed on position with no record of the window it
// was valid for. Played out against its own recommendations it was correct on 17 of
// 40 five-card endings, and on one position it reported that both sides could win
// every trick.
//
// A wrong reference implementation is worse than none, because it gets used as a
// test oracle and quietly certifies bad behaviour as good. `DoubleDummyOracle` above
// is the PORT; hosts supply the engine. bridge-web wires a WASM build of Bo Haglund
// and Søren Hein's dds, which was correct on 40 of 40 and solves a full thirteen-card
// deal in about 13ms against roughly four days for ours.
