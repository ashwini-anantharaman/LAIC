/**
 * Zone 1 — Platform core: capability-scope enforcement (LAIC §8.4, M2/B3).
 *
 * A disabled capability is STRUCTURALLY unavailable, not merely discouraged: if
 * the scope turns a capability off, the corresponding response type can never
 * be produced — the decision is downgraded to silent. Same guarantee as
 * tool-gating, applied to what the coach may do.
 */
import type { CoachCapabilityScope } from "../../contracts/index.js";
import type { InterventionDecision, ResponseType } from "./InterventionPolicyEngine.js";

export type Capability = keyof Omit<CoachCapabilityScope, "schemaVersion" | "id" | "name">;

/** A permissive default scope (everything on) — narrow it per profile. */
export function defaultCapabilityScope(): CoachCapabilityScope {
  return {
    schemaVersion: "1.0.0",
    id: "default",
    name: "All capabilities",
    canAnswerQuestions: true,
    canExplainConcepts: true,
    canAskSocraticQuestions: true,
    canGenerateHints: true,
    canEvaluateResponses: true,
    canRecommendLearningObjects: true,
    canRecommendPractice: true,
    canCreateFlashcardReview: true,
    canGeneratePostmortems: true,
    canGuideReplay: true,
    canSummarizeForHumanCoach: true,
    canUpdateLearnerModel: true,
    canTriggerNotifications: true,
    canChatConversationally: true,
    canChainTools: true,
  };
}

/** A capability is allowed unless the scope explicitly disables it (=== false). */
export function isAllowed(scope: CoachCapabilityScope, capability: Capability): boolean {
  return scope[capability] !== false;
}

/** Which capability a response type requires (silent/postmortem need none). */
function requiredCapability(rt: ResponseType): Capability | null {
  switch (rt) {
    case "hint":
    case "nudge":
      return "canGenerateHints";
    case "question":
      return "canAskSocraticQuestions";
    case "explanation":
      return "canExplainConcepts";
    default:
      return null; // silent, save_for_postmortem
  }
}

/**
 * Enforce the capability scope on a decision. If the chosen response type needs
 * a capability the scope disables, the coach cannot produce it — downgrade to
 * silent so the capability is genuinely absent, not just suppressed downstream.
 */
export function applyCapabilityScope(
  decision: InterventionDecision,
  scope: CoachCapabilityScope,
): InterventionDecision {
  const cap = requiredCapability(decision.responseType);
  if (cap && !isAllowed(scope, cap)) {
    return {
      shouldRespond: false,
      responseType: "silent",
      hintLevel: 0,
      reason: `capability ${cap} disabled — response structurally unavailable`,
    };
  }
  return decision;
}
