/**
 * Zone 1 — Platform core: assembles the LLM prompt for a coaching turn.
 *
 * Fully domain-agnostic. It stitches together the learner context, evaluation,
 * retrieved knowledge, and intervention decision into a neutral coaching prompt.
 * The activity context is passed through opaquely (serialized as JSON), so any
 * domain's fields reach the model without the platform knowing their shape.
 *
 * A domain that wants richer, hand-tailored phrasing implements its own
 * `PromptStrategy` and injects it into the ResponseGenerator (see the bridge
 * domain's BridgePromptBuilder). This default guarantees every domain — even a
 * brand-new one with no custom builder — gets a working, well-structured prompt.
 */
import type {
  CommonCoachPackage,
  EvaluationResult,
  KnowledgeChunk,
} from "../types/index";
import type { InterventionDecision } from "../coach-runtime/InterventionPolicyEngine";

export interface PromptInput {
  commonCoachPackage: CommonCoachPackage;
  evaluationResult: EvaluationResult;
  retrievedChunks: KnowledgeChunk[];
  interventionDecision: InterventionDecision;
  /** current activity/game state — opaque to the platform */
  activityContext: any;
}

export interface BuiltPrompt {
  system: string;
  user: string;
}

/** A domain may swap in its own prompt phrasing; this is the contract. */
export interface PromptStrategy {
  build(input: PromptInput): BuiltPrompt;
}

export const HINT_LADDER = `Hint discipline (never reveal more than the requested level):
- Nudge: 1–2 sentences. Ask a guiding question. Do not name the concept.
- Level 1: Ask a question that leads toward the concept. Do NOT name the answer.
- Level 2: Name the relevant concept or rule. Do NOT state the correct action.
- Level 3: Suggest the direction without the exact answer.
- Level 4: Explain the correct action and why. This is the most the coach reveals.
Never start at level 4 unless the learner explicitly requested maximum help.`;

/** Turn a chunk list into a compact bullet list for the prompt. */
export function chunkText(chunks: KnowledgeChunk[]): string {
  return chunks.length > 0
    ? chunks.map((c) => `- (${c.chunkType}) ${c.content}`).join("\n")
    : "(no specific teaching material retrieved)";
}

/** Neutral system header any domain can use. */
export function systemHeader(pkg: CommonCoachPackage, subject: string): string {
  const { skillLevel, preferences } = pkg.learner;
  const { currentLearningGoal } = pkg.learningState;
  return [
    `You are an adaptive coach for a learning app, coaching ${subject}.`,
    `The learner is at ${skillLevel} level. Their current goal is: ${currentLearningGoal || "general practice"}.`,
    `Coaching style: ${preferences.feedbackStyle}. Explanation depth: ${preferences.explanationDepth}.`,
    "",
    "IMPORTANT: Keep responses concise for mobile display.",
    HINT_LADDER,
  ].join("\n");
}

/**
 * The domain-neutral default. Emits the structured field markers the offline
 * HeuristicLLM parses ("Reason:", "recommended action is", "Related concepts:",
 * "Generate a … at hint level N"), plus a JSON dump of the activity context so
 * no domain detail is lost.
 */
export class PromptBuilder implements PromptStrategy {
  build(input: PromptInput): BuiltPrompt {
    const { evaluationResult: e, interventionDecision: d } = input;
    const recent = input.commonCoachPackage.learningState.recentMistakes;

    const user = [
      "The learner just took an action. Current activity context:",
      JSON.stringify(input.activityContext ?? {}, null, 1),
      "",
      `Evaluation: ${e.correctness}, the recommended action is ${String(e.bestAction ?? "?")}.`,
      `Reason: ${e.explanation ?? ""}`,
      `Related concepts: ${e.conceptIds.join(", ")}`,
      "",
      "Relevant teaching material:",
      chunkText(input.retrievedChunks),
      "",
      `Learner's recent mistakes: ${recent.length ? recent.join(", ") : "none"}`,
      "",
      `Generate a ${d.responseType} at hint level ${d.hintLevel}.`,
    ].join("\n");

    return {
      system: systemHeader(input.commonCoachPackage, "this activity"),
      user,
    };
  }
}
