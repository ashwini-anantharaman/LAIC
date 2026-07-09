/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/LearnerDomainProfile.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

/**
 * The per-domain projection of the cross-domain Learner Profile Store. Every record carries domainId so dashboards stay domain-isolated. See LAIC architecture §5.2, CPIP §11.1, and the domain-isolation rule §16.4.
 */
export interface LearnerDomainProfile {
  schemaVersion: string;
  learnerId: string;
  domainId: string;
  currentLevel?: string;
  currentLearningGoal?: string;
  masteredSkills?: string[];
  weakSkills?: string[];
  skillStates: {
    skillId: string;
    mastery: number;
    exposureCount?: number;
    correctCount?: number;
    mistakeCount?: number;
    lastPracticedAt?: string;
  }[];
  recentMistakes?: {
    timestamp?: string;
    conceptId: string;
    skillId: string;
    eventId?: string;
    severity?: string;
  }[];
}
