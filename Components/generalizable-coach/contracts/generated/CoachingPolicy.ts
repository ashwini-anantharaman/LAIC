/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/CoachingPolicy.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

/**
 * The flat, resolved behavioral rules the runtime consumes, produced by collapsing the config inheritance chain (platform default → profile → course → class → learner prefs → session). See LAIC architecture §8.3, CPIP §9.
 */
export interface CoachingPolicy {
  schemaVersion: string;
  interventionMode:
    "passive" | "on_demand" | "guided_tutor" | "live_coach" | "postmortem" | "guided_replay" | "human_coach_assistant";
  maxHintLevel: number;
  allowDirectAnswer?: boolean;
  feedbackStyle?: "gentle" | "direct" | "socratic" | "minimal" | "mixed";
  questioningStyle?: "socratic" | "direct" | "mixed";
  interruptionTolerance?: "low" | "medium" | "high";
  postmortemVsRealtime?: "prefer_realtime" | "prefer_postmortem";
  saveForPostmortemWhenPossible?: boolean;
  /**
   * Subset of the host's registered tools this policy permits.
   */
  enabledTools?: string[];
  /**
   * Cross-domain awareness in dialogue; OFF by default (LPIP §5.4).
   */
  crossScopeAwareness?: boolean;
  /**
   * Enable the conversational 'chat with me' surface (§6.3).
   */
  conversationalMode?: boolean;
  /**
   * Hard bound on step/tool chaining within one chat turn (bet #7).
   */
  maxOrchestrationSteps?: number;
  /**
   * Which CoachingPolicyProfile version produced this resolved policy (config versioning, §8.5).
   */
  provenance?: {
    profileId?: string;
    schemaVersion?: string;
  };
}
