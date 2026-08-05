/**
 * M4 gate (D1/C2) — graded-evaluator harness + mapping.
 *
 * Verifies the accuracy scorer and its pass/fail gate, the offline heuristic
 * model, the LLM-graded evaluator's mapping onto EvaluationResult, the
 * closed-vs-open routing, and the policy engine's handling of a
 * `partially_correct` verdict. The model under test is mocked — a real-LLM
 * accuracy run needs an API key and is a manual/keyed step (run scoreGradingAccuracy
 * with a live GradingModel).
 */
import { describe, it, expect } from "vitest";
import {
  scoreGradingAccuracy,
  DEFAULT_ACCURACY_BAR,
  type GradingCase,
} from "../../platform/eval/gradedAccuracy";
import {
  HeuristicGradingModel,
  LlmGradedEvaluator,
  makeCourseLearningEvaluator,
  type GradingModel,
  type GradingVerdict,
} from "../../domains/course_learning/gradedEvaluator";
import { decideIntervention } from "../../platform/policy/InterventionPolicyEngine";
import type { CoachingPolicy } from "../../contracts/index";
import { MEMORY_LESSON_CASES } from "./dataset";

/** A grader that reproduces the labels exactly — the "perfect" upper bound. */
function perfectModel(cases: GradingCase[]): GradingModel {
  const byAnswer = new Map(cases.map((c) => [c.answer, c.expected]));
  return {
    async grade(req) {
      return { correctness: byAnswer.get(req.learnerAnswer) ?? "incorrect", confidence: 0.9, rationale: "mock" };
    },
  };
}

/** A grader that always says "correct" — should fail the bar. */
const alwaysCorrect: GradingModel = {
  async grade() {
    return { correctness: "correct", confidence: 0.9, rationale: "mock" };
  },
};

const policy = (over: Partial<CoachingPolicy> = {}): CoachingPolicy =>
  ({
    maxHintLevel: 4,
    questioningStyle: "mixed",
    feedbackStyle: "mixed",
    interruptionTolerance: "medium",
    ...over,
  }) as CoachingPolicy;

describe("graded-accuracy harness", () => {
  it("scores a perfect grader at 1.0 and passes the bar", async () => {
    const report = await scoreGradingAccuracy(MEMORY_LESSON_CASES, perfectModel(MEMORY_LESSON_CASES));
    expect(report.total).toBe(MEMORY_LESSON_CASES.length);
    expect(report.accuracy).toBe(1);
    expect(report.passed).toBe(true);
    expect(report.mismatches).toEqual([]);
  });

  it("fails the bar for a degenerate always-correct grader", async () => {
    const report = await scoreGradingAccuracy(MEMORY_LESSON_CASES, alwaysCorrect);
    const labeledCorrect = MEMORY_LESSON_CASES.filter((c) => c.expected === "correct").length;
    expect(report.accuracy).toBeCloseTo(labeledCorrect / MEMORY_LESSON_CASES.length, 5);
    expect(report.accuracy).toBeLessThan(DEFAULT_ACCURACY_BAR);
    expect(report.passed).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });

  it("runs the offline heuristic model end-to-end and reports a well-formed result", async () => {
    const report = await scoreGradingAccuracy(MEMORY_LESSON_CASES, new HeuristicGradingModel());
    expect(report.total).toBe(MEMORY_LESSON_CASES.length);
    const summed =
      report.byLabel.correct.total + report.byLabel.partially_correct.total + report.byLabel.incorrect.total;
    expect(summed).toBe(MEMORY_LESSON_CASES.length);
    expect(report.accuracy).toBeGreaterThanOrEqual(0);
    expect(report.accuracy).toBeLessThanOrEqual(1);
  });
});

describe("LlmGradedEvaluator mapping", () => {
  it("maps a graded verdict onto EvaluationResult (partialCredit + rationale + severity)", async () => {
    const verdict: GradingVerdict = {
      correctness: "partially_correct",
      confidence: 0.55,
      partialCredit: 0.6,
      rationale: "Got the what, missed the why.",
    };
    const model: GradingModel = { async grade() { return verdict; } };
    const evaluator = new LlmGradedEvaluator(model);
    const result = await evaluator.evaluate(null, {
      questionId: "q1",
      question: "Why does spacing work?",
      answer: "You review with gaps.",
      referenceAnswer: "Spacing works via the spacing effect.",
      conceptIds: ["concept.spaced_repetition"],
      skillIds: ["skill.recall"],
    });
    expect(result.correctness).toBe("partially_correct");
    expect(result.severity).toBe("moderate");
    expect(result.partialCredit).toBe(0.6);
    expect(result.rationale).toBe("Got the what, missed the why.");
    expect(result.bestAction).toBe("Spacing works via the spacing effect.");
    expect(result.conceptIds).toEqual(["concept.spaced_repetition"]);
  });
});

describe("makeCourseLearningEvaluator routing", () => {
  it("routes a closed QuizAction to deterministic exact-match (no model needed)", async () => {
    const evaluator = makeCourseLearningEvaluator();
    const result = await evaluator.evaluate(null, {
      questionId: "q1",
      answer: "Paris",
      correctAnswer: "paris",
      conceptIds: ["concept.geo"],
    });
    expect(result.correctness).toBe("correct");
    expect(result.confidence).toBe(1);
  });

  it("throws on an open-ended action when no model is configured", async () => {
    const evaluator = makeCourseLearningEvaluator();
    await expect(
      evaluator.evaluate(null, { questionId: "q1", question: "Explain X", answer: "..." }),
    ).rejects.toThrow(/requires a GradingModel/);
  });

  it("routes an open-ended action to the graded model when configured", async () => {
    const evaluator = makeCourseLearningEvaluator({ model: new HeuristicGradingModel() });
    const result = await evaluator.evaluate(null, {
      questionId: "q1",
      question: "Explain working memory capacity.",
      answer: "It holds about four chunks.",
      referenceAnswer: "Working memory holds about four chunks.",
      conceptIds: ["concept.working_memory"],
    });
    expect(["correct", "partially_correct", "incorrect"]).toContain(result.correctness);
    expect(result.rationale).toBeTruthy();
  });
});

describe("policy engine handles partially_correct", () => {
  it("responds (not silent) with a gentle nudge/question", () => {
    const decision = decideIntervention({
      evaluation: {
        correctness: "partially_correct",
        confidence: 0.8,
        conceptIds: [],
        skillIds: [],
        severity: "moderate",
      },
      policy: policy(),
    });
    expect(decision.shouldRespond).toBe(true);
    expect(["nudge", "question"]).toContain(decision.responseType);
  });

  it("leads with a question when the graded verdict is low-confidence", () => {
    const decision = decideIntervention({
      evaluation: {
        correctness: "partially_correct",
        confidence: 0.4,
        conceptIds: [],
        skillIds: [],
        severity: "moderate",
      },
      policy: policy(),
    });
    expect(decision.responseType).toBe("question");
  });
});
