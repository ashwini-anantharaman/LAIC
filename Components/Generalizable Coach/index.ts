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
} from "./platform/embed/index.js";
// Domain registry (the "front desk"): resolve/open a coach by domainId.
export {
  registerDomain,
  getRegisteredDomain,
  listDomains,
  openCoachSession,
  type RegisteredDomain,
  type OpenCoachOptions,
  type DomainBuildContext,
} from "./platform/embed/index.js";
export { withOfflineFallback } from "./platform/embed/HeuristicLLM.js";
export type {
  CoachSuggestion,
  SuggestionListener,
  EventSource,
} from "./platform/embed/ports.js";
export { HeuristicLLM } from "./platform/embed/HeuristicLLM.js";

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
} from "./platform/types/index.js";

// --- Bridge domain: composition root + action/state contracts --------------
// The bridge-flavored createCoachSession (oracle + persona defaults) is the
// zero-config entry point for bridge hosts; it delegates to createCoreCoachSession.
export {
  createCoachSession,
  type CoachSessionOptions,
} from "./domains/bridge/coaching/createBridgeCoachSession.js";
export { BridgePromptBuilder } from "./domains/bridge/coaching/BridgePromptBuilder.js";
export {
  buildBridgeCoach,
  type BridgeCoach,
  type BuildOptions,
} from "./domains/bridge/coaching/buildBridgeCoach.js";
export { MockLLM } from "./domains/bridge/coaching/MockLLM.js";
export { LLMClient, type LLMClientOptions, type LLMProvider } from "./platform/llm/LLMClient.js";
export type { LLMLike } from "./platform/llm/index.js";
export type {
  Seat,
  BridgeBidAction,
  BridgeGameState,
} from "./domains/bridge/plugin/events.js";
export { BRIDGE_DOMAIN_ID } from "./domains/bridge/plugin/constants.js";

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
} from "./platform/common-coach/index.js";

// --- Retrieval (hybrid keyword + embeddings) --------------------------------
export {
  HybridRetriever,
  cosineSimilarity,
  OpenAIEmbeddingProvider,
  type EmbeddingProvider,
  type HybridOptions,
} from "./platform/knowledge/embeddings.js";

// --- Live card-play evaluation (arbitrary positions, not just scenarios) ----
export {
  LiveCardPlayEvaluator,
  type LiveCardPlayAction,
  type LiveCardPlayState,
} from "./domains/bridge/cardplay/LiveCardPlayEvaluator.js";
export {
  type DoubleDummyOracle,
  type OracleVerdict,
  NullOracle,
} from "./domains/bridge/cardplay/oracle.js";
export { LocalDoubleDummyOracle } from "./domains/bridge/cardplay/dds/LocalDoubleDummyOracle.js";
export { solvePosition, encodeCard, decodeCard } from "./domains/bridge/cardplay/dds/solver.js";
