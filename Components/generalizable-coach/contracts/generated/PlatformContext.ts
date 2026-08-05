/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/PlatformContext.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

/**
 * Tenancy: which app, programme, domain and organisation a record belongs to. Every event, note and observation carries it so that a coach running out-of-process can scope every query by it, and so that adding scoping later never means rewriting stored records. Mirrors PlatformContext in @laic/learner-contracts (Shared Data Model §2.4) — structurally identical, restated here so the coach package stays dependency-free.
 */
export interface PlatformContext {
  /**
   * The consuming application, e.g. "bridge_ai_coach".
   */
  appId: string;
  programId: string;
  /**
   * e.g. "bridge", "course_learning".
   */
  domainId: string;
  offeringId?: string;
  organizationScopeId?: string;
  groupId?: string;
}
