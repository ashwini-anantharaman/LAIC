/**
 * Zone 1 — Platform core: storage ports.
 *
 * The learner model and session engine depend only on these interfaces, never
 * on a concrete datastore. The in-memory adapters (memory.ts) are the default;
 * a Node-only SQLite adapter (sqlite.ts) implements the same ports for durable
 * persistence. Domain-agnostic — the platform never knows which drawer is behind
 * the port.
 */
import type { LearnerProfile } from "../learner-model/types.js";
import type { Session } from "../session/SessionEngine.js";

/** Persistence for learner profiles: read one, write one. */
export interface LearnerRepo {
  get(learnerId: string): LearnerProfile | null;
  put(profile: LearnerProfile): void;
}

/** Persistence for sessions + their append-only logs. */
export interface SessionRepo {
  save(session: Session): void;
  get(sessionId: string): Session | null;
  getByLearner(learnerId: string): Session[];
}
