/**
 * @laic/coach/core — the domain-free entrypoint.
 *
 * The root entrypoint (./index.ts) registers the bridge domain for side effect
 * and, through it, constructs a double-dummy solver. That is right for a bridge
 * host and wrong for everyone else: a course-learning host that imports
 * `@laic/coach` should not carry a card-play solver in its graph. This module is
 * what a host imports when it wants the coaching engine and nothing else.
 *
 * Two guarantees, both load-bearing, both checked by scripts/check-core-graph.mjs:
 *
 *   1. NO DOMAIN. Nothing under domains/ is reachable from here. A host that
 *      coaches quizzes and a host that coaches bridge import the same module.
 *   2. NO DEPENDENCIES. Nothing reachable from here imports a package or a node:
 *      builtin — no ajv, no better-sqlite3, no express, no fs. That is what lets
 *      a Next app consume this as TypeScript source over a `link:` dependency,
 *      with no build step and nothing to install.
 *
 * What the host brings, and the coach does not:
 *
 *   · the VERDICT — the host's own domain rules judge the learner's action and
 *     hand over an EvaluationResult. The coach never re-implements a domain.
 *   · the EVENTS — the host maps its native events into ActivityEvent and feeds
 *     them through an EventSource.
 *   · the KNOWLEDGE — a KnowledgeSource over whatever corpus the host has.
 *
 * What the coach decides: whether to speak at all, in what form, and at what
 * hint level — from the resolved CoachingPolicy, deterministically and with no
 * LLM. See platform/policy/InterventionPolicyEngine.ts.
 */

// --- Session ---------------------------------------------------------------
// The architecture-level opener: composes the learner profile, the resolved
// policy and the capability scope, and exposes decide().
export {
  openCoachSession,
  defaultCoachingPolicy,
  type CoachSession,
  type CommonCoachPackage,
  type OpenCoachSessionOptions,
  type ChatTurn,
} from "./platform/adaptive/index";

// --- Evidence --------------------------------------------------------------
// A panel of authorities rather than one verdict: each says who it is, how
// confident it is, and whether it consulted anything the learner cannot see.
// `reconcile` collapses them under three rules that were each a bug first.
export {
  reconcile,
  type Assessment,
  type Assessor,
  type Authority,
  type EvaluationBudget,
  type Finding,
  type FindingCitation,
} from "./platform/evaluation/index";

// --- The decision ----------------------------------------------------------
export {
  decideIntervention,
  applyCapabilityScope,
  defaultCapabilityScope,
  isAllowed,
  type InterventionDecision,
  type DecideInput,
  type ResponseType,
  type Capability,
} from "./platform/policy/index";

// --- Configuration ---------------------------------------------------------
// Layered resolution: platform default → profile → course → class → learner →
// session, with locked fields. Coaching "modes" are presets over these fields,
// never a parallel enum.
export {
  resolvePolicy,
  policyProfileToLayer,
  platformDefaultPolicy,
  type PolicyLayer,
} from "./platform/config/index";

// --- Host ports ------------------------------------------------------------
// Imported from platform/embed/ports rather than the embed barrel: the barrel also carries
// the chat/postmortem/retrieval facade, which a host feeding events does not
// need in its bundle.
export type {
  EventSource,
  VerdictSource,
  LearnerContextSource,
  LearnerFocus,
  CoachSuggestion,
  SuggestionListener,
} from "./platform/embed/ports";

export {
  BundledKnowledgeSource,
  ScopedKnowledgeSource,
  MultiScopeKnowledgeSource,
  toKnowledgeChunk,
  type KnowledgeSource,
  type KnowledgeQuery,
  type KnowledgePackage,
  type ChunkType,
  type RawChunk,
} from "./platform/knowledge-source/index";

// --- Learner model ---------------------------------------------------------
// In-memory by default. `setExternalMasteryDomains` is the handover switch for
// when a host (Owlwise) owns mastery: it makes the coach a reader, by config.
export { LearnerStore } from "./platform/learner-model/index";

// --- Contracts -------------------------------------------------------------
// Types come from contracts/generated (type-only, erased at compile time); the
// version comes from contracts/version, NOT the barrel, which pulls the ajv
// validator and reads the schema directory from disk at import time.
export { CONTRACTS_SCHEMA_VERSION } from "./contracts/version";
export type {
  ActivityEvent as ActivityEventContract,
  CoachingPolicy,
  CoachingPolicyProfile,
  CoachCapabilityScope,
  CoachNote,
  PlatformContext,
  LearnerDomainProfile,
  KnowledgeChunk,
  KnowledgeScope,
} from "./contracts/generated/index";
export type {
  ActivityEvent,
  EvaluationResult,
  EvaluatorContract,
  Correctness,
  Severity,
  AdaptiveCoachResponse,
  CoachResponseType,
  FeedbackStyle,
  ExplanationDepth,
  HintLevel,
  SkillLevel,
} from "./platform/types/index";
