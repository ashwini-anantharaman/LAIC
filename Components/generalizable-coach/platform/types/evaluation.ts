/**
 * Zone 2 — Domain Contracts: evaluator interface and result shape.
 *
 * A domain evaluator judges a learner action against domain rules and
 * returns a machine-readable EvaluationResult. It never produces
 * learner-facing text — that is the LLM's job downstream.
 */

export type Correctness =
  | "correct"
  | "acceptable"
  | "partially_correct"
  | "suboptimal"
  | "incorrect";

export type Severity = "minor" | "moderate" | "major" | "critical";

export interface EvaluationResult {
  correctness: Correctness;
  /** 0–1 */
  confidence: number;
  bestAction?: unknown;
  alternativeActions?: unknown[];
  /** which concepts are involved */
  conceptIds: string[];
  /** which skills are tested */
  skillIds: string[];
  /** machine-readable reason, not learner-facing */
  explanation?: string;
  severity: Severity;
  /**
   * Graded variant (M4/D1): fraction of credit for an open-ended answer, 0–1.
   * Present only for graded (LLM) evaluations; absent for deterministic ones.
   */
  partialCredit?: number;
  /** Graded variant: the grader's transparency rationale (machine-readable). */
  rationale?: string;
}

export interface EvaluatorContract<TState, TAction> {
  evaluate(state: TState, action: TAction): Promise<EvaluationResult>;
}
