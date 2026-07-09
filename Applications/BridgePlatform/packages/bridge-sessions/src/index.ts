/**
 * @bridge/sessions
 *
 * Persistent, tenant-scoped bridge sessions (Bridge plan §8, §15-16, §21):
 * event-sourced session records pinned to an exact published package version
 * + resolved-config hash (replay stability, §11.4), a stateless service that
 * reconstructs games from the persisted event log via the engine's primed
 * histories, honest human-action commits, and undo across the persistence
 * boundary. Storage behind the SessionStore seam (memory / JSON file /
 * Postgres per db/migrations/0002_sessions.sql).
 */

export { hashValues } from "./model";
export type {
  BridgeSessionRecord,
  PersistedGameEvent,
  SeatAssignment,
  SessionStatus,
  SessionType,
} from "./model";
export {
  emptySessionData,
  InMemorySessionStore,
  type SessionStore,
  type SessionStoreData,
} from "./store";
export {
  AwaitingHumanError,
  canAccessSession,
  SessionAccessError,
  SessionService,
  type CreateSessionInput,
  type SessionServiceDeps,
  type SessionView,
} from "./service";
