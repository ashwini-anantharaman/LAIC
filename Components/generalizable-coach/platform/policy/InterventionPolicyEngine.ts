/**
 * Zone 1 — Platform core: the config-driven intervention decision (LAIC §9, M2/B2).
 *
 * Deterministic, NO LLM. This is where configuration becomes *behavior*: the
 * resolved CoachingPolicy's questioningStyle / feedbackStyle / interruption
 * tolerance / hint ceiling decide WHETHER to respond and at WHAT level/form.
 * Consumes the M0 `CoachingPolicy` (hint levels 0–5).
 *
 * (The Phase-1 bridge InterventionPolicyEngine still exists for the bridge
 * runtime; this is the canonical M0-aligned engine going forward.)
 */
import type { CoachingPolicy } from "../../contracts/index.js";
import type { EvaluationResult } from "../types/index.js";

export type ResponseType =
  | "silent"
  | "nudge"
  | "question"
  | "hint"
  | "explanation"
  | "save_for_postmortem";

export interface InterventionDecision {
  shouldRespond: boolean;
  responseType: ResponseType;
  /** 0–5; 0 means no reveal */
  hintLevel: number;
  reason: string;
}

export interface DecideInput {
  evaluation: EvaluationResult;
  policy: CoachingPolicy;
  currentHintLevel?: number;
  hintRequested?: boolean;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function decideIntervention(input: DecideInput): InterventionDecision {
  const { evaluation, policy } = input;
  const max = policy.maxHintLevel;
  const currentHintLevel = input.currentHintLevel ?? 0;
  const hintRequested = input.hintRequested ?? false;

  const socratic = policy.questioningStyle === "socratic" || policy.feedbackStyle === "socratic";
  const direct = policy.questioningStyle === "direct" || policy.feedbackStyle === "direct";
  const minimal = policy.feedbackStyle === "minimal";

  // 1. Explicit hint request always responds and escalates against the ceiling.
  if (hintRequested) {
    const next = currentHintLevel === 0 ? 1 : currentHintLevel + 1;
    const hintLevel = clamp(next, 0, max);
    // Socratic keeps early rungs in question form; direct/mixed reveal as hints.
    const responseType: ResponseType = socratic && hintLevel <= 1 ? "question" : "hint";
    return { shouldRespond: true, responseType, hintLevel, reason: `hint requested → level ${hintLevel}` };
  }

  const { correctness, severity } = evaluation;

  // 2. Correct / acceptable → stay silent.
  if (correctness === "correct" || correctness === "acceptable") {
    return { shouldRespond: false, responseType: "silent", hintLevel: 0, reason: "correct — no intervention" };
  }

  const severe = severity === "major" || severity === "critical";

  // 3. `minimal` feedback raises the bar: only interrupt for severe issues.
  if (minimal && !severe) {
    return { shouldRespond: false, responseType: "silent", hintLevel: 0, reason: "minimal feedback — below threshold" };
  }

  // 4. Low interruption tolerance defers non-critical issues to postmortem.
  if (policy.interruptionTolerance === "low" && severity !== "critical") {
    const base = severe ? 2 : 1;
    return {
      shouldRespond: false,
      responseType: "save_for_postmortem",
      hintLevel: clamp(base, 0, max),
      reason: "low interruption tolerance — saved for postmortem",
    };
  }

  // 5. Base severity level, then shape by questioning style.
  const base = severity === "critical" || severity === "major" ? 2 : 1;

  if (socratic) {
    // Question-form, capped low — lead the learner, don't reveal.
    return {
      shouldRespond: true,
      responseType: "question",
      hintLevel: clamp(Math.min(base, 1), 0, max),
      reason: "socratic — question-form nudge",
    };
  }
  if (direct) {
    return {
      shouldRespond: true,
      responseType: "hint",
      hintLevel: clamp(base, 0, max),
      reason: `direct — level ${clamp(base, 0, max)} hint`,
    };
  }
  // mixed
  const level = clamp(base, 0, max);
  return {
    shouldRespond: true,
    responseType: level <= 1 ? "nudge" : "hint",
    hintLevel: level,
    reason: `mixed — level ${level}`,
  };
}
