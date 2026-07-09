/**
 * Zone 1 — Platform core: the embeddable coach facade.
 *
 * `createCoreCoachSession()` is the domain-agnostic entry point. A domain (or a
 * host) supplies a fully-built `CoachCore` — runtime, learner store, session
 * engine, knowledge retriever — and a `domainId`; the facade owns the learner
 * profile + session lifecycle and exposes a tiny event-driven surface:
 *
 *   const coach = createCoreCoachSession({
 *     learnerId: "S", domainId: "my_domain", coach: buildMyCoach(),
 *   });
 *   const detach = coach.attach(myEventSource);   // host maps its events in
 *   coach.on(s => render(s));                      // suggestions come out
 *   await coach.requestHint();                     // learner asked for help
 *
 * It is framework-agnostic (no React/DOM) and browser-safe by default: with no
 * `llm` injected it uses the offline HeuristicLLM, so it never touches the
 * network or process.env. It contains NO domain-specific code — each domain
 * ships its own thin convenience wrapper (see the bridge domain's
 * createBridgeCoachSession) that supplies its coach, oracle, and persona.
 */
import type { AdaptiveCoachRuntime } from "../coach-runtime/index.js";
import type { LearnerStore } from "../learner-model/index.js";
import type { KnowledgeRetriever } from "../knowledge/index.js";
import type { SessionEngine } from "../session/index.js";
import type {
  ActivityEvent,
  AdaptiveCoachResponse,
  EvaluationResult,
  FeedbackStyle,
  ExplanationDepth,
} from "../types/index.js";
import type { LLMLike } from "../llm/index.js";
import { HeuristicLLM } from "./HeuristicLLM.js";
import { buildChatPrompt, scoreChunks } from "./chat.js";
import { HybridRetriever, type EmbeddingProvider } from "../knowledge/embeddings.js";
import { generatePostmortem, type Postmortem } from "../common-coach/index.js";
import type {
  CoachSuggestion,
  SuggestionListener,
  EventSource,
} from "./ports.js";

/**
 * The domain-built engine the facade drives. Any domain's composition root
 * (e.g. buildBridgeCoach) returns an object of this shape.
 */
export interface CoachCore {
  runtime: AdaptiveCoachRuntime;
  learnerStore: LearnerStore;
  sessionEngine: SessionEngine;
  knowledgeRetriever: KnowledgeRetriever;
}

export interface CoreCoachSessionOptions {
  /** the learner/seat being coached, e.g. "S" for South */
  learnerId: string;
  learnerName?: string;
  /** the domain this session runs in, e.g. "bridge_gameplay" */
  domainId: string;
  /** the domain-built coaching engine (required — the facade builds nothing). */
  coach: CoachCore;
  feedbackStyle?: FeedbackStyle;
  explanationDepth?: ExplanationDepth;
  /**
   * Inject a real model client (or a proxy) to get model-authored text.
   * Omit for the zero-config offline default (HeuristicLLM).
   */
  llm?: LLMLike;
  /** system-prompt persona for free-form chat, e.g. "an adaptive bridge coach". */
  chatPersona?: string;
  /**
   * Optional embeddings provider. When supplied, free-form chat grounds on a
   * hybrid keyword+embedding retrieval instead of keyword-only. Omit for the
   * zero-config keyword default.
   */
  embedder?: EmbeddingProvider;
  /**
   * Emit "silent" turns to listeners too (default false). Useful if the UI
   * wants to show "✓ good, no comment" feedback rather than only speak up on
   * mistakes.
   */
  emitSilent?: boolean;
}

/** Answer to an interactive question: the coach's message + the evaluation behind it. */
export interface CoachAnswer {
  message: string;
  evaluation: EvaluationResult;
  response: AdaptiveCoachResponse;
}

/** Reply to a free-form chat question. */
export interface ChatReply {
  message: string;
  /** true when a real model produced the text (vs. offline fallback) */
  fromModel: boolean;
}

export interface CoachSession {
  readonly sessionId: string;
  readonly learnerId: string;
  readonly domainId: string;
  /** the underlying coach engine (escape hatch for advanced hosts). */
  readonly coach: CoachCore;

  /** Feed one already-translated activity event; returns the suggestion. */
  observe(
    event: ActivityEvent<unknown>,
    gameState: unknown,
  ): Promise<CoachSuggestion>;
  /**
   * Ask the coach about a hypothetical action ("what should I do?",
   * "what about X?"). Read-only: evaluates and explains without touching the
   * learner model. Returns the evaluation + a learner-facing message.
   */
  probe(
    event: ActivityEvent<unknown>,
    gameState: unknown,
  ): Promise<CoachAnswer>;
  /**
   * Free-form question answered by the injected LLM, grounded in the supplied
   * activity context + keyword-retrieved knowledge chunks. Requires a real
   * `llm` — with the offline default it returns a polite capability note.
   */
  chat(question: string, activityContext?: unknown): Promise<ChatReply>;
  /** True when a real LLM was injected (chat is fully available). */
  readonly hasModel: boolean;
  /** End-of-session review built from the session's logs + weak skills. */
  postmortem(): Postmortem;
  /** Attach a host EventSource; returns a detach function. */
  attach(source: EventSource): () => void;
  /** Subscribe to suggestions; returns an unsubscribe function. */
  on(listener: SuggestionListener): () => void;
  /** Request / escalate a hint at the current decision point. */
  requestHint(): Promise<CoachSuggestion>;
  /** All suggestions so far (including silent ones). */
  history(): readonly CoachSuggestion[];
  /** Clear the in-memory suggestion history. */
  clear(): void;
}

export function createCoreCoachSession(
  opts: CoreCoachSessionOptions,
): CoachSession {
  const { domainId, coach } = opts;
  const llm: LLMLike = opts.llm ?? new HeuristicLLM();
  const hasModel = Boolean(opts.llm);
  // When an embedder is injected, chat grounds on hybrid retrieval; the chunk
  // embeddings are cached in this retriever for the session's lifetime.
  const hybrid = opts.embedder
    ? new HybridRetriever([...coach.knowledgeRetriever.allChunks()], opts.embedder)
    : null;

  // A learner profile is required before any event is processed.
  if (!coach.learnerStore.getProfile(opts.learnerId)) {
    coach.learnerStore.createProfile(opts.learnerId, opts.learnerName ?? opts.learnerId, {
      feedbackStyle: opts.feedbackStyle ?? "gentle",
      explanationDepth: opts.explanationDepth ?? "short",
    });
  }

  // Start a session so the runtime's session logging has somewhere to write.
  const session = coach.sessionEngine.startSession(opts.learnerId, domainId);
  const sessionId = session.sessionId;

  const listeners = new Set<SuggestionListener>();
  const suggestions: CoachSuggestion[] = [];
  let seq = 0;

  const publish = (
    event: ActivityEvent<unknown>,
    response: AdaptiveCoachResponse,
  ): CoachSuggestion => {
    const suggestion: CoachSuggestion = {
      seq: seq++,
      actorId: event.actorId,
      event,
      response,
      type: response.type,
    };
    suggestions.push(suggestion);
    if (response.type !== "silent" || opts.emitSilent) {
      for (const fn of listeners) fn(suggestion);
    }
    return suggestion;
  };

  const observe = async (
    event: ActivityEvent<unknown>,
    gameState: unknown,
  ): Promise<CoachSuggestion> => {
    const response = await coach.runtime.processEvent(event, gameState);
    return publish(event, response);
  };

  return {
    sessionId,
    learnerId: opts.learnerId,
    domainId,
    coach,
    observe,
    async probe(event: ActivityEvent<unknown>, gameState: unknown): Promise<CoachAnswer> {
      const { evaluation, response } = await coach.runtime.probe(event, gameState);
      return { evaluation, response, message: response.message ?? "" };
    },
    hasModel,
    postmortem(): Postmortem {
      const s = coach.sessionEngine.getSession(sessionId);
      if (!s) {
        return {
          sessionId,
          summary: "No session data available.",
          actionsCount: 0,
          interventionsCount: 0,
          coachedConcepts: [],
          byType: {},
          suggestions: [],
        };
      }
      const weak = coach.learnerStore.getWeakSkills(opts.learnerId, domainId);
      return generatePostmortem(s, weak);
    },
    async chat(question: string, activityContext?: unknown): Promise<ChatReply> {
      if (!hasModel) {
        return {
          message:
            "Free-form questions need a model — add an API key in the coach settings. Offline I can still recommend moves and compare a specific answer.",
          fromModel: false,
        };
      }
      const commonCoachPackage = coach.learnerStore.getCommonCoachPackage(
        opts.learnerId,
        domainId,
      );
      const retrievedChunks = hybrid
        ? await hybrid.retrieve(question)
        : scoreChunks(question, [...coach.knowledgeRetriever.allChunks()]);
      const prompt = buildChatPrompt({
        question,
        commonCoachPackage,
        retrievedChunks,
        activityContext,
        persona: opts.chatPersona,
      });
      const result = await llm.generateCoachResponse(prompt);
      if (!result.fromModel) {
        // Don't serve heuristic coaching phrasing as a chat answer — say
        // plainly that the model call failed and why.
        return {
          message: `The model call failed${result.error ? ` (${result.error})` : ""} — check the API key, network, and browser console.`,
          fromModel: false,
        };
      }
      return { message: result.text, fromModel: true };
    },
    attach(source: EventSource) {
      return source.subscribe((event, gameState) => {
        // Fire-and-forget: hosts get results via on(); errors never crash the host.
        void observe(event, gameState).catch(() => {});
      });
    },
    on(listener: SuggestionListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async requestHint() {
      const event: ActivityEvent<unknown> = {
        eventId: `hint-${seq}-${Date.now()}`,
        domainId,
        eventType: "hint_requested",
        timestamp: new Date().toISOString(),
        sessionId,
        actorId: opts.learnerId,
        action: {},
      };
      const response = await coach.runtime.processEvent(event, null);
      return publish(event, response);
    },
    history: () => suggestions,
    clear: () => {
      suggestions.length = 0;
    },
  };
}
