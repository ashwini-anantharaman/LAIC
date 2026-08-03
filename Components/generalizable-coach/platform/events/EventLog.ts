/**
 * Zone 1 — Platform core: the raw, append-only activity event log (LAIC M0).
 *
 * This is the `activity_events` store from architecture §16.2 — kept strictly
 * separate from the learner model (raw events in, never mutated). The Coach
 * consumes it live and in replay/postmortem modes. Domain-agnostic: it stores
 * generic `ActivityEvent`s and knows nothing about bridge or courses.
 *
 * The in-memory adapter below is the default and keeps tests headless. A
 * durable adapter (Postgres `activity_events`, per §16.3) implements the same
 * port for production without touching callers.
 */
import type { ActivityEvent } from "../../contracts/index";

export interface EventLogFilter {
  sessionId?: string;
  learnerId?: string;
  domainId?: string;
}

/** Persistence port for the raw event log: append one, read many. */
export interface EventLogRepo {
  append(event: ActivityEvent): void;
  list(filter?: EventLogFilter): ActivityEvent[];
  count(): number;
}

/** Default in-process adapter. Insertion order preserved. */
export class InMemoryEventLogRepo implements EventLogRepo {
  private events: ActivityEvent[] = [];

  append(event: ActivityEvent): void {
    this.events.push(event);
  }

  list(filter: EventLogFilter = {}): ActivityEvent[] {
    return this.events.filter(
      (e) =>
        (filter.sessionId === undefined || e.sessionId === filter.sessionId) &&
        (filter.learnerId === undefined || e.actorId === filter.learnerId) &&
        (filter.domainId === undefined || e.domainId === filter.domainId),
    );
  }

  count(): number {
    return this.events.length;
  }
}
