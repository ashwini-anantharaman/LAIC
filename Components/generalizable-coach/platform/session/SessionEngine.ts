/**
 * Zone 1 — Platform core: lightweight session lifecycle + append-only logs.
 *
 * Tracks a learning session: the events that occurred and the coach
 * interactions they triggered. Implements the SessionLogger hook the runtime
 * uses to record activity automatically.
 */
import type {
  ActivityEvent,
  AdaptiveCoachResponse,
} from "../types/index";
import type { SessionRepo } from "../storage/ports";

// Isomorphic UUID: Web Crypto is available in browsers (secure contexts) and
// in Node 19+ as globalThis.crypto, so this runs unchanged in a Vite bundle or
// on the server. Falls back to an RFC4122-shaped id if neither is present.
function randomUUID(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
import type { SessionLogger } from "../coach-runtime/AdaptiveCoachRuntime";

export interface SessionEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  payload: any;
}

export interface CoachInteraction {
  interactionId: string;
  triggerEventId: string;
  response: AdaptiveCoachResponse;
  timestamp: string;
}

export interface Session {
  sessionId: string;
  learnerId: string;
  domainId: string;
  startedAt: string;
  endedAt?: string;
  status: "active" | "completed" | "abandoned";
  events: SessionEvent[];
  coachInteractions: CoachInteraction[];
}

function nowIso(): string {
  return new Date().toISOString();
}

export class SessionStore implements SessionRepo {
  private sessions = new Map<string, Session>();

  save(session: Session): void {
    this.sessions.set(session.sessionId, session);
  }

  get(sessionId: string): Session | null {
    return this.sessions.get(sessionId) ?? null;
  }

  getByLearner(learnerId: string): Session[] {
    return [...this.sessions.values()].filter(
      (s) => s.learnerId === learnerId,
    );
  }
}

export class SessionEngine implements SessionLogger {
  constructor(private readonly store: SessionRepo = new SessionStore()) {}

  startSession(learnerId: string, domainId: string): Session {
    const session: Session = {
      sessionId: randomUUID(),
      learnerId,
      domainId,
      startedAt: nowIso(),
      status: "active",
      events: [],
      coachInteractions: [],
    };
    this.store.save(session);
    return session;
  }

  logEvent(sessionId: string, event: ActivityEvent<any>): void {
    const session = this.requireSession(sessionId);
    session.events.push({
      eventId: event.eventId,
      eventType: event.eventType,
      timestamp: event.timestamp || nowIso(),
      payload: event.action,
    });
    this.store.save(session); // persist the appended event
  }

  logCoachInteraction(
    sessionId: string,
    triggerEventId: string,
    response: AdaptiveCoachResponse,
  ): void {
    const session = this.requireSession(sessionId);
    session.coachInteractions.push({
      interactionId: randomUUID(),
      triggerEventId,
      response,
      timestamp: nowIso(),
    });
    this.store.save(session); // persist the appended interaction
  }

  endSession(sessionId: string): Session {
    const session = this.requireSession(sessionId);
    session.status = "completed";
    session.endedAt = nowIso();
    this.store.save(session); // persist the completed status
    return session;
  }

  getSession(sessionId: string): Session | null {
    return this.store.get(sessionId);
  }

  getSessionsByLearner(learnerId: string): Session[] {
    return this.store.getByLearner(learnerId);
  }

  private requireSession(sessionId: string): Session {
    const session = this.store.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    return session;
  }
}
