/**
 * Zone 1 — Platform core: embedding ports.
 *
 * These are the seams a host UI plugs into. The coach never imports a UI
 * framework; a host maps its own domain events into the generic ActivityEvent
 * envelope (an EventSource) and renders the suggestions the coach emits (a
 * ResponseSink / listener). This is what makes the coach embeddable in *any*
 * UI — BridgeBot, a mobile client, a future play client — with no coupling.
 */
import type { LearnerDomainProfile } from "../../contracts/generated/index";
import type {
  ActivityEvent,
  AdaptiveCoachResponse,
  EvaluationResult,
} from "../types/index";

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

/**
 * Who says whether the learner was right — the HOST, always.
 *
 * The coach decides whether to speak, in what form, and how much to give away.
 * It never decides what "right" means: that belongs to whoever owns the rules
 * being taught. Bridge answers from its compiled knowledge base; a quiz answers
 * from its answer key; a graded essay answers from a rubric. Re-implementing
 * any of them inside the coach would put a second, quietly diverging copy of
 * the domain's rules in the one place that must stay domain-free.
 *
 * `null` means the host has no opinion here — an unmapped position, a rulebook
 * with no agreement, a question with no key. The coach must then stay silent:
 * an authority that has not spoken has not been contradicted.
 */
export interface VerdictSource {
  evaluate(
    event: ActivityEvent<unknown>,
    state: unknown,
  ): Promise<EvaluationResult | null>;
}

/** What the learner is working on right now, in the host's own catalogue. */
export interface LearnerFocus {
  objectId: string;
  title: string;
  conceptIds: string[];
  skillIds: string[];
  /** ISO-8601. */
  startedAt: string;
}

/**
 * Where the learner is: their level, and what they are looking at.
 *
 * A READ port, deliberately — symmetrical with KnowledgeSource, and never a
 * sync. Mastery has exactly one writer; the moment two systems compute it they
 * diverge and nobody can say what the learner knows. Implementations should
 * cache with an explicit staleness window rather than mirror.
 *
 * Both methods may return null: a host with no learning platform behind it
 * (a standalone table, a demo) is a supported configuration, not an error.
 */
export interface LearnerContextSource {
  profile(learnerId: string, domainId: string): Promise<LearnerDomainProfile | null>;
  currentFocus(learnerId: string): Promise<LearnerFocus | null>;
}
