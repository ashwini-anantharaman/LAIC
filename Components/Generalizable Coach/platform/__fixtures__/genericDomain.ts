/**
 * Test fixture — a synthetic, deliberately NON-BRIDGE domain.
 *
 * This exists to prove the platform core is genuinely domain-agnostic: the
 * whole pipeline (evaluate → decide → retrieve → respond → update learner
 * model) runs against this toy "traffic-signal" domain with ZERO imports from
 * `domains/` and using only the platform's default, neutral PromptBuilder.
 *
 * The domain: a learner sees a signal and picks how to move.
 *   red → stop, green → go, yellow → slow.
 * Anything else is a `major`-severity error, which the InterventionPolicyEngine
 * turns into a level-2 hint (mirroring how any real domain behaves).
 *
 * If any bridge concept ever leaks into Zone 1, a test built on this fixture
 * breaks — which is exactly the guardrail we want.
 */
import { LearnerStore } from "../learner-model/index.js";
import { KnowledgeRetriever } from "../knowledge/index.js";
import {
  InterventionPolicyEngine,
  AdaptiveCoachRuntime,
} from "../coach-runtime/index.js";
import {
  ResponseGenerator,
  type BuiltPrompt,
} from "../llm/index.js";
import type { LLMLike } from "../llm/index.js";
import { SessionEngine } from "../session/index.js";
import type {
  ActivityEvent,
  EvaluationResult,
  EvaluatorContract,
  KnowledgePackage,
} from "../types/index.js";

// --- Opaque, non-bridge taxonomy -------------------------------------------
export const GENERIC_DOMAIN_ID = "traffic_signal";
export const CONCEPT_SIGNAL = "concept.signal_response";
export const SKILL_OBEY_SIGNAL = "skill.obey_signal";

export type Signal = "red" | "green" | "yellow";
export type Move = "stop" | "go" | "slow";

export interface SignalState {
  signal: Signal;
}
export interface SignalAction {
  move: Move;
}

const CORRECT: Record<Signal, Move> = { red: "stop", green: "go", yellow: "slow" };

// --- Synthetic evaluator (the domain's "judge") ----------------------------
export class SignalEvaluator
  implements EvaluatorContract<SignalState, SignalAction>
{
  async evaluate(
    state: SignalState,
    action: SignalAction,
  ): Promise<EvaluationResult> {
    const expected = CORRECT[state.signal];
    const correct = action.move === expected;
    return {
      correctness: correct ? "correct" : "incorrect",
      confidence: 1,
      bestAction: expected,
      conceptIds: [CONCEPT_SIGNAL],
      skillIds: [SKILL_OBEY_SIGNAL],
      explanation: correct
        ? "Matched the signal."
        : `On ${state.signal} the correct move is ${expected}.`,
      severity: correct ? "minor" : "major",
    };
  }
}

// --- Synthetic knowledge package (one chunk per hint level) ----------------
export function signalKnowledgePackage(): KnowledgePackage {
  const base = {
    conceptIds: [CONCEPT_SIGNAL],
    skillIds: [SKILL_OBEY_SIGNAL],
    difficulty: "beginner" as const,
  };
  return {
    packageId: "traffic_signal_v1",
    domainId: GENERIC_DOMAIN_ID,
    version: "1.0.0",
    chunks: [
      { ...base, chunkId: "k1", chunkType: "hint_template", content: "What is the signal telling you to do?" },
      { ...base, chunkId: "k2", chunkType: "rule", content: "Red means stop, green means go, yellow means slow." },
      { ...base, chunkId: "k3", chunkType: "example", content: "Signal red → the correct move is stop." },
      { ...base, chunkId: "k4", chunkType: "explanation", content: "Each signal maps to exactly one safe move; pick the one for the current signal." },
    ],
  };
}

// --- A deterministic mock LLM that echoes the requested hint level ---------
export class EchoLLM implements LLMLike {
  public calls: BuiltPrompt[] = [];
  async generateCoachResponse(prompt: BuiltPrompt) {
    this.calls.push(prompt);
    const level = prompt.user.match(/hint level (\d)/)?.[1] ?? "?";
    const type = prompt.user.match(/Generate a (\w+)/)?.[1] ?? "response";
    return { text: `[echo ${type} @ level ${level}]`, fromModel: true };
  }
}

// --- Composition root, mirroring buildBridgeCoach but domain-free ----------
export interface GenericCoach {
  runtime: AdaptiveCoachRuntime;
  learnerStore: LearnerStore;
  sessionEngine: SessionEngine;
  llm: EchoLLM;
}

export function buildGenericCoach(): GenericCoach {
  const learnerStore = new LearnerStore();
  const sessionEngine = new SessionEngine();
  const llm = new EchoLLM();
  // Note: no custom PromptStrategy — the platform default PromptBuilder is used,
  // proving a brand-new domain needs no bespoke prompt code to work.
  const runtime = new AdaptiveCoachRuntime({
    evaluator: new SignalEvaluator(),
    knowledgeRetriever: new KnowledgeRetriever(signalKnowledgePackage()),
    interventionEngine: new InterventionPolicyEngine(),
    responseGenerator: new ResponseGenerator(llm),
    learnerStore,
    sessionEngine,
  });
  return { runtime, learnerStore, sessionEngine, llm };
}

let counter = 0;
export function signalEvent(
  sessionId: string,
  move: Move,
): ActivityEvent<SignalAction> {
  return {
    eventId: `e${++counter}`,
    domainId: GENERIC_DOMAIN_ID,
    eventType: "move_made",
    timestamp: new Date().toISOString(),
    sessionId,
    actorId: "L1",
    action: { move },
  };
}

export function hintRequest(sessionId: string): ActivityEvent<unknown> {
  return {
    eventId: `e${++counter}`,
    domainId: GENERIC_DOMAIN_ID,
    eventType: "hint_requested",
    timestamp: new Date().toISOString(),
    sessionId,
    actorId: "L1",
    action: {},
  };
}
