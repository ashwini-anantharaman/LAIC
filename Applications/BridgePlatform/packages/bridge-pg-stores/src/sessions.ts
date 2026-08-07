// SessionStore over 0014 (jsonb-primary) + 0019 (org scoping).

import type { ScopeFilter, SessionRecord, SessionStore } from "@bridge/sessions";
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
  async listSessions(filter?: ScopeFilter) {
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
    const rows = check(await query, "sessions.list");
    return rows.map((r: any) => r.record as SessionRecord);
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
