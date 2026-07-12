// Session model (Bridge plan §8, §15.1). The dev-store shape denormalizes the
// SQL tables (bridge_sessions, bridge_tables, bridge_seat_assignments,
// bridge_boards, bridge_events — db/migrations/0002_sessions.sql) into one
// record + an event stream; the Postgres store maps 1:1 back onto the tables.

import type { SettingValue } from "@bridge/config";
import type { BoardInput } from "@bridge/engine";
import type { GameEvent, Seat } from "@bridge/events";
import type { NexusBridgeContext } from "@laic/learner-contracts";

export type SessionType =
  | "single_board"
  | "practice_set"
  | "duplicate_match"
  | "coach_review"
  | "configuration_test"
  | "benchmark";

export type SessionStatus = "created" | "active" | "completed" | "abandoned";

export interface SeatAssignment {
  seat: Seat;
  playerKind: "human" | "deterministic_ai" | "ben" | "empty";
  /** nexusUserId for humans; AI profile id later (Phase 7). */
  occupantId?: string;
}

export interface BridgeSessionRecord {
  bridgeSessionId: string;
  /** NexusBridgeContext snapshot at creation — the tenant-scoping anchor. */
  context: NexusBridgeContext;
  sessionType: SessionType;
  status: SessionStatus;
  /**
   * Replay stability (Bridge plan §11.4): the exact package version
   * and resolved configuration this session runs under, plus a hash so drift
   * is detectable even if values are re-derived later.
   */
  packageRef: { packageId: string; version: string };
  resolvedValues: Record<string, SettingValue>;
  resolvedValueHash: string;
  board: BoardInput;
  seats: Record<Seat, SeatAssignment>;
  /** Learning-platform activity launch this session fulfils (LP §13.3). */
  launchRef?: string;
  createdBy: string; // nexusUserId
  createdAt: string;
  completedAt?: string;
}

/** Events are stored exactly as emitted (GameEvent) keyed by session + seq. */
export type PersistedGameEvent = GameEvent;

/** FNV-1a 32-bit over a stable JSON encoding (no crypto dependency). */
export function hashValues(values: Record<string, SettingValue>): string {
  const stable = JSON.stringify(
    Object.keys(values)
      .sort()
      .map((k) => [k, values[k]]),
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < stable.length; i++) {
    h ^= stable.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
