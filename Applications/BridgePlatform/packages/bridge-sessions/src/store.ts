// SessionStore seam: memory (tests) + JSON file (dev, ./fileStore) + Postgres
// (when Supabase lands). Append enforces the single-writer seq invariant at
// the storage boundary too — mirroring `unique (bridge_session_id, seq)` in
// db/migrations/0002_sessions.sql.

import type { GameEvent } from "@bridge/events";
import type { BridgeSessionRecord, SessionStatus } from "./model";

export interface SessionStoreData {
  sessions: BridgeSessionRecord[];
  events: Record<string, GameEvent[]>; // bridgeSessionId -> ordered events
}

export const emptySessionData = (): SessionStoreData => ({ sessions: [], events: {} });

export interface SessionStore {
  createSession(record: BridgeSessionRecord): Promise<void>;
  getSession(bridgeSessionId: string): Promise<BridgeSessionRecord | null>;
  listSessions(): Promise<BridgeSessionRecord[]>;
  setSessionStatus(
    bridgeSessionId: string,
    status: SessionStatus,
    completedAt?: string,
  ): Promise<void>;

  /** Append events; rejects out-of-order or duplicate seq (gap-free invariant). */
  appendEvents(bridgeSessionId: string, events: GameEvent[]): Promise<void>;
  getEvents(bridgeSessionId: string): Promise<GameEvent[]>;
  /** Remove every event with seq >= fromSeq (undo). */
  rollbackEvents(bridgeSessionId: string, fromSeq: number): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  protected data: SessionStoreData;

  constructor(seed?: Partial<SessionStoreData>) {
    this.data = { ...emptySessionData(), ...structuredClone(seed ?? {}) };
  }

  protected persist(): void {}

  async createSession(record: BridgeSessionRecord) {
    if (this.data.sessions.some((s) => s.bridgeSessionId === record.bridgeSessionId))
      throw new Error(`Session ${record.bridgeSessionId} already exists`);
    this.data.sessions.push(structuredClone(record));
    this.data.events[record.bridgeSessionId] = [];
    this.persist();
  }

  async getSession(id: string) {
    const s = this.data.sessions.find((x) => x.bridgeSessionId === id);
    return s ? structuredClone(s) : null;
  }

  async listSessions() {
    return structuredClone(this.data.sessions);
  }

  async setSessionStatus(id: string, status: SessionStatus, completedAt?: string) {
    const s = this.data.sessions.find((x) => x.bridgeSessionId === id);
    if (!s) throw new Error(`No session ${id}`);
    s.status = status;
    if (completedAt) s.completedAt = completedAt;
    this.persist();
  }

  async appendEvents(id: string, events: GameEvent[]) {
    const log = this.data.events[id];
    if (!log) throw new Error(`No session ${id}`);
    for (const e of events) {
      const last = log[log.length - 1];
      if (last !== undefined && e.seq <= last.seq)
        throw new Error(
          `Out-of-order append to ${id}: seq ${e.seq} after ${last.seq} (gap-free invariant)`,
        );
      log.push(structuredClone(e));
    }
    this.persist();
  }

  async getEvents(id: string) {
    return structuredClone(this.data.events[id] ?? []);
  }

  async rollbackEvents(id: string, fromSeq: number) {
    const log = this.data.events[id];
    if (!log) throw new Error(`No session ${id}`);
    this.data.events[id] = log.filter((e) => e.seq < fromSeq);
    this.persist();
  }
}
