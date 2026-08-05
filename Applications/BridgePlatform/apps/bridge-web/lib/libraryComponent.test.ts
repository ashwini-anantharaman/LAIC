// Regression: legacy library rows (authored before the 0022/0025 merge) carry
// their scope in COLUMNS only — the `entry` JSONB predates the scope fields, and
// 0022's nexus_program_id backfill only stamped the Life-in-AI org, so seed-org
// rows keep nexus_program_id = NULL ("scope by org only", the pre-0022 state).
//
// A reviewer/fellow views the PROGRAM instance; in http mode their principal
// carries a REAL program uuid. The store's scope filter must NOT drop the
// null-program legacy rows on an exact nexus_program_id match — that is the prod
// regression where every shelf read 0 while bridge_kb_library held 16 rows.
//
// This drives the actual prod seam: PgLibraryStore (the pg row→entry mapper +
// column filters) under the @laic/library-core list policy with a reviewer
// principal.

import { PgLibraryStore } from "@bridge/pg-stores";
import type { LibraryEntry } from "@bridge/sessions";
import {
  defaultLibraryPolicy,
  LIBRARY_CAPABILITIES,
  LibraryService,
  type LibraryBackend,
  type LibraryItem,
  type LibraryPrincipal,
} from "@laic/library-core";
import { describe, expect, it } from "vitest";

const ORG = "bporg_sunrise_bridge_club";
const REAL_PROGRAM_UUID = "eef9985b-b85f-4eeb-bd1e-bcc1f66b0f83";
const OTHER_PROGRAM_UUID = "11111111-2222-3333-4444-555555555555";

/** A DB row as stored in bridge_kb_library (scalar scope columns + entry jsonb). */
interface DbRow {
  entry_id: string;
  kind: string;
  created_by: string;
  program_organization_id: string | null;
  scope_level: string | null;
  nexus_program_id: string | null;
  source_ref: unknown;
  entry: unknown;
  created_at: string;
}

/**
 * A faithful-enough PostgREST query stub: it applies the same eq / is-null / or
 * predicates the real client would, over an in-memory table, so the store's REAL
 * filter code (not the stub) decides what comes back.
 */
function fakeSupabase(rows: DbRow[]) {
  function makeBuilder(table: DbRow[]) {
    let filtered = [...table];
    const builder: any = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => (r as any)[col] === val);
        return builder;
      },
      or: (expr: string) => {
        const clauses = expr.split(",").map((c) => c.trim());
        filtered = filtered.filter((r) =>
          clauses.some((clause) => {
            const [col, op, rawVal] = clause.split(".") as [string, string, string];
            const cell = (r as any)[col];
            if (op === "is" && rawVal === "null") return cell == null;
            if (op === "eq") return cell === rawVal;
            return false;
          }),
        );
        return builder;
      },
      then: (resolve: (v: { data: DbRow[]; error: null }) => unknown) =>
        resolve({ data: filtered, error: null }),
    };
    return builder;
  }
  return { from: () => makeBuilder(rows) } as any;
}

/** A legacy authored row: scope lives in COLUMNS; the jsonb has no scope keys. */
function legacyRow(overrides: Partial<DbRow> = {}): DbRow {
  const entry = {
    entryId: "le_legacy_board",
    kind: "board",
    name: "A pre-merge board",
    tags: [],
    origin: "authored",
    createdBy: "user_staff_author",
    createdAt: "2026-01-01T00:00:00.000Z",
    // NB: no scopeLevel / programOrganizationId / nexusProgramId / sourceRef.
  };
  return {
    entry_id: entry.entryId,
    kind: entry.kind,
    created_by: entry.createdBy,
    program_organization_id: ORG,
    scope_level: "program",
    nexus_program_id: null, // ← 0022 backfill never stamped this seed-org row
    source_ref: null,
    entry,
    created_at: entry.createdAt,
    ...overrides,
  };
}

/** BridgeLibraryBackend's list translation (the adapter seam), over any store. */
function backendOver(store: PgLibraryStore): LibraryBackend {
  return {
    put: async () => {},
    get: async () => null,
    delete: async () => {},
    list: async (q) => {
      const entries = await store.listEntries(q.kind as any, {
        ...(q.orgId ? { programOrganizationId: q.orgId } : {}),
        ...(q.programId ? { nexusProgramId: q.programId } : {}),
        ...(q.scopeLevel ? { scopeLevel: q.scopeLevel } : {}),
        ...(q.ownerId ? { createdBy: q.ownerId } : {}),
      });
      return entries.map(
        (e: LibraryEntry): LibraryItem => ({
          id: e.entryId,
          kind: e.kind,
          name: e.name,
          tags: e.tags,
          origin: e.origin,
          createdBy: e.createdBy,
          createdAt: e.createdAt,
          scope: {
            level: e.scopeLevel ?? "user",
            ...(e.programOrganizationId ? { orgId: e.programOrganizationId } : {}),
            ...(e.nexusProgramId ? { programId: e.nexusProgramId } : {}),
          },
          content: {},
        }),
      );
    },
  };
}

function reviewerService(rows: DbRow[]) {
  const store = new PgLibraryStore(fakeSupabase(rows));
  return new LibraryService({
    backend: backendOver(store),
    policy: defaultLibraryPolicy({
      programViewers: ["bridge_reviewer", "bridge_fellow"],
      programAuthors: ["bridge_reviewer", "bridge_fellow"],
      sharers: ["bridge_coach"],
    }),
    kinds: [{ id: "board", label: "Boards" }],
    newId: () => "le_x",
  });
}

const rheaPrincipal: LibraryPrincipal = {
  userId: "user_reviewer_rhea",
  orgId: ORG,
  programId: REAL_PROGRAM_UUID, // http mode: a real launch program uuid
  roles: ["bridge_reviewer", "bridge_fellow"],
  capabilities: [LIBRARY_CAPABILITIES.viewProgram],
};

describe("library-core list over PgLibraryStore — legacy org-scoped rows", () => {
  it("the pg mapper hydrates scope_level from the column, not the (empty) jsonb", async () => {
    const store = new PgLibraryStore(fakeSupabase([legacyRow()]));
    const rows = await store.listEntries("board", { programOrganizationId: ORG });
    expect(rows).toHaveLength(1);
    const entry = rows[0]!;
    expect(entry.scopeLevel).toBe("program"); // came from the column
    expect(entry.nexusProgramId).toBeUndefined(); // unstamped: pre-0022 org-scoped
  });

  it("a reviewer sees a null-program legacy row even though their principal carries a real program uuid", async () => {
    const service = reviewerService([legacyRow()]);
    const items = await service.list(rheaPrincipal, { view: "program" });
    expect(items.map((i) => i.id)).toEqual(["le_legacy_board"]);
  });

  it("does not over-match: a sibling program's row in the same org stays hidden", async () => {
    const service = reviewerService([
      legacyRow(), // null program → org-wide, visible
      legacyRow({
        entry_id: "le_same_program",
        nexus_program_id: REAL_PROGRAM_UUID,
        entry: { ...(legacyRow().entry as object), entryId: "le_same_program" },
      }), // exact program match → visible
      legacyRow({
        entry_id: "le_other_program",
        nexus_program_id: OTHER_PROGRAM_UUID,
        entry: { ...(legacyRow().entry as object), entryId: "le_other_program" },
      }), // different program, same org → hidden
    ]);
    const ids = (await service.list(rheaPrincipal, { view: "program" })).map((i) => i.id).sort();
    expect(ids).toEqual(["le_legacy_board", "le_same_program"]);
  });
});
