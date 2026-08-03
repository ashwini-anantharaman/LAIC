/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/CoachNote.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

/**
 * One thing the coach said to a learner, about one action. This is a CONTRACT rather than a host convention: a note is evidence of what a learner was told, so review, postmortem and audit all need it in one shape across every host. Hosts persist and render it however suits them — the shape is not negotiable, the storage and styling are.
 */
export interface CoachNote {
  schemaVersion: string;
  noteId: string;
  context?: PlatformContext;
  learnerId: string;
  /**
   * The host action this note is about, opaque to the coach. Bridge uses the event seq; a quiz would use a question id. The coach must never need to know which.
   */
  anchorId: string;
  /**
   * Mirrors the intervention's response type, plus `affirmation` (a correct action confirmed) and `status` (the coach reporting on itself).
   */
  kind: "hint" | "nudge" | "question" | "explanation" | "affirmation" | "status";
  /**
   * One line. The whole note, when there is only room for one.
   */
  headline: string;
  detail?: string;
  /**
   * What the note leaned on — a rule, a lesson, a setting. The product's claim is a cited rulebook, so a note that asserts without provenance is a bug.
   */
  citations?: {
    label: string;
    /**
     * The cited artifact's own id, e.g. a compiled rule id.
     */
    sourceId?: string;
    href?: string;
  }[];
  /**
   * What the coach considered and set aside. Half of "why this" is "why not that", and for a learner that half is usually the more useful one.
   */
  alternatives?: {
    label: string;
    why: string;
  }[];
  /**
   * Questions the learner can ask about this note, each with an answer the coach already holds. Deterministic by design: a follow-up whose answer has to be generated is a different feature with different failure modes.
   */
  followUps?: {
    q: string;
    a: string;
  }[];
  /**
   * How much of the answer this note gave away. Stored so a later note can escalate rather than repeat.
   */
  hintLevel?: number;
  /**
   * Which resolved policy produced it — a note is only interpretable against the behaviour that generated it.
   */
  policyVersion?: string;
  profileId?: string;
  createdAt: string;
}
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
