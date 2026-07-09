/**
 * Zone 2 — Domain Contracts: the common coach context package and the
 * adaptive coach response. Both are domain-agnostic. Response schemas
 * assume mobile delivery: short messages, progressive disclosure.
 */

export type SkillLevel = "beginner" | "intermediate" | "advanced";
export type FeedbackStyle = "gentle" | "direct" | "socratic" | "minimal";
export type ExplanationDepth = "short" | "medium" | "deep";
export type InterruptionTolerance = "low" | "medium" | "high";

export type HintLevel = 1 | 2 | 3 | 4;

export interface LearnerPreferences {
  feedbackStyle: FeedbackStyle;
  explanationDepth: ExplanationDepth;
  interruptionTolerance: InterruptionTolerance;
}

/**
 * The universal learner-context package that any adaptive coach can consume.
 * Assembled by the learner model for a specific domain.
 */
export interface CommonCoachPackage {
  learner: {
    learnerId: string;
    skillLevel: SkillLevel;
    preferences: LearnerPreferences;
  };
  learningState: {
    currentDomainId: string;
    currentExperienceId: string;
    currentActivityId: string;
    currentLearningGoal: string;
    masteredSkills: string[];
    weakSkills: string[];
    recentMistakes: string[];
    recentFeedbackSummary: string;
  };
  coachingPolicy: CoachingPolicy;
}

export interface CoachingPolicy {
  maxHintLevel: HintLevel;
  allowDirectAnswer: boolean;
  allowRealTimeInterruption: boolean;
  saveForPostmortemWhenPossible: boolean;
}

export type CoachResponseType =
  | "silent"
  | "nudge"
  | "hint"
  | "explanation"
  | "warning"
  | "question"
  | "postmortem_note";

export interface AdaptiveCoachResponse {
  type: CoachResponseType;
  level?: HintLevel;
  /**
   * Keep short for mobile — under 200 chars for nudge/hint,
   * under 500 for explanation.
   */
  message?: string;
  metadata?: {
    relatedConceptIds?: string[];
    relatedSkillIds?: string[];
    sourceChunkIds?: string[];
    savedForPostmortem?: boolean;
  };
}
