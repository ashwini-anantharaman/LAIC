/**
 * Zone 1 — Platform core: SQLite storage adapters (Node-only).
 *
 * Durable implementations of LearnerRepo / SessionRepo backed by better-sqlite3.
 * Each entity is stored as a JSON blob keyed by id (sessions also indexed by
 * learner_id) — simple and correct; normalize into columns later for analytics.
 *
 * IMPORTANT: this module imports a NATIVE Node module and must NEVER be pulled
 * into the browser bundle. It is deliberately NOT exported from index.ts or
 * storage/index.ts — the server imports it by explicit path.
 */
import Database, { type Database as DB } from "better-sqlite3";
import type { LearnerProfile } from "../learner-model/types.js";
import type { Session } from "../session/SessionEngine.js";
import type { LearnerRepo, SessionRepo } from "./ports.js";

export class SqliteLearnerRepo implements LearnerRepo {
  constructor(private readonly db: DB) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS learners (id TEXT PRIMARY KEY, json TEXT NOT NULL)",
    );
  }

  get(learnerId: string): LearnerProfile | null {
    const row = this.db
      .prepare("SELECT json FROM learners WHERE id = ?")
      .get(learnerId) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as LearnerProfile) : null;
  }

  put(profile: LearnerProfile): void {
    this.db
      .prepare(
        "INSERT INTO learners (id, json) VALUES (?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET json = excluded.json",
      )
      .run(profile.learnerId, JSON.stringify(profile));
  }
}

export class SqliteSessionStore implements SessionRepo {
  constructor(private readonly db: DB) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, learner_id TEXT NOT NULL, json TEXT NOT NULL);" +
        "CREATE INDEX IF NOT EXISTS idx_sessions_learner ON sessions(learner_id);",
    );
  }

  save(session: Session): void {
    this.db
      .prepare(
        "INSERT INTO sessions (id, learner_id, json) VALUES (?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET learner_id = excluded.learner_id, json = excluded.json",
      )
      .run(session.sessionId, session.learnerId, JSON.stringify(session));
  }

  get(sessionId: string): Session | null {
    const row = this.db
      .prepare("SELECT json FROM sessions WHERE id = ?")
      .get(sessionId) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Session) : null;
  }

  getByLearner(learnerId: string): Session[] {
    const rows = this.db
      .prepare("SELECT json FROM sessions WHERE learner_id = ?")
      .all(learnerId) as { json: string }[];
    return rows.map((r) => JSON.parse(r.json) as Session);
  }
}

export interface CoachDatabase {
  db: DB;
  learnerRepo: SqliteLearnerRepo;
  sessionStore: SqliteSessionStore;
}

/** Open (or create) a SQLite-backed coach database and its repos. */
export function openCoachDatabase(path: string): CoachDatabase {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  return {
    db,
    learnerRepo: new SqliteLearnerRepo(db),
    sessionStore: new SqliteSessionStore(db),
  };
}
