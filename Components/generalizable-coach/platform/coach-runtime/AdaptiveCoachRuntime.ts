/**
 * Zone 1 — Platform core: the central coaching pipeline.
 *
 * Receives an ActivityEvent, and produces an AdaptiveCoachResponse:
 *   evaluate → learner context → retrieve knowledge → decide intervention
 *   → generate response → update learner model.
 *
 * Tracks hint-level state per decision point (per session) so that repeated
 * "hint_requested" events escalate against the same evaluation. The state
 * resets when a new deal starts or a new action is evaluated.
 */
import type {
  ActivityEvent,
  AdaptiveCoachResponse,
  CommonCoachPackage,
  EvaluationResult,
  EvaluatorContract,
  KnowledgeChunk,
  HintLevel,
} from "../types/index";
import type { LearnerStore } from "../learner-model/index";
import type { KnowledgeRetriever } from "../knowledge/index";
import type { ResponseGenerator } from "../llm/index";
import {
  InterventionPolicyEngine,
  type InterventionDecision,
} from "./InterventionPolicyEngine";

/** Optional session logging hook — implemented by the SessionEngine (Step 9). */
export interface SessionLogger {
  logEvent(sessionId: string, event: ActivityEvent<any>): void;
  logCoachInteraction(
    sessionId: string,
    triggerEventId: string,
    response: AdaptiveCoachResponse,
  ): void;
}

interface DecisionPointState {
  currentHintLevel: number;
  evaluationResult: EvaluationResult;
  commonCoachPackage: CommonCoachPackage;
  gameState: any;
  action: any;
}

const HINT_REQUEST_EVENT = "hint_requested";
const DEAL_STARTED_EVENT = "deal_started";

export interface AdaptiveCoachRuntimeDeps {
  evaluator: EvaluatorContract<any, any>;
  knowledgeRetriever: KnowledgeRetriever;
  interventionEngine: InterventionPolicyEngine;
  responseGenerator: ResponseGenerator;
  learnerStore: LearnerStore;
  sessionEngine?: SessionLogger;
}

export class AdaptiveCoachRuntime {
  private readonly deps: AdaptiveCoachRuntimeDeps;
  /** hint/decision state keyed by sessionId */
  private decisionState = new Map<string, DecisionPointState>();

  constructor(deps: AdaptiveCoachRuntimeDeps) {
    this.deps = deps;
  }

  async processEvent(
    event: ActivityEvent<any>,
    gameState: any,
  ): Promise<AdaptiveCoachResponse> {
    this.deps.sessionEngine?.logEvent(event.sessionId, event);

    let response: AdaptiveCoachResponse;
    if (event.eventType === HINT_REQUEST_EVENT) {
      response = await this.handleHintRequest(event);
    } else if (event.eventType === DEAL_STARTED_EVENT) {
      this.decisionState.delete(event.sessionId);
      response = { type: "silent" };
    } else {
      response = await this.handleAction(event, gameState);
    }

    if (response.type !== "silent") {
      this.deps.sessionEngine?.logCoachInteraction(
        event.sessionId,
        event.eventId,
        response,
      );
    }
    return response;
  }

  /**
   * Read-only evaluation of a hypothetical action, for interactive Q&A
   * ("what should I do?", "what about X?"). Runs evaluate → generate an
   * explanation-level response, but does NOT touch the learner model or the
   * hint/decision state, so asking questions never pollutes mastery tracking.
   */
  async probe(
    event: ActivityEvent<any>,
    gameState: any,
  ): Promise<{ evaluation: EvaluationResult; response: AdaptiveCoachResponse }> {
    const { evaluator, responseGenerator, learnerStore } = this.deps;
    const evaluation = await evaluator.evaluate(gameState, event.action);
    const commonCoachPackage = learnerStore.getCommonCoachPackage(
      event.actorId,
      event.domainId,
    );
    const decision: InterventionDecision = {
      shouldRespond: true,
      responseType: "explanation",
      hintLevel: 4,
      reason: "probe (interactive question)",
    };
    const retrievedChunks = this.retrieveChunks(evaluation.conceptIds, 4, true);
    const response = await responseGenerator.generate({
      commonCoachPackage,
      evaluationResult: evaluation,
      retrievedChunks,
      interventionDecision: decision,
      activityContext: this.activityContext(gameState, event.action),
    });
    return { evaluation, response };
  }

  /** Evaluate a learner action (e.g. bid_made) and coach on it. */
  private async handleAction(
    event: ActivityEvent<any>,
    gameState: any,
  ): Promise<AdaptiveCoachResponse> {
    const {
      evaluator,
      knowledgeRetriever,
      interventionEngine,
      responseGenerator,
      learnerStore,
    } = this.deps;

    // 1. Evaluate.
    const evaluationResult = await evaluator.evaluate(gameState, event.action);

    // 2. Learner context.
    const commonCoachPackage = learnerStore.getCommonCoachPackage(
      event.actorId,
      event.domainId,
    );
    const profile = learnerStore.getProfile(event.actorId);
    const recentMistakes = profile?.domains[event.domainId]?.recentMistakes ?? [];

    // 3. Decide intervention (new decision point → currentHintLevel 0).
    const decision = interventionEngine.decide({
      evaluationResult,
      coachingPolicy: commonCoachPackage.coachingPolicy,
      recentMistakes,
      currentHintLevel: 0,
      hintRequested: false,
    });

    // 4. Retrieve knowledge appropriate to the response.
    const retrievedChunks = this.retrieveChunks(
      evaluationResult.conceptIds,
      decision.hintLevel,
      decision.shouldRespond,
    );

    // 5. Generate response.
    const response = await responseGenerator.generate({
      commonCoachPackage,
      evaluationResult,
      retrievedChunks,
      interventionDecision: decision,
      activityContext: this.activityContext(gameState, event.action),
    });

    // 6. Update learner model.
    const skillId = evaluationResult.skillIds[0];
    if (skillId) {
      learnerStore.updateSkillState(
        event.actorId,
        event.domainId,
        skillId,
        evaluationResult,
      );
      learnerStore.tagLastMistakeEvent(
        event.actorId,
        event.domainId,
        event.eventId,
      );
    }

    // Store this decision point so hint requests can escalate against it.
    this.decisionState.set(event.sessionId, {
      currentHintLevel: decision.shouldRespond ? decision.hintLevel : 0,
      evaluationResult,
      commonCoachPackage,
      gameState,
      action: event.action,
    });

    return response;
  }

  /** Escalate a hint at the current decision point. */
  private async handleHintRequest(
    event: ActivityEvent<any>,
  ): Promise<AdaptiveCoachResponse> {
    const state = this.decisionState.get(event.sessionId);
    if (!state) {
      // No decision point yet — nothing to hint about.
      return {
        type: "silent",
        message: undefined,
      };
    }

    const { interventionEngine, responseGenerator, learnerStore } = this.deps;
    const profile = learnerStore.getProfile(event.actorId);
    const recentMistakes = profile?.domains[event.domainId]?.recentMistakes ?? [];

    const decision = interventionEngine.decide({
      evaluationResult: state.evaluationResult,
      coachingPolicy: state.commonCoachPackage.coachingPolicy,
      recentMistakes,
      currentHintLevel: state.currentHintLevel,
      hintRequested: true,
    });

    const retrievedChunks = this.retrieveChunks(
      state.evaluationResult.conceptIds,
      decision.hintLevel,
      true,
    );

    const response = await responseGenerator.generate({
      commonCoachPackage: state.commonCoachPackage,
      evaluationResult: state.evaluationResult,
      retrievedChunks,
      interventionDecision: decision,
      activityContext: this.activityContext(state.gameState, state.action),
    });

    // Advance the hint level for the next request.
    state.currentHintLevel = decision.hintLevel;
    return response;
  }

  private retrieveChunks(
    conceptIds: string[],
    hintLevel: HintLevel,
    shouldRespond: boolean,
  ): KnowledgeChunk[] {
    if (!shouldRespond) return [];
    const byLevel = this.deps.knowledgeRetriever.retrieveForHint(
      conceptIds,
      hintLevel,
    );
    if (byLevel.length > 0) return byLevel;
    // fallback: any relevant beginner material
    return this.deps.knowledgeRetriever.retrieve(conceptIds, "beginner");
  }

  /**
   * Merge the pre-action state and the action into one opaque context object
   * handed to the prompt builder. Domain-agnostic: the platform makes no
   * assumptions about field names — a domain's PromptStrategy reads whatever
   * fields it put on its own state/action.
   */
  private activityContext(gameState: any, action: any): any {
    return { ...(gameState ?? {}), ...(action ?? {}) };
  }
}
