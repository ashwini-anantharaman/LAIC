/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/Recommendation.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

/**
 * A next-step recommendation the Coach emits, referencing an owning-platform object so the host renders it. See LAIC architecture §13.
 */
export interface Recommendation {
  schemaVersion: string;
  id: string;
  learnerId: string;
  domainId: string;
  reason: string;
  /**
   * review_block | flashcard_set | quiz_retry | next_lesson | tutorial | drill | practice_hand | postmortem_review | reflection | assessment | human_coach_review | guided_replay
   */
  recommendationType: string;
  /**
   * owning-platform learning object id
   */
  targetObjectId?: string;
  priority: "low" | "medium" | "high";
  evidenceRefs?: string[];
  status: "active" | "accepted" | "dismissed" | "completed" | "expired";
  generatedBy: "rule" | "coach" | "llm_assisted" | "human_coach";
  createdAt: string;
}
