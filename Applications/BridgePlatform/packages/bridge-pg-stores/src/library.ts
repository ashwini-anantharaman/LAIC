// LibraryStore over 0015 (jsonb-primary) + 0019 (org scoping).

import type { LibraryCollectionRow, LibraryEntry, LibraryKind, LibraryStore, ScopeFilter } from "@bridge/sessions";
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
    // A null nexus_program_id is a pre-0022, ORG-scoped row (0022 only stamped
    // the Life-in-AI org). Match it alongside the exact program so legacy rows
    // don't vanish for a caller whose principal carries a real program uuid.
    if (filter?.nexusProgramId !== undefined)
      query = query.or(`nexus_program_id.eq.${filter.nexusProgramId},nexus_program_id.is.null`);
    const rows = check(await query, "library.list");
    return rows.map(overlayScopeColumns);
  }
  async deleteEntry(entryId: string) {
    check(
      await this.db.from("bridge_kb_library").delete().eq("entry_id", entryId),
      "library.delete",
    );
  }

  // ── Collections (0023) — jsonb-primary, scalar scope columns for filtering ──
  async putCollection(row: LibraryCollectionRow) {
    check(
      await this.db.from("bridge_library_collections").upsert(
        {
          collection_id: row.collectionId,
          program_organization_id: row.programOrganizationId ?? null,
          nexus_program_id: row.nexusProgramId ?? null,
          scope_level: row.scopeLevel ?? null,
          created_by: row.createdBy,
          record: row,
          created_at: row.createdAt,
        },
        { onConflict: "collection_id" },
      ),
      "library.collection.put",
    );
  }
  async getCollection(collectionId: string) {
    const rows = check(
      await this.db
        .from("bridge_library_collections")
        .select("record")
        .eq("collection_id", collectionId),
      "library.collection.get",
    );
    return rows.length ? ((rows[0] as { record: LibraryCollectionRow }).record ?? null) : null;
  }
  async listCollections(filter?: ScopeFilter) {
    let query = this.db
      .from("bridge_library_collections")
      .select("record")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter?.programOrganizationId !== undefined)
      query = query.eq("program_organization_id", filter.programOrganizationId);
    if (filter?.createdBy !== undefined) query = query.eq("created_by", filter.createdBy);
    if (filter?.scopeLevel !== undefined) query = query.eq("scope_level", filter.scopeLevel);
    // Null nexus_program_id = pre-0022 org-scoped (see listEntries).
    if (filter?.nexusProgramId !== undefined)
      query = query.or(`nexus_program_id.eq.${filter.nexusProgramId},nexus_program_id.is.null`);
    const rows = check(await query, "library.collection.list");
    return rows.map((r) => (r as { record: LibraryCollectionRow }).record);
  }
  async deleteCollection(collectionId: string) {
    check(
      await this.db
        .from("bridge_library_collections")
        .delete()
        .eq("collection_id", collectionId),
      "library.collection.delete",
    );
  }
}
