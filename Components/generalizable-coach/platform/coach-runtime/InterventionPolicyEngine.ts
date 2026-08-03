/**
 * Zone 1 — Platform core: intervention policy engine.
 *
 * Decides WHETHER the coach should respond and at WHAT hint level, given the
 * evaluation result, the learner's coaching policy, and their recent mistakes.
 * Sits between the evaluator and the LLM response generator. Domain-agnostic.
 */
import type {
  EvaluationResult,
  CoachingPolicy,
  CoachResponseType,
  HintLevel,
} from "../types/index";
import type { MistakeRecord } from "../learner-model/index";

export interface InterventionDecision {
  shouldRespond: boolean;
  responseType: CoachResponseType;
  hintLevel: HintLevel;
  /** for logging, not learner-facing */
  reason: string;
}

export interface InterventionInput {
  evaluationResult: EvaluationResult;
  coachingPolicy: CoachingPolicy;
  recentMistakes: MistakeRecord[];
  /** 0 if no hint has been shown yet at this decision point */
  currentHintLevel: number;
  /** true if the learner tapped the hint button */
  hintRequested: boolean;
}

const RECENT_WINDOW = 5;

function clampLevel(level: number, maxHintLevel: HintLevel): HintLevel {
  const capped = Math.min(Math.max(level, 1), maxHintLevel);
  return capped as HintLevel;
}

/** Is any concept from this evaluation present in recent mistakes? */
function isRepeatedConcept(
  result: EvaluationResult,
  recentMistakes: MistakeRecord[],
): boolean {
  const recent = recentMistakes.slice(0, RECENT_WINDOW);
  return result.conceptIds.some((cid) =>
    recent.some((m) => m.conceptId === cid),
  );
}

export class InterventionPolicyEngine {
  decide(input: InterventionInput): InterventionDecision {
    const {
      evaluationResult,
      coachingPolicy,
      recentMistakes,
      currentHintLevel,
      hintRequested,
    } = input;
    const { maxHintLevel } = coachingPolicy;

    // 1. Explicit hint request always responds and escalates.
    if (hintRequested) {
      const nextLevel =
        currentHintLevel === 0 ? 1 : currentHintLevel + 1;
      const hintLevel = clampLevel(nextLevel, maxHintLevel);
      return {
        shouldRespond: true,
        responseType: "hint",
        hintLevel,
        reason:
          currentHintLevel === 0
            ? "Learner requested a hint — starting at level 1."
            : `Learner requested more help — escalating to level ${hintLevel}.`,
      };
    }

    const { correctness, severity } = evaluationResult;

    // 2. Correct — stay silent (log for potential postmortem praise).
    if (correctness === "correct") {
      return {
        shouldRespond: false,
        responseType: "silent",
        hintLevel: 1,
        reason: "Correct action — no intervention; logged for postmortem praise.",
      };
    }

    // 3. Acceptable + minor — don't interrupt for a minor variation.
    if (correctness === "acceptable" && severity === "minor") {
      return {
        shouldRespond: false,
        responseType: "silent",
        hintLevel: 1,
        reason: "Acceptable minor variation — no interruption.",
      };
    }

    const repeated = isRepeatedConcept(evaluationResult, recentMistakes);

    // Build the "natural" decision, then apply the postmortem override below.
    let decision: InterventionDecision;

    if (correctness === "suboptimal" || correctness === "partially_correct") {
      // 4. Suboptimal / partially-correct (graded, M4) — gentle path; escalate
      //    if the same concept was recently missed.
      if (repeated) {
        decision = {
          shouldRespond: true,
          responseType: "hint",
          hintLevel: clampLevel(2, maxHintLevel),
          reason: "Repeated suboptimal choice on this concept — level 2 hint.",
        };
      } else {
        decision = {
          shouldRespond: true,
          responseType: "nudge",
          hintLevel: clampLevel(1, maxHintLevel),
          reason: "First-time suboptimal choice — gentle nudge.",
        };
      }
    } else {
      // 5. Incorrect — level scales with severity and repetition.
      if (severity === "critical" || severity === "major") {
        const base = repeated ? 3 : 2;
        decision = {
          shouldRespond: true,
          responseType: "hint",
          hintLevel: clampLevel(base, maxHintLevel),
          reason: repeated
            ? `Repeated ${severity} error on this concept — level ${clampLevel(3, maxHintLevel)} hint.`
            : `${severity} error — level 2 hint.`,
        };
      } else if (severity === "moderate") {
        decision = {
          shouldRespond: true,
          responseType: "hint",
          hintLevel: clampLevel(1, maxHintLevel),
          reason: "Moderate error — level 1 hint.",
        };
      } else {
        decision = {
          shouldRespond: true,
          responseType: "nudge",
          hintLevel: clampLevel(1, maxHintLevel),
          reason: "Minor error — gentle nudge.",
        };
      }
    }

    // 7. Postmortem preference: for non-critical issues, save instead of
    // interrupting in real time (only when we were otherwise going to respond).
    if (
      coachingPolicy.saveForPostmortemWhenPossible &&
      severity !== "critical" &&
      decision.shouldRespond
    ) {
      return {
        shouldRespond: false,
        responseType: "postmortem_note",
        hintLevel: decision.hintLevel,
        reason: "Saved for postmortem (policy: saveForPostmortemWhenPossible).",
      };
    }

    return decision;
  }
}
