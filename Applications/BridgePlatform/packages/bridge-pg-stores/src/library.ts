// LibraryStore over 0015 (jsonb-primary).

import type { LibraryEntry, LibraryKind, LibraryStore } from "@bridge/sessions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export class PgLibraryStore implements LibraryStore {
  constructor(private readonly db: SupabaseClient) {}

  async putEntry(entry: LibraryEntry) {
    check(
      await this.db.from("bridge_kb_library").upsert(
        {
          entry_id: entry.entryId,
          kind: entry.kind,
          created_by: entry.createdBy,
          entry,
          created_at: entry.createdAt,
        },
        { onConflict: "entry_id" },
      ),
      "library.put",
    );
  }
  async getEntry(entryId: string) {
    const rows = check(
      await this.db.from("bridge_kb_library").select("entry").eq("entry_id", entryId),
      "library.get",
    );
    return rows.length ? ((rows[0] as any).entry as LibraryEntry) : null;
  }
  async listEntries(kind?: LibraryKind) {
    let query = this.db
      .from("bridge_kb_library")
      .select("entry")
      .order("created_at", { ascending: false })
      .limit(200);
    if (kind) query = query.eq("kind", kind);
    const rows = check(await query, "library.list");
    return rows.map((r: any) => r.entry as LibraryEntry);
  }
  async deleteEntry(entryId: string) {
    check(
      await this.db.from("bridge_kb_library").delete().eq("entry_id", entryId),
      "library.delete",
    );
  }
}
