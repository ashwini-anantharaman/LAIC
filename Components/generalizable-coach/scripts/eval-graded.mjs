/**
 * M4 · D3 gate runner — measure the graded evaluator's accuracy on the labeled
 * set and report whether it clears the bar.
 *
 *   npm run eval:graded              # real LLM if ANTHROPIC_API_KEY/OPENAI_API_KEY is set
 *
 * With a key it scores the real LlmGradingModel; without one it falls back to
 * the offline heuristic (illustrative only — NOT the gate). Exit code is 0 on
 * pass, 1 on fail, so CI can gate the D3 cutover on it.
 */
import { scoreGradingAccuracy } from "../platform/eval/gradedAccuracy.ts";
import { LlmGradingModel, HeuristicGradingModel } from "../domains/course_learning/index.ts";
import { MEMORY_LESSON_CASES } from "../tests/eval-harness/dataset.ts";

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
const model = hasKey ? new LlmGradingModel({}) : new HeuristicGradingModel();

console.log(
  hasKey
    ? "Scoring the REAL LlmGradingModel (this is the D3 gate)."
    : "No API key set — scoring the offline heuristic (illustrative only, NOT the gate).",
);

const report = await scoreGradingAccuracy(MEMORY_LESSON_CASES, model);
console.log(JSON.stringify(report, null, 2));
console.log(
  report.passed
    ? `\n\x1b[32mPASS\x1b[0m accuracy ${(report.accuracy * 100).toFixed(1)}% >= bar ${(report.bar * 100).toFixed(0)}%`
    : `\n\x1b[31mFAIL\x1b[0m accuracy ${(report.accuracy * 100).toFixed(1)}% < bar ${(report.bar * 100).toFixed(0)}%`,
);
if (!hasKey) {
  console.log("(Heuristic run — set an API key and re-run before treating this as the gate.)");
}
process.exit(report.passed ? 0 : 1);
