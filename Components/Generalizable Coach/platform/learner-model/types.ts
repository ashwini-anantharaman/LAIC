/**
 * Zone 1 — Platform core: learner model types.
 * Domain-agnostic. Skill/concept IDs are opaque strings supplied by domains.
 */
import type { FeedbackStyle, ExplanationDepth } from "../types/index.js";

export type Mastery =
  | "not_started"
  | "introduced"
  | "practicing"
  | "proficient"
  | "mastered";

export interface SkillState {
  skillId: string;
  mastery: Mastery;
  exposureCount: number;
  correctCount: number;
  mistakeCount: number;
  lastPracticedAt: string;
}

export interface MistakeRecord {
  timestamp: string;
  conceptId: string;
  skillId: string;
  eventId: string;
  severity: string;
}

export interface DomainLearnerState {
  /** e.g., "beginner_1" */
  currentLevel: string;
  currentLearningGoal: string;
  skillStates: SkillState[];
  /** most recent first, capped at 20 */
  recentMistakes: MistakeRecord[];
  sessionsCompleted: number;
  lastSessionAt: string;
}

export interface LearnerProfile {
  learnerId: string;
  name: string;
  createdAt: string;
  preferences: {
    feedbackStyle: FeedbackStyle;
    explanationDepth: ExplanationDepth;
  };
  domains: { [domainId: string]: DomainLearnerState };
}
