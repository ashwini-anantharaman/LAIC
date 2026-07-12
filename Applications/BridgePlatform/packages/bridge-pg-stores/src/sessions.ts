// SessionStore over db/migrations/0002 (+0005 `record` jsonb).
//
// Hybrid jsonb-primary mapping: the full BridgeSessionRecord lives in the
// `record` column (exactly the dev-store shape) with scalar columns filled
// for indexing/tenant queries; EVENTS are proper rows per the §15.2 shape
// with `unique(bridge_session_id, seq)` enforcing the gap-free invariant at
// the database. The normalized bridge_boards/bridge_seat_assignments tables
// stay available for a later fully-relational pass.

import type { GameEvent } from "@bridge/events";
import type {
  BridgeSessionRecord,
  PositionSnapshotRecord,
  SavedBoardRecord,
  SessionLifecycleEvent,
  SessionStatus,
  SessionStore,
  ShareLinkRecord,
} from "@bridge/sessions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export class PgSessionStore implements SessionStore {
  constructor(private readonly db: SupabaseClient) {}

  async createSession(record: BridgeSessionRecord) {
    const { error } = await this.db.from("bridge_sessions").insert({
      bridge_session_id: record.bridgeSessionId,
      nexus_user_id: record.context.nexusUserId,
      laic_org_id: record.context.laicOrgId,
      program_id: record.context.programId,
      program_organization_id: record.context.programOrganizationId ?? null,
      group_id: record.context.groupId ?? null,
      app_id: record.context.appId,
      context_snapshot: record.context,
      session_type: record.sessionType,
      status: record.status,
      package_id: record.packageRef.packageId,
      package_version: record.packageRef.version,
      resolved_values: record.resolvedValues,
      resolved_value_hash: record.resolvedValueHash,
      created_by: record.createdBy,
      created_at: record.createdAt,
      record,
    });
    if (error) {
      if (error.code === "23505") throw new Error(`Session ${record.bridgeSessionId} already exists`);
      throw new Error(`[pg-stores] createSession: ${error.message}`);
    }
  }

  async getSession(id: string) {
    const rows = check(
      await this.db.from("bridge_sessions").select("record,status,completed_at").eq("bridge_session_id", id),
      "getSession",
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return { ...(r.record as BridgeSessionRecord), status: r.status, completedAt: r.completed_at ?? undefined };
  }

  async listSessions() {
    const rows = check(
      await this.db.from("bridge_sessions").select("record,status,completed_at").order("created_at"),
      "listSessions",
    );
    return rows.map((r: any) => ({
      ...(r.record as BridgeSessionRecord),
      status: r.status,
      completedAt: r.completed_at ?? undefined,
    }));
  }

  async setSessionStatus(id: string, status: SessionStatus, completedAt?: string) {
    const rows = check(
      await this.db
        .from("bridge_sessions")
        .update({ status, completed_at: completedAt ?? null })
        .eq("bridge_session_id", id)
        .select("bridge_session_id"),
      "setSessionStatus",
    );
    if (!rows.length) throw new Error(`No session ${id}`);
  }

  async appendEvents(id: string, events: GameEvent[]) {
    if (!events.length) return;
    const last = check(
      await this.db
        .from("bridge_events")
        .select("seq")
        .eq("bridge_session_id", id)
        .order("seq", { ascending: false })
        .limit(1),
      "appendEvents(maxSeq)",
    );
    const maxSeq = last.length ? (last[0] as any).seq : -1;
    if (events[0]!.seq <= maxSeq)
      throw new Error(
        `Out-of-order append to ${id}: seq ${events[0]!.seq} after ${maxSeq} (gap-free invariant)`,
      );
    check(
      await this.db.from("bridge_events").insert(
        events.map((e) => ({
          bridge_session_id: id,
          seq: e.seq,
          event_category: e.category,
          event_type: e.category,
          actor_kind: "seat" in e ? "player" : "system",
          seat: "seat" in e ? e.seat : null,
          payload: e,
          created_at: new Date(e.ts).toISOString(),
        })),
      ),
      "appendEvents",
    );
  }

  async getEvents(id: string) {
    const rows = check(
      await this.db.from("bridge_events").select("payload").eq("bridge_session_id", id).order("seq"),
      "getEvents",
    );
    return rows.map((r: any) => r.payload as GameEvent);
  }

  async rollbackEvents(id: string, fromSeq: number) {
    check(
      await this.db.from("bridge_events").delete().eq("bridge_session_id", id).gte("seq", fromSeq),
      "rollbackEvents",
    );
  }

  // ---- lifecycle stream (0008 bridge_session_lifecycle) --------------------

  async appendLifecycle(id: string, events: SessionLifecycleEvent[]) {
    if (!events.length) return;
    check(
      await this.db.from("bridge_session_lifecycle").insert(
        events.map((e) => ({
          bridge_session_id: id,
          lifecycle_seq: e.lifecycleSeq,
          ts: e.ts,
          event_type: e.type,
          payload: e.payload,
        })),
      ),
      "appendLifecycle",
    );
  }

  async getLifecycle(id: string) {
    const rows = check(
      await this.db
        .from("bridge_session_lifecycle")
        .select("*")
        .eq("bridge_session_id", id)
        .order("lifecycle_seq"),
      "getLifecycle",
    );
    return rows.map((r: any): SessionLifecycleEvent => ({
      lifecycleSeq: r.lifecycle_seq,
      ts: r.ts,
      type: r.event_type,
      payload: r.payload ?? {},
    }));
  }

  // ---- position snapshots (0002 bridge_position_snapshots) -----------------

  async saveSnapshot(snapshot: PositionSnapshotRecord) {
    check(
      await this.db.from("bridge_position_snapshots").insert({
        snapshot_id: snapshot.snapshotId,
        bridge_session_id: snapshot.sourceSessionId,
        as_of_seq: snapshot.asOfSeq,
        state: snapshot,
        created_at: snapshot.createdAt,
      }),
      "saveSnapshot",
    );
  }

  async getSnapshot(snapshotId: string) {
    const rows = check(
      await this.db.from("bridge_position_snapshots").select("state").eq("snapshot_id", snapshotId),
      "getSnapshot",
    );
    return rows.length ? ((rows[0] as any).state as PositionSnapshotRecord) : null;
  }

  async listSnapshots() {
    const rows = check(
      await this.db.from("bridge_position_snapshots").select("state").order("created_at"),
      "listSnapshots",
    );
    return rows.map((r: any) => r.state as PositionSnapshotRecord);
  }

  // ---- board library + share links (0008) ----------------------------------

  async saveBoard(board: SavedBoardRecord) {
    check(
      await this.db.from("bridge_saved_boards").insert({
        board_id: board.boardId,
        name: board.name,
        board: board.board,
        context_snapshot: board.context,
        program_organization_id: board.context.programOrganizationId ?? null,
        tags: board.tags,
        created_by: board.createdBy,
        created_at: board.createdAt,
      }),
      "saveBoard",
    );
  }

  private rowToBoard = (r: any): SavedBoardRecord => ({
    boardId: r.board_id,
    name: r.name,
    board: r.board,
    context: r.context_snapshot,
    tags: r.tags ?? [],
    createdBy: r.created_by,
    createdAt: r.created_at,
  });

  async getBoard(boardId: string) {
    const rows = check(
      await this.db.from("bridge_saved_boards").select("*").eq("board_id", boardId),
      "getBoard",
    );
    return rows.length ? this.rowToBoard(rows[0]) : null;
  }

  async listBoards() {
    const rows = check(
      await this.db.from("bridge_saved_boards").select("*").order("created_at"),
      "listBoards",
    );
    return rows.map(this.rowToBoard);
  }

  async saveShareLink(link: ShareLinkRecord) {
    const { error } = await this.db.from("bridge_share_links").insert({
      token: link.token,
      board_id: link.boardId,
      created_by: link.createdBy,
      created_at: link.createdAt,
    });
    if (error) {
      if (error.code === "23505") throw new Error("Share token collision");
      throw new Error(`[pg-stores] saveShareLink: ${error.message}`);
    }
  }

  async getShareLink(token: string) {
    const rows = check(
      await this.db.from("bridge_share_links").select("*").eq("token", token),
      "getShareLink",
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return { token: r.token, boardId: r.board_id, createdBy: r.created_by, createdAt: r.created_at };
  }
}
