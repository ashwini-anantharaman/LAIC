// SessionStore over 0014 (jsonb-primary) + 0019 (org scoping).

import type {
  SessionFilter,
  SessionRecord,
  SessionStore,
  SessionSummary,
} from "@bridge/sessions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export class PgSessionStore implements SessionStore {
  constructor(private readonly db: SupabaseClient) {}

  async putSession(record: SessionRecord) {
    check(
      await this.db.from("bridge_kb_sessions").upsert(
        {
          session_id: record.sessionId,
          kb_id: record.kbId,
          created_by: record.createdBy,
          program_organization_id: record.programOrganizationId ?? null,
          nexus_program_id: record.nexusProgramId ?? null,
          record,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
        },
        { onConflict: "session_id" },
      ),
      "sessions.put",
    );
  }
  async getSession(sessionId: string) {
    const rows = check(
      await this.db.from("bridge_kb_sessions").select("record").eq("session_id", sessionId),
      "sessions.get",
    );
    return rows.length ? ((rows[0] as any).record as SessionRecord) : null;
  }
  async listSessions(filter?: SessionFilter) {
    let query = this.db
      .from("bridge_kb_sessions")
      .select("record")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter?.programOrganizationId !== undefined)
      query = query.eq("program_organization_id", filter.programOrganizationId);
    if (filter?.createdBy !== undefined) query = query.eq("created_by", filter.createdBy);
    if (filter?.nexusProgramId !== undefined)
      query = query.eq("nexus_program_id", filter.nexusProgramId);
    // Status lives only inside the jsonb, so it filters through the ->> path.
    // It MUST be pushed down rather than applied to the result: the .limit(100)
    // above is applied by Postgres before any caller sees a row, and abandoned
    // sittings outnumber finished boards several times over — so a caller that
    // wanted finished games and filtered afterwards silently lost the older ones.
    if (filter?.status !== undefined) query = query.eq("record->>status", filter.status);
    const rows = check(await query, "sessions.list");
    return rows.map((r: any) => r.record as SessionRecord);
  }
  /**
   * The list WITHOUT the games: the four fields a row needs are projected out of
   * the jsonb by Postgres, so the sitting itself never crosses the wire. On live
   * data this is the difference between 2.8 MB and 3.2 kB for the same 25 rows.
   */
  async listSessionSummaries(filter?: SessionFilter) {
    let query = this.db
      .from("bridge_kb_sessions")
      .select("session_id, updated_at, boardName:record->board->>name, status:record->>status")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter?.programOrganizationId !== undefined)
      query = query.eq("program_organization_id", filter.programOrganizationId);
    if (filter?.createdBy !== undefined) query = query.eq("created_by", filter.createdBy);
    if (filter?.nexusProgramId !== undefined)
      query = query.eq("nexus_program_id", filter.nexusProgramId);
    if (filter?.status !== undefined) query = query.eq("record->>status", filter.status);
    const rows = check(await query, "sessions.listSummaries");
    return rows.map((r: any) => ({
      sessionId: r.session_id as string,
      // A board with no name in its jsonb would otherwise render an empty card.
      boardName: (r.boardName as string | null) ?? "Board",
      status: r.status as SessionSummary["status"],
      updatedAt: r.updated_at as string,
    }));
  }
  async deleteSession(sessionId: string) {
    check(
      await this.db.from("bridge_kb_sessions").delete().eq("session_id", sessionId),
      "sessions.delete",
    );
  }
  async deleteSessionsForKb(kbId: string) {
    check(
      await this.db.from("bridge_kb_sessions").delete().eq("kb_id", kbId),
      "sessions.deleteForKb",
    );
  }
}
