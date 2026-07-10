/**
 * Zone 3 — course_learning: the LLM-graded, open-ended evaluator (M4/D1).
 *
 * Design bet #1 holds: a grader decides correctness BEFORE any coaching text is
 * produced. For closed items the deterministic exact-match evaluator is enough;
 * for open-ended answers this asks a GradingModel for a structured verdict
 * (correct / partially_correct / incorrect + confidence + partialCredit +
 * rationale) and maps it onto the platform EvaluationResult the policy engine
 * already understands. The model is injected — a real LLM in production, a mock
 * in tests, or the offline HeuristicGradingModel when no key is configured.
 */
import type { EvaluatorContract, EvaluationResult, Severity } from "../../platform/types/index.js";
import { CourseQuizEvaluator, type QuizAction } from "./evaluator.js";

export type GradedCorrectness = "correct" | "partially_correct" | "incorrect";

export interface GradingRequest {
  question: string;
  learnerAnswer: string;
  referenceAnswer?: string;
  rubric?: string;
  conceptIds: string[];
}

export interface GradingVerdict {
  correctness: GradedCorrectness;
  /** 0–1 — how sure the grader is; a low value biases the coach toward a question. */
  confidence: number;
  /** 0–1 — fraction of credit for a partial answer. */
  partialCredit?: number;
  /** machine-readable transparency note (NOT learner-facing). */
  rationale: string;
}

/** The grading brain — injected so the evaluator stays testable and offline-capable. */
export interface GradingModel {
  grade(req: GradingRequest): Promise<GradingVerdict>;
}

/** An open-ended answer to grade (as opposed to a closed QuizAction with a fixed key). */
export interface GradedQuizAction {
  questionId: string;
  question: string;
  answer: string;
  referenceAnswer?: string;
  rubric?: string;
  conceptIds?: string[];
  skillIds?: string[];
}

const SEVERITY_BY_CORRECTNESS: Record<GradedCorrectness, Severity> = {
  correct: "minor",
  partially_correct: "moderate",
  incorrect: "major",
};

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export class LlmGradedEvaluator implements EvaluatorContract<unknown, GradedQuizAction> {
  constructor(private readonly model: GradingModel) {}

  async evaluate(_state: unknown, action: GradedQuizAction): Promise<EvaluationResult> {
    const verdict = await this.model.grade({
      question: action.question,
      learnerAnswer: action.answer,
      referenceAnswer: action.referenceAnswer,
      rubric: action.rubric,
      conceptIds: action.conceptIds ?? [],
    });

    const result: EvaluationResult = {
      correctness: verdict.correctness,
      confidence: clamp01(verdict.confidence),
      conceptIds: action.conceptIds ?? [],
      skillIds: action.skillIds ?? [],
      severity: SEVERITY_BY_CORRECTNESS[verdict.correctness],
      explanation: verdict.rationale,
      rationale: verdict.rationale,
    };
    if (action.referenceAnswer !== undefined) result.bestAction = action.referenceAnswer;
    if (verdict.partialCredit !== undefined) result.partialCredit = clamp01(verdict.partialCredit);
    return result;
  }
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "be", "it",
  "that", "this", "for", "on", "as", "with", "by", "from", "at", "you", "your",
]);

function contentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t)),
  );
}

/**
 * Offline, deterministic grader — content-word overlap against the reference
 * answer. NOT a substitute for a real LLM grader (it can't judge paraphrase or
 * reasoning); it keeps the graded path runnable with no API key and gives the
 * harness a stable baseline. Reports modest confidence to reflect that.
 */
export class HeuristicGradingModel implements GradingModel {
  async grade(req: GradingRequest): Promise<GradingVerdict> {
    if (!req.referenceAnswer?.trim()) {
      return {
        correctness: "partially_correct",
        confidence: 0.25,
        rationale: "No reference answer supplied — heuristic grader cannot judge; deferring.",
      };
    }
    const ref = contentTokens(req.referenceAnswer);
    const ans = contentTokens(req.learnerAnswer);
    if (!ref.size) {
      return { correctness: "partially_correct", confidence: 0.25, rationale: "Reference had no content words." };
    }
    let hit = 0;
    for (const t of ref) if (ans.has(t)) hit++;
    const overlap = hit / ref.size;
    const correctness: GradedCorrectness =
      overlap >= 0.7 ? "correct" : overlap >= 0.35 ? "partially_correct" : "incorrect";
    return {
      correctness,
      confidence: 0.5,
      partialCredit: clamp01(overlap),
      rationale: `Heuristic content-word overlap ${(overlap * 100).toFixed(0)}% vs reference.`,
    };
  }
}

/**
 * Route an action to the right evaluator: a closed QuizAction (has
 * `correctAnswer`) → deterministic exact-match; an open-ended GradedQuizAction
 * → the graded model. Enabling open-ended grading requires wiring a model
 * (the M4 feature-flag switch); without one, only closed items are supported.
 */
export function makeCourseLearningEvaluator(opts?: {
  model?: GradingModel;
}): EvaluatorContract<unknown, QuizAction | GradedQuizAction> {
  const exact = new CourseQuizEvaluator();
  const graded = opts?.model ? new LlmGradedEvaluator(opts.model) : null;

  return {
    async evaluate(state, action): Promise<EvaluationResult> {
      const isClosed = "correctAnswer" in action && typeof (action as QuizAction).correctAnswer === "string";
      if (isClosed) return exact.evaluate(state, action as QuizAction);
      if (!graded) {
        throw new Error(
          "makeCourseLearningEvaluator: open-ended action requires a GradingModel (none configured).",
        );
      }
      return graded.evaluate(state, action as GradedQuizAction);
    },
  };
}
