/**
 * Zone 1 — Platform core: the lightweight study-tutor (LAIC §C4, M3).
 *
 * Domain-neutral tutor built on safe, deterministic machinery: scope-bound Q&A
 * with citations (declines out-of-scope rather than hallucinating), quiz
 * feedback via a rule-based evaluator, and deterministic recommendations.
 * Every intervention is recorded to interaction memory and a full trace.
 *
 * Answer text is assembled from the retrieved chunks + citations (works offline
 * and is fully testable). An optional `phraser` (e.g. an LLM) may re-word it;
 * if it declines/returns null, the deterministic text stands.
 */
import type {
  ActivityEvent,
  CoachingPolicy,
  KnowledgeChunk,
  KnowledgeScope,
} from "../../contracts/index";
import type { EvaluationResult, EvaluatorContract } from "../types/index";
import { ScopedKnowledgeSource, type KnowledgeSource } from "../knowledge-source/index";
import type { InteractionMemory } from "../memory/index";
import type { TraceStore } from "../trace/index";
import { RecommendationEngine } from "../recommendation/index";
import type { Recommendation } from "../../contracts/index";
import type { CoachResponse } from "../adaptive/response";

export type Phraser = (ctx: {
  question?: string;
  chunks: KnowledgeChunk[];
}) => Promise<string | null>;

export interface StudyTutorOptions {
  learnerId: string;
  domainId: string;
  scope: KnowledgeScope;
  knowledgeSource: KnowledgeSource;
  evaluator?: EvaluatorContract<unknown, unknown>;
  memory?: InteractionMemory;
  traceStore?: TraceStore;
  recommender?: RecommendationEngine;
  policy?: CoachingPolicy;
  instanceId?: string;
  phraser?: Phraser;
  now?: () => string;
}

const OUT_OF_SCOPE =
  "That's outside what this lesson covers — try asking about the current topic.";

export class StudyTutor {
  private readonly source: KnowledgeSource;
  private readonly recommender: RecommendationEngine;
  private readonly now: () => string;

  constructor(private readonly opts: StudyTutorOptions) {
    // Every answer is bounded to the lesson's KnowledgeScope.
    this.source = new ScopedKnowledgeSource(opts.knowledgeSource, opts.scope);
    this.recommender = opts.recommender ?? new RecommendationEngine();
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  /** Scope-bound Q&A: cited answer if in scope, decline otherwise. */
  async ask(question: string): Promise<CoachResponse> {
    const chunks = await this.source.retrieve({ text: question, topK: 3 });

    let response: CoachResponse;
    if (chunks.length === 0) {
      response = { type: "declined", message: OUT_OF_SCOPE };
    } else {
      const deterministic = composeAnswer(chunks);
      const phrased = this.opts.phraser ? await this.opts.phraser({ question, chunks }) : null;
      response = { type: "explanation", message: phrased ?? deterministic, sources: chunks };
    }

    this.remember("learner", question);
    if (response.type !== "declined") this.remember("coach", response.message, "answer");
    this.trace({ sources: chunks.map((c) => c.id), output: response });
    return response;
  }

  /** Rule-based quiz feedback + deterministic recommendations. */
  async onQuizAttempt(
    event: ActivityEvent,
  ): Promise<{ evaluation: EvaluationResult; feedback: CoachResponse; recommendations: Recommendation[] }> {
    if (!this.opts.evaluator) throw new Error("StudyTutor.onQuizAttempt requires an evaluator.");
    const evaluation = await this.opts.evaluator.evaluate({}, event.action);

    let feedback: CoachResponse = { type: "silent" };
    let recommendations: Recommendation[] = [];

    if (evaluation.correctness !== "correct") {
      const chunks = await this.source.retrieve({ conceptIds: evaluation.conceptIds, topK: 2 });
      feedback =
        chunks.length > 0
          ? { type: "explanation", message: composeAnswer(chunks), sources: chunks }
          : { type: "nudge", message: "Not quite — review this topic and try again." };
      recommendations = this.recommender.generate({
        learnerId: event.actorId,
        domainId: event.domainId,
        eventId: event.eventId,
        eventType: event.eventType,
        evaluation,
        learningObjectId: (event.contextRefs as { learningObjectId?: string } | undefined)
          ?.learningObjectId,
      });
      this.remember("coach", feedback.message, "quiz_feedback");
    }

    this.trace({
      eventId: event.eventId,
      sources: feedback.type === "explanation" ? (feedback.sources ?? []).map((c) => c.id) : [],
      evaluatorOutput: evaluation,
      output: feedback,
    });
    return { evaluation, feedback, recommendations };
  }

  private remember(role: "learner" | "coach", text: string, kind?: string): void {
    this.opts.memory?.record({
      learnerId: this.opts.learnerId,
      domainId: this.opts.domainId,
      timestamp: this.now(),
      role,
      text,
      kind,
    });
  }

  private trace(partial: {
    eventId?: string;
    sources: string[];
    evaluatorOutput?: unknown;
    output: unknown;
  }): void {
    this.opts.traceStore?.append({
      learnerId: this.opts.learnerId,
      eventId: partial.eventId,
      instanceId: this.opts.instanceId,
      policyProvenance: this.opts.policy?.provenance,
      knowledgeScopeId: this.opts.scope.id,
      sources: partial.sources,
      evaluatorOutput: partial.evaluatorOutput,
      output: partial.output,
    });
  }
}

/** Deterministic, source-bound answer assembly with citations. */
function composeAnswer(chunks: KnowledgeChunk[]): string {
  return chunks
    .map((c) => (c.citation ? `${c.content} (${c.citation})` : c.content))
    .join(" ");
}
