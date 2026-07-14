// SessionStore over 0014 (jsonb-primary).

import type { SessionRecord, SessionStore } from "@bridge/sessions";
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
  async listSessions() {
    const rows = check(
      await this.db
        .from("bridge_kb_sessions")
        .select("record")
        .order("created_at", { ascending: false })
        .limit(100),
      "sessions.list",
    );
    return rows.map((r: any) => r.record as SessionRecord);
  }
}
