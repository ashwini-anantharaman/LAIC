/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/CoachProfile.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

export type CoachingMode =
  "passive" | "on_demand" | "guided_tutor" | "live_coach" | "postmortem" | "guided_replay" | "human_coach_assistant";

/**
 * The outer deployable, admin-authored coach record: purpose, audience, domain, and references to the policy/scope/capability/evaluator/tool config it resolves to. Distinct from CoachingPolicyProfile (the inner behavioral object). See LAIC architecture §8.2.
 */
export interface CoachProfile {
  schemaVersion: string;
  id: string;
  name: string;
  description?: string;
  domainId: string;
  profileType:
    | "study_tutor"
    | "challenge_prep"
    | "live_activity_coach"
    | "postmortem_coach"
    | "analysis_coach"
    | "human_coach_assistant";
  supportedModes: CoachingMode[];
  defaultMode: CoachingMode;
  coachingPolicyProfileId: string;
  knowledgeScopeId: string;
  capabilityScopeId: string;
  learnerScopePolicyId?: string;
  recommendationPolicyId?: string;
  evaluatorBindings?: {
    [k: string]: unknown;
  }[];
  toolBindings?: {
    [k: string]: unknown;
  }[];
  promptTemplateSetId?: string;
  outputStyleId?: string;
  version: string;
  status: "draft" | "review" | "published" | "archived";
  ownerType: "platform" | "program" | "organization" | "human_coach";
  ownerId: string;
  basePresetId?: string;
  compatibility?: {
    apps?: string[];
    domains?: string[];
    activityTypes?: string[];
    learnerLevels?: string[];
  };
}
