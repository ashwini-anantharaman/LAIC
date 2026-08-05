/**
 * Zone 3 — the course_learning domain (Brain Bee / MindAI Bee tutoring, M3/C4).
 *
 * A minimal, non-bridge domain that proves the generalizable tutor path. It
 * ships a rule-based evaluator, a lesson KnowledgeScope, and points at the
 * bundled course-learning knowledge fixture. (The LLM-graded evaluator and
 * platform-backed knowledge are the M4 upgrade — same shapes, different guts.)
 */
import type { KnowledgeScope } from "../../contracts/index";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/index";
import { CourseQuizEvaluator, type QuizAction } from "./evaluator";

export const COURSE_LEARNING_DOMAIN_ID = "course_learning";

export { CourseQuizEvaluator, type QuizAction };
export {
  LlmGradedEvaluator,
  HeuristicGradingModel,
  makeCourseLearningEvaluator,
  type GradingModel,
  type GradingRequest,
  type GradingVerdict,
  type GradedQuizAction,
  type GradedCorrectness,
} from "./gradedEvaluator";
export { LlmGradingModel, type LlmGradingModelOptions } from "./llmGradingModel";

/** A lesson-scoped KnowledgeScope for the sample "memory" lesson. */
export function memoryLessonScope(): KnowledgeScope {
  return {
    schemaVersion: CONTRACTS_SCHEMA_VERSION,
    id: "ks.course.memory_lesson",
    domainId: COURSE_LEARNING_DOMAIN_ID,
    allowedKnowledgePackageIds: ["course_learning_sample_v1"],
    allowedConceptIds: ["concept.memory_consolidation", "concept.spaced_repetition"],
    allowedSkillIds: ["skill.recall"],
    forbiddenConceptIds: [],
    instructionalLevel: "beginner",
    sourcePolicy: { sourceBoundOnly: true, allowGeneralBackground: false, requireCitations: true },
  };
}
