/**
 * Zone 3 — course_learning domain: a RULE-BASED quiz evaluator (M3/C4).
 *
 * Deliberately deterministic (exact-match), NOT the LLM-graded open-ended
 * evaluator — that is the high-risk M4 work. This proves the tutor path on a
 * real second (non-bridge) domain using only safe machinery.
 */
import type { EvaluatorContract, EvaluationResult } from "../../platform/types/index";

export interface QuizAction {
  questionId: string;
  answer: string;
  correctAnswer: string;
  conceptIds?: string[];
  skillIds?: string[];
}

const norm = (s: string): string => s.trim().toLowerCase();

export class CourseQuizEvaluator implements EvaluatorContract<unknown, QuizAction> {
  async evaluate(_state: unknown, action: QuizAction): Promise<EvaluationResult> {
    const correct = norm(action.answer) === norm(action.correctAnswer);
    return {
      correctness: correct ? "correct" : "incorrect",
      confidence: 1,
      bestAction: action.correctAnswer,
      conceptIds: action.conceptIds ?? [],
      skillIds: action.skillIds ?? [],
      explanation: correct
        ? "Answer matches the expected response."
        : `Expected "${action.correctAnswer}".`,
      severity: correct ? "minor" : "major",
    };
  }
}
