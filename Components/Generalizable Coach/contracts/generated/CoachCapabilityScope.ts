/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/CoachCapabilityScope.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

/**
 * What a coach may DO, independent of what it knows. A disabled capability is structurally unavailable, not merely discouraged. See LAIC architecture §8.4.
 */
export interface CoachCapabilityScope {
  schemaVersion: string;
  id: string;
  name: string;
  canAnswerQuestions?: boolean;
  canExplainConcepts?: boolean;
  canAskSocraticQuestions?: boolean;
  canGenerateHints?: boolean;
  canEvaluateResponses?: boolean;
  canRecommendLearningObjects?: boolean;
  canRecommendPractice?: boolean;
  canCreateFlashcardReview?: boolean;
  canGeneratePostmortems?: boolean;
  canGuideReplay?: boolean;
  canSummarizeForHumanCoach?: boolean;
  canUpdateLearnerModel?: boolean;
  canTriggerNotifications?: boolean;
}
