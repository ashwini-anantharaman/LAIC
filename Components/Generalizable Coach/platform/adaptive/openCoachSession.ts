/**
 * Zone 1 — Platform core: the architecture-level session opener (LAIC §6.1).
 *
 * Composes the Common Layer and the Adaptive Layer for one activity: resolves
 * the domain, builds the Common Coach Package, resolves the CoachingPolicy from
 * the config chain (M2), binds a KnowledgeSource + capability scope, and exposes
 * a deterministic `decide()` (config-driven intervention) and a `chat()`
 * conversation window. LLM-generated response *text* arrives in M3; the
 * decision itself is real from M2.
 */
import type {
  CoachingPolicy,
  CoachingPolicyProfile,
  CoachCapabilityScope,
  LearnerDomainProfile,
} from "../../contracts/index.js";
import { LearnerStore } from "../learner-model/index.js";
import { getRegisteredDomain } from "../embed/registry.js";
import type { KnowledgeSource } from "../knowledge-source/index.js";
import { platformDefaultPolicy, resolvePolicy, type PolicyLayer } from "../config/index.js";
import {
  decideIntervention,
  applyCapabilityScope,
  defaultCapabilityScope,
  type InterventionDecision,
} from "../policy/index.js";
import type { EvaluationResult } from "../types/index.js";

export interface CommonCoachPackage {
  learnerId: string;
  domainId: string;
  domainProfile: LearnerDomainProfile;
  weakSkills: string[];
  masteredSkills: string[];
  resolvedPolicy: CoachingPolicy;
  crossScopeAwareness: string[];
}

export interface ChatTurn {
  role: "learner" | "coach";
  text: string;
}

export interface CoachSession {
  learnerId: string;
  domainId: string;
  commonCoachPackage: CommonCoachPackage;
  capabilityScope: CoachCapabilityScope;
  knowledgeSource?: KnowledgeSource;
  domainRegistered: boolean;
  readonly pipeline: "stub";
  /** Config-driven intervention decision for an evaluated action (deterministic). */
  decide(
    evaluation: EvaluationResult,
    opts?: { hintRequested?: boolean; currentHintLevel?: number },
  ): InterventionDecision;
  /** Append a learner message to the conversation window (multi-turn context, B4). */
  chat(text: string): { accepted: boolean; history: ChatTurn[] };
  /** The conversation window so far. */
  history(): ChatTurn[];
}

export interface OpenCoachSessionOptions {
  learnerId: string;
  domainId: string;
  learnerStore?: LearnerStore;
  knowledgeSource?: KnowledgeSource;
  /** resolve behavior from this profile (M2); overrides `policy` if given */
  policyProfile?: CoachingPolicyProfile;
  /** extra config layers below the profile (course/class/learner prefs/session) */
  policyLayers?: PolicyLayer[];
  /** an already-resolved policy (used when no profile is supplied) */
  policy?: CoachingPolicy;
  /** what the coach may do; defaults to all-on */
  capabilityScope?: CoachCapabilityScope;
  crossScopeAwareness?: boolean;
}

/** The platform-default resolved policy until a profile is supplied. */
export function defaultCoachingPolicy(): CoachingPolicy {
  return platformDefaultPolicy();
}

export function openCoachSession(opts: OpenCoachSessionOptions): CoachSession {
  const store = opts.learnerStore ?? new LearnerStore();
  const policy = opts.policyProfile
    ? resolvePolicy(opts.policyProfile, opts.policyLayers ?? [])
    : (opts.policy ?? defaultCoachingPolicy());
  const capabilityScope = opts.capabilityScope ?? defaultCapabilityScope();

  // COMMON LAYER: who is this learner, filtered to THIS domain.
  const domainProfile = store.getLearnerDomainProfile(opts.learnerId, opts.domainId);

  const awarenessOn = opts.crossScopeAwareness ?? policy.crossScopeAwareness ?? false;
  const crossScopeAwareness = awarenessOn
    ? store.listLearnerDomains(opts.learnerId).filter((d) => d !== opts.domainId)
    : [];

  const commonCoachPackage: CommonCoachPackage = {
    learnerId: opts.learnerId,
    domainId: opts.domainId,
    domainProfile,
    weakSkills: domainProfile.weakSkills ?? [],
    masteredSkills: domainProfile.masteredSkills ?? [],
    resolvedPolicy: policy,
    crossScopeAwareness,
  };

  const domain = getRegisteredDomain(opts.domainId);
  const conversation: ChatTurn[] = [];

  return {
    learnerId: opts.learnerId,
    domainId: opts.domainId,
    commonCoachPackage,
    capabilityScope,
    knowledgeSource: opts.knowledgeSource,
    domainRegistered: Boolean(domain),
    pipeline: "stub",

    decide(evaluation, decideOpts = {}) {
      const decision = decideIntervention({
        evaluation,
        policy,
        hintRequested: decideOpts.hintRequested,
        currentHintLevel: decideOpts.currentHintLevel,
      });
      return applyCapabilityScope(decision, capabilityScope);
    },

    chat(text) {
      // B4: multi-turn window. Answering as a capability is gated; the coach's
      // generated reply text is wired in M3 — here we just hold the context.
      if (capabilityScope.canAnswerQuestions === false) {
        return { accepted: false, history: [...conversation] };
      }
      conversation.push({ role: "learner", text });
      if (conversation.length > 40) conversation.splice(0, conversation.length - 40);
      return { accepted: true, history: [...conversation] };
    },

    history() {
      return [...conversation];
    },
  };
}
