// Scope-filter semantics for legacy (pre-0022) library rows: a record whose
// nexus_program_id is unstamped (null/absent) is ORG-scoped and must match a
// program-partitioned read within its org — "null program id = scope by org
// only, the pre-0022 behavior". This mirrors, for the file/in-memory backend,
// the same rule the pg store applies in SQL.

import { describe, expect, it } from "vitest";
import { InMemoryLibraryStore, matchesScope, type LibraryEntry } from "./library";

const ORG = "bporg_sunrise_bridge_club";
const PROGRAM = "eef9985b-b85f-4eeb-bd1e-bcc1f66b0f83";

function legacyEntry(): LibraryEntry {
  return {
    entryId: "le_legacy",
    kind: "board",
    name: "pre-0022 board",
    tags: [],
    origin: "authored",
    createdBy: "user_staff",
    createdAt: "2026-01-01T00:00:00.000Z",
    programOrganizationId: ORG,
    scopeLevel: "program",
    // no nexusProgramId — unstamped, org-scoped
  };
}

describe("matchesScope — legacy org-scoped rows (null nexus_program_id)", () => {
  it("matches a program-partitioned read within the same org", () => {
    expect(
      matchesScope(legacyEntry(), {
        programOrganizationId: ORG,
        scopeLevel: "program",
        nexusProgramId: PROGRAM,
      }),
    ).toBe(true);
  });

  it("still excludes a row stamped with a DIFFERENT program", () => {
    expect(
      matchesScope(
        { ...legacyEntry(), nexusProgramId: "99999999-0000-0000-0000-000000000000" },
        { programOrganizationId: ORG, scopeLevel: "program", nexusProgramId: PROGRAM },
      ),
    ).toBe(false);
  });

  it("still excludes a row from another org", () => {
    expect(
      matchesScope(legacyEntry(), {
        programOrganizationId: "some_other_org",
        scopeLevel: "program",
        nexusProgramId: PROGRAM,
      }),
    ).toBe(false);
  });

  it("InMemoryLibraryStore.listEntries returns the legacy row under a program read", async () => {
    const store = new InMemoryLibraryStore({ entries: [legacyEntry()] });
    const rows = await store.listEntries("board", {
      programOrganizationId: ORG,
      scopeLevel: "program",
      nexusProgramId: PROGRAM,
    });
    expect(rows.map((r) => r.entryId)).toEqual(["le_legacy"]);
  });
});
