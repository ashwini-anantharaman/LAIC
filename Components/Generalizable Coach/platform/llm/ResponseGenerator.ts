/**
 * Zone 1 — Platform core: turns an intervention decision + context into a
 * learner-facing AdaptiveCoachResponse. Skips the LLM entirely for silent
 * decisions and postmortem saves.
 */
import type {
  AdaptiveCoachResponse,
  CommonCoachPackage,
  EvaluationResult,
  KnowledgeChunk,
} from "../types/index.js";
import type { InterventionDecision } from "../coach-runtime/InterventionPolicyEngine.js";
import { PromptBuilder, type BuiltPrompt, type PromptStrategy } from "./PromptBuilder.js";
import type { LLMResult } from "./LLMClient.js";

/** Anything that can produce a coach message from a prompt. */
export interface LLMLike {
  generateCoachResponse(prompt: BuiltPrompt): Promise<LLMResult>;
}

export interface GenerateInput {
  commonCoachPackage: CommonCoachPackage;
  evaluationResult: EvaluationResult;
  retrievedChunks: KnowledgeChunk[];
  interventionDecision: InterventionDecision;
  activityContext: any;
}

export class ResponseGenerator {
  private readonly promptBuilder: PromptStrategy;

  constructor(
    private readonly llm: LLMLike,
    promptBuilder?: PromptStrategy,
  ) {
    this.promptBuilder = promptBuilder ?? new PromptBuilder();
  }

  async generate(input: GenerateInput): Promise<AdaptiveCoachResponse> {
    const { interventionDecision: decision, evaluationResult: evalResult } =
      input;

    const metadata = {
      relatedConceptIds: evalResult.conceptIds,
      relatedSkillIds: evalResult.skillIds,
      sourceChunkIds: input.retrievedChunks.map((c) => c.chunkId),
    };

    // No LLM call for silent decisions.
    if (!decision.shouldRespond) {
      if (decision.responseType === "postmortem_note") {
        return {
          type: "postmortem_note",
          metadata: { ...metadata, savedForPostmortem: true },
        };
      }
      return { type: "silent" };
    }

    const prompt = this.promptBuilder.build({
      commonCoachPackage: input.commonCoachPackage,
      evaluationResult: input.evaluationResult,
      retrievedChunks: input.retrievedChunks,
      interventionDecision: decision,
      activityContext: input.activityContext,
    });

    const result = await this.llm.generateCoachResponse(prompt);

    return {
      type: decision.responseType,
      level: decision.hintLevel,
      message: result.text,
      metadata,
    };
  }
}
