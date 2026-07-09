/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/CoachInstance.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

/**
 * A published CoachProfile deployed to a concrete place (app, course, learning object, bridge table, review screen). See LAIC architecture §3 (CPIP §7.1).
 */
export interface CoachInstance {
  schemaVersion: string;
  id: string;
  coachProfileId: string;
  domainId: string;
  mode:
    "passive" | "on_demand" | "guided_tutor" | "live_coach" | "postmortem" | "guided_replay" | "human_coach_assistant";
  deployedTo?: {
    appId?: string;
    courseId?: string;
    learningObjectId?: string;
    bridgeTableId?: string;
    reviewScreenId?: string;
    [k: string]: unknown;
  };
  entitlementId?: string;
  status: "active" | "disabled" | "archived";
  createdAt: string;
}
