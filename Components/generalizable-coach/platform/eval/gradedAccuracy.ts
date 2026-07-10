/**
 * Zone 1 — Platform core: the graded-evaluator accuracy harness (M4/D1 gate).
 *
 * The LLM-graded course_learning evaluator does not become any course's default
 * until it clears an accuracy bar on a labeled set (architecture §14.3, plan C2).
 * This module scores a GradingModel against labeled cases and reports whether it
 * passes — the objective gate D3 checks, rather than a judgment call under
 * pressure. The scoring is deterministic; only the model under test may call an
 * LLM (a real run needs a key — see the harness test for the mock-model path).
 */
import type { GradingModel, GradedCorrectness } from "../../domains/course_learning/gradedEvaluator.js";

export interface GradingCase {
  id: string;
  question: string;
  answer: string;
  referenceAnswer?: string;
  rubric?: string;
  conceptIds?: string[];
  /** the human-labeled correct verdict */
  expected: GradedCorrectness;
}

export interface AccuracyReport {
  total: number;
  correct: number;
  accuracy: number;
  bar: number;
  passed: boolean;
  byLabel: Record<GradedCorrectness, { total: number; correct: number }>;
  mismatches: Array<{ id: string; expected: GradedCorrectness; got: GradedCorrectness }>;
}

/** The default bar for enabling the graded helper as a course default. Tune with evidence. */
export const DEFAULT_ACCURACY_BAR = 0.8;

function emptyByLabel(): AccuracyReport["byLabel"] {
  return {
    correct: { total: 0, correct: 0 },
    partially_correct: { total: 0, correct: 0 },
    incorrect: { total: 0, correct: 0 },
  };
}

/**
 * Run every case through the model and compare its verdict to the label.
 * Cases run sequentially to keep provider rate limits predictable; the set is
 * small by design.
 */
export async function scoreGradingAccuracy(
  cases: GradingCase[],
  model: GradingModel,
  bar: number = DEFAULT_ACCURACY_BAR,
): Promise<AccuracyReport> {
  const byLabel = emptyByLabel();
  const mismatches: AccuracyReport["mismatches"] = [];
  let correct = 0;

  for (const c of cases) {
    const verdict = await model.grade({
      question: c.question,
      learnerAnswer: c.answer,
      referenceAnswer: c.referenceAnswer,
      rubric: c.rubric,
      conceptIds: c.conceptIds ?? [],
    });
    byLabel[c.expected].total += 1;
    if (verdict.correctness === c.expected) {
      correct += 1;
      byLabel[c.expected].correct += 1;
    } else {
      mismatches.push({ id: c.id, expected: c.expected, got: verdict.correctness });
    }
  }

  const total = cases.length;
  const accuracy = total ? correct / total : 0;
  return { total, correct, accuracy, bar, passed: accuracy >= bar, byLabel, mismatches };
}
