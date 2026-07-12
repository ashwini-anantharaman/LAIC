// SessionStore seam: memory (tests) + JSON file (dev, ./fileStore) + Postgres
// (when Supabase lands). Append enforces the single-writer seq invariant at
// the storage boundary too — mirroring `unique (bridge_session_id, seq)` in
// db/migrations/0002_sessions.sql.

import type { GameEvent } from "@bridge/events";
import type {
  BridgeSessionRecord,
  PositionSnapshotRecord,
  SavedBoardRecord,
  SessionLifecycleEvent,
  SessionStatus,
  ShareLinkRecord,
} from "./model";

export interface SessionStoreData {
  sessions: BridgeSessionRecord[];
  events: Record<string, GameEvent[]>; // bridgeSessionId -> ordered events
  lifecycle?: Record<string, SessionLifecycleEvent[]>;
  snapshots?: PositionSnapshotRecord[];
  boards?: SavedBoardRecord[];
  shareLinks?: ShareLinkRecord[];
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
  /** Replace seat assignments (§16.2 — service enforces "before first action"). */
  updateSeats(bridgeSessionId: string, seats: BridgeSessionRecord["seats"]): Promise<void>;

  /** Append events; rejects out-of-order or duplicate seq (gap-free invariant). */
  appendEvents(bridgeSessionId: string, events: GameEvent[]): Promise<void>;
  getEvents(bridgeSessionId: string): Promise<GameEvent[]>;
  /** Remove every event with seq >= fromSeq (undo). */
  rollbackEvents(bridgeSessionId: string, fromSeq: number): Promise<void>;

  /** Lifecycle stream (§9.1 cat 5–8) — separate seq space, append-only. */
  appendLifecycle(bridgeSessionId: string, events: SessionLifecycleEvent[]): Promise<void>;
  getLifecycle(bridgeSessionId: string): Promise<SessionLifecycleEvent[]>;

  saveSnapshot(snapshot: PositionSnapshotRecord): Promise<void>;
  getSnapshot(snapshotId: string): Promise<PositionSnapshotRecord | null>;
  listSnapshots(): Promise<PositionSnapshotRecord[]>;

  saveBoard(board: SavedBoardRecord): Promise<void>;
  getBoard(boardId: string): Promise<SavedBoardRecord | null>;
  listBoards(): Promise<SavedBoardRecord[]>;

  saveShareLink(link: ShareLinkRecord): Promise<void>;
  getShareLink(token: string): Promise<ShareLinkRecord | null>;
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

  async updateSeats(id: string, seats: BridgeSessionRecord["seats"]) {
    const s = this.data.sessions.find((x) => x.bridgeSessionId === id);
    if (!s) throw new Error(`No session ${id}`);
    s.seats = structuredClone(seats);
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

  async appendLifecycle(id: string, events: SessionLifecycleEvent[]) {
    this.data.lifecycle ??= {};
    const log = (this.data.lifecycle[id] ??= []);
    for (const e of events) {
      const last = log[log.length - 1];
      if (last !== undefined && e.lifecycleSeq <= last.lifecycleSeq)
        throw new Error(`Out-of-order lifecycle append to ${id}`);
      log.push(structuredClone(e));
    }
    this.persist();
  }
  async getLifecycle(id: string) {
    return structuredClone(this.data.lifecycle?.[id] ?? []);
  }

  async saveSnapshot(snapshot: PositionSnapshotRecord) {
    (this.data.snapshots ??= []).push(structuredClone(snapshot));
    this.persist();
  }
  async getSnapshot(snapshotId: string) {
    const s = (this.data.snapshots ?? []).find((x) => x.snapshotId === snapshotId);
    return s ? structuredClone(s) : null;
  }
  async listSnapshots() {
    return structuredClone(this.data.snapshots ?? []);
  }

  async saveBoard(board: SavedBoardRecord) {
    (this.data.boards ??= []).push(structuredClone(board));
    this.persist();
  }
  async getBoard(boardId: string) {
    const b = (this.data.boards ?? []).find((x) => x.boardId === boardId);
    return b ? structuredClone(b) : null;
  }
  async listBoards() {
    return structuredClone(this.data.boards ?? []);
  }

  async saveShareLink(link: ShareLinkRecord) {
    this.data.shareLinks ??= [];
    if (this.data.shareLinks.some((l) => l.token === link.token))
      throw new Error("Share token collision");
    this.data.shareLinks.push(structuredClone(link));
    this.persist();
  }
  async getShareLink(token: string) {
    const l = (this.data.shareLinks ?? []).find((x) => x.token === token);
    return l ? structuredClone(l) : null;
  }
}
