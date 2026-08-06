// Regression: a reviewer/fellow saw every library shelf read 0 in prod (stub
// nexus mode + postgres) while bridge_kb_library held rows. TWO faults on the
// read path:
//
// 1. ORG PARTITION (the prod cause): a program-level caller — reviewer, fellow
//    or program admin whose context carries no `programOrganizationId` — has
//    orgScopeOf() fall back to the parent laic org (org_laic). The shared
//    program shelf's items are stamped with the CLUB org they were authored in
//    (bporg_sunrise_bridge_club), so a strict org filter matched nothing.
//    programReadPrincipal drops the org partition for these callers so the
//    program shelf reads program-wide (like the KB). Club-scoped callers stay
//    partitioned.
//
// 2. NULL PROGRAM STAMP: 0022's nexus_program_id backfill only stamped the
//    Life-in-AI org, so seed-org rows keep nexus_program_id = NULL (pre-0022,
//    "scope by org only"). The store filter must not drop them on an exact
//    program-id match — matters in http mode, where the principal carries a
//    real program uuid.
//
// These drive the actual prod seam: PgLibraryStore (the pg row→entry mapper +
// column filters) under the @laic/library-core list policy with a reviewer
// principal, plus the programReadPrincipal adapter seam.

import type { NexusBridgeContext } from "@laic/learner-contracts";
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
import { programReadPrincipal } from "./libraryComponent";

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

// The PROD scenario: stub nexus mode (programId = null), and a reviewer/fellow
// whose context has no programOrganizationId, so their principal.orgId is the
// FALLBACK laic org — which matches no item, since the shelf's items are stamped
// with the club org they were authored in.
const rheaStub: NexusBridgeContext = {
  nexusUserId: "user_reviewer_rhea",
  laicOrgId: "org_laic",
  programId: "bridge_program",
  appId: "bridge_ai_coach",
  roles: ["bridge_reviewer", "bridge_fellow"],
  // NB: no programOrganizationId — a program-level caller above any single club.
} as NexusBridgeContext;

/** A club admin IS pinned to a club — they keep their org partition. */
const oliviaStub: NexusBridgeContext = {
  ...rheaStub,
  nexusUserId: "user_orgadmin_olivia",
  programOrganizationId: ORG,
  roles: ["bridge_org_admin", "bridge_club_admin"],
} as NexusBridgeContext;

/** The stub-shape principal: orgId is the laic fallback, programId undefined. */
function stubPrincipal(orgId: string | undefined): LibraryPrincipal {
  return {
    userId: "user_reviewer_rhea",
    orgId,
    roles: ["bridge_reviewer", "bridge_fellow"],
    capabilities: [LIBRARY_CAPABILITIES.viewProgram],
  };
}

describe("programReadPrincipal — program-level callers read the shelf program-wide", () => {
  it("drops the org partition for a program-level caller viewing program/org", () => {
    expect(programReadPrincipal(stubPrincipal("org_laic"), rheaStub, "program").orgId).toBeUndefined();
    expect(programReadPrincipal(stubPrincipal("org_laic"), rheaStub, "org").orgId).toBeUndefined();
  });

  it("keeps the org partition for a club-scoped caller, and for 'mine'", () => {
    expect(programReadPrincipal(stubPrincipal(ORG), oliviaStub, "program").orgId).toBe(ORG);
    expect(programReadPrincipal(stubPrincipal("org_laic"), rheaStub, "mine").orgId).toBe("org_laic");
  });

  it("end-to-end: a club-org shelf is invisible under the fallback org, visible after the drop", async () => {
    // A program-shelf board stamped with the CLUB org (as authored/seeded), stub
    // shape: no nexus_program_id.
    const clubRow = legacyRow({
      program_organization_id: ORG,
      nexus_program_id: null,
      entry: { ...(legacyRow().entry as object), entryId: "le_club_board" },
      entry_id: "le_club_board",
    });
    const service = reviewerService([clubRow]);

    // Before the drop: rhea's fallback laic org matches nothing → empty shelves.
    const withFallbackOrg = await service.list(stubPrincipal("org_laic"), { view: "program" });
    expect(withFallbackOrg).toHaveLength(0);

    // After programReadPrincipal drops the org: the club-org shelf is visible.
    const readPrincipal = programReadPrincipal(stubPrincipal("org_laic"), rheaStub, "program");
    const items = await service.list(readPrincipal, { view: "program" });
    expect(items.map((i) => i.id)).toEqual(["le_club_board"]);
  });
});
