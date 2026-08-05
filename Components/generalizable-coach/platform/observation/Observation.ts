/**
 * Zone 1 — Platform core: observations (LAIC §6.2 / CPIP §13.1, M3/C3).
 *
 * An observation is the Coach's educational INTERPRETATION of a raw event —
 * "what happened, in learning terms". It is stored separately from the raw
 * event log (system of record for what physically happened) and from the
 * learner model (mastery). Raw events in, never mutated; observations derived.
 */
import type { ActivityEvent } from "../../contracts/generated/index";
import type { EvaluationResult } from "../types/index";

export interface Observation {
  eventId: string;
  learnerId: string;
  domainId: string;
  eventType: string;
  observedAt: string;
  summary: string;
  conceptIds: string[];
  skillIds: string[];
  correctness?: string;
}

/** Turn a raw event (+ optional evaluation) into an educational observation. */
export function buildObservation(
  event: ActivityEvent,
  evaluation?: EvaluationResult,
): Observation {
  return {
    eventId: event.eventId,
    learnerId: event.actorId,
    domainId: event.domainId,
    eventType: event.eventType,
    observedAt: event.timestamp,
    summary: evaluation
      ? `${event.eventType}: ${evaluation.correctness}`
      : `${event.eventType} observed`,
    conceptIds: evaluation?.conceptIds ?? [],
    skillIds: evaluation?.skillIds ?? [],
    correctness: evaluation?.correctness,
  };
}

export interface ObservationStore {
  append(o: Observation): void;
  list(filter?: { learnerId?: string; domainId?: string }): Observation[];
  count(): number;
}

export class InMemoryObservationStore implements ObservationStore {
  private observations: Observation[] = [];

  append(o: Observation): void {
    this.observations.push(o);
  }

  list(filter: { learnerId?: string; domainId?: string } = {}): Observation[] {
    return this.observations.filter(
      (o) =>
        (filter.learnerId === undefined || o.learnerId === filter.learnerId) &&
        (filter.domainId === undefined || o.domainId === filter.domainId),
    );
  }

  count(): number {
    return this.observations.length;
  }
}
