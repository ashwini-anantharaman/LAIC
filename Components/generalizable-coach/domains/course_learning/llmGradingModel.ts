/**
 * Zone 3 — course_learning: the real-LLM GradingModel (M4/D1 tail).
 *
 * Wraps the platform LLMClient to turn an open-ended answer into a structured
 * GradingVerdict. Design bet #1 still holds: this produces the *verdict* (before
 * any coaching text), which the policy engine then acts on. Fails safe — if no
 * API key is configured, the model errors, or the reply isn't parseable JSON, it
 * falls back to the deterministic HeuristicGradingModel rather than throwing, so
 * the graded path never hard-blocks. This is the adapter the eval harness scores
 * against a real model (see scripts/eval-graded.mjs).
 */
import { LLMClient } from "../../platform/llm/LLMClient.js";
import {
  HeuristicGradingModel,
  type GradingModel,
  type GradingRequest,
  type GradingVerdict,
  type GradedCorrectness,
} from "./gradedEvaluator.js";

export interface LlmGradingModelOptions {
  /** Injectable client (tests/config); defaults to a fresh LLMClient. */
  client?: LLMClient;
  /** Fallback when the model is unavailable/unparseable. */
  fallback?: GradingModel;
}

const GRADE_SYSTEM =
  "You are a strict but fair grader of a learner's open-ended answer. Compare the " +
  "learner answer to the reference answer and rubric. Judge only conceptual correctness, " +
  "not spelling or phrasing. Return ONLY a JSON object, no prose, no markdown:\n" +
  '{"correctness":"correct"|"partially_correct"|"incorrect","confidence":0.0-1.0,' +
  '"partialCredit":0.0-1.0,"rationale":"one sentence, machine-readable"}';

function buildUser(req: GradingRequest): string {
  return [
    `Question: ${req.question}`,
    req.referenceAnswer ? `Reference answer: ${req.referenceAnswer}` : "Reference answer: (none provided)",
    req.rubric ? `Rubric: ${req.rubric}` : "",
    `Learner answer: ${req.learnerAnswer}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const CORRECTNESS: readonly GradedCorrectness[] = ["correct", "partially_correct", "incorrect"];
const clamp01 = (n: unknown): number => {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0.5;
  return Math.min(1, Math.max(0, x));
};

/** Extract the first balanced JSON object from a model reply. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

function parseVerdict(text: string): GradingVerdict | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  const correctness = obj.correctness as GradedCorrectness;
  if (!CORRECTNESS.includes(correctness)) return null;
  const verdict: GradingVerdict = {
    correctness,
    confidence: clamp01(obj.confidence),
    rationale: typeof obj.rationale === "string" && obj.rationale.trim() ? obj.rationale : "graded by LLM",
  };
  if (obj.partialCredit !== undefined) verdict.partialCredit = clamp01(obj.partialCredit);
  return verdict;
}

export class LlmGradingModel implements GradingModel {
  private readonly client: LLMClient;
  private readonly fallback: GradingModel;

  constructor(opts: LlmGradingModelOptions = {}) {
    this.client = opts.client ?? new LLMClient({ maxTokens: 400 });
    this.fallback = opts.fallback ?? new HeuristicGradingModel();
  }

  async grade(req: GradingRequest): Promise<GradingVerdict> {
    const result = await this.client.generateCoachResponse({ system: GRADE_SYSTEM, user: buildUser(req) });
    if (!result.fromModel) return this.fallback.grade(req); // no key / call failed
    return parseVerdict(result.text) ?? this.fallback.grade(req);
  }
}
