/**
 * Zone 1 — Platform core: embedding ports.
 *
 * These are the seams a host UI plugs into. The coach never imports a UI
 * framework; a host maps its own domain events into the generic ActivityEvent
 * envelope (an EventSource) and renders the suggestions the coach emits (a
 * ResponseSink / listener). This is what makes the coach embeddable in *any*
 * UI — BridgeBot, a mobile client, a future play client — with no coupling.
 */
import type { ActivityEvent, AdaptiveCoachResponse } from "../types/index.js";

/**
 * One coaching turn's output: the coach's response plus the event that
 * triggered it, with a monotonic seq the UI can key on.
 */
export interface CoachSuggestion {
  seq: number;
  /** the learner/seat this suggestion is about */
  actorId: string;
  /** the event that triggered the coaching turn */
  event: ActivityEvent<unknown>;
  response: AdaptiveCoachResponse;
  /** convenience mirror of response.type for quick UI filtering */
  type: AdaptiveCoachResponse["type"];
}

export type SuggestionListener = (s: CoachSuggestion) => void;

/**
 * A host feeds already-translated activity events (+ the game state the
 * evaluator needs) through this. The host owns the translation from its native
 * event model into ActivityEvent — that adapter is the only host-specific code.
 */
export interface EventSource {
  subscribe(
    handler: (event: ActivityEvent<unknown>, gameState: unknown) => void,
  ): () => void;
}
