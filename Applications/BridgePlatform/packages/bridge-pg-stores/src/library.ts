// LibraryStore over 0015 (jsonb-primary) + 0019 (org scoping).

import type { LibraryEntry, LibraryKind, LibraryStore, ScopeFilter } from "@bridge/sessions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Scalar scope columns are authoritative: rows backfilled by 0022 carry the
 *  scope in COLUMNS while their jsonb payload predates the fields. */
function overlayScopeColumns(r: any): LibraryEntry {
  const entry = r.entry as LibraryEntry;
  return {
    ...entry,
    scopeLevel: r.scope_level ?? entry.scopeLevel,
    nexusProgramId: r.nexus_program_id ?? entry.nexusProgramId,
    sourceRef: r.source_ref ?? entry.sourceRef,
  };
}

export class PgLibraryStore implements LibraryStore {
  constructor(private readonly db: SupabaseClient) {}

  async putEntry(entry: LibraryEntry) {
    check(
      await this.db.from("bridge_kb_library").upsert(
        {
          entry_id: entry.entryId,
          kind: entry.kind,
          created_by: entry.createdBy,
          program_organization_id: entry.programOrganizationId ?? null,
          scope_level: entry.scopeLevel ?? null,
          nexus_program_id: entry.nexusProgramId ?? null,
          source_ref: entry.sourceRef ?? null,
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
      await this.db
        .from("bridge_kb_library")
        .select("entry, scope_level, nexus_program_id, source_ref")
        .eq("entry_id", entryId),
      "library.get",
    );
    return rows.length ? overlayScopeColumns(rows[0]) : null;
  }
  async listEntries(kind?: LibraryKind, filter?: ScopeFilter) {
    let query = this.db
      .from("bridge_kb_library")
      .select("entry, scope_level, nexus_program_id, source_ref")
      .order("created_at", { ascending: false })
      .limit(200);
    if (kind) query = query.eq("kind", kind);
    if (filter?.programOrganizationId !== undefined)
      query = query.eq("program_organization_id", filter.programOrganizationId);
    if (filter?.createdBy !== undefined) query = query.eq("created_by", filter.createdBy);
    if (filter?.scopeLevel !== undefined) query = query.eq("scope_level", filter.scopeLevel);
    if (filter?.nexusProgramId !== undefined)
      query = query.eq("nexus_program_id", filter.nexusProgramId);
    const rows = check(await query, "library.list");
    return rows.map(overlayScopeColumns);
  }
  async deleteEntry(entryId: string) {
    check(
      await this.db.from("bridge_kb_library").delete().eq("entry_id", entryId),
      "library.delete",
    );
  }
}
