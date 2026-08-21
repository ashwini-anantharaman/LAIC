/**
 * Who is CONFINED to the folders shared with them, and who governs the library.
 *
 * Folder grants (migration 0012) narrow what a person sees to the subtrees they
 * were given. That is the whole point of "give these three people the B2F3 folder
 * and nothing else" — but it makes _governsLibrary the hinge on which the feature
 * either works or silently exposes the entire library, so it gets tests of its own.
 *
 * Two failure directions, both bad and neither type-checkable:
 *
 *   TOO WIDE  — a content editor counts as a governor, so sharing them one folder
 *               hands them every folder. The grant becomes decorative.
 *   TOO NARROW — a content manager counts as confined, so the moment anyone shares
 *               a folder WITH them they lose the rest of the library they curate.
 *
 * The rule under test: a governor is someone who ACTS on the library as a whole.
 * `library.console` is deliberately not enough — everyone here holds it, so keying
 * on it would exempt everybody and confine nobody.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// Isolated local store BEFORE importing app modules (forces demo mode).
const tempDir = mkdtempSync(join(tmpdir(), "owlwise-folders-"));
process.env.LOCAL_DATA_DIR = tempDir;
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.DATABASE_URL = "";
process.env.SUPABASE_DB_URL = "";

const { _governsLibrary } = await import("../src/routes/platform");

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

const eff = (capabilities: string[], fineGrained = true) => ({ capabilities, fineGrained });

describe("who governs the Content Library", () => {
  it("a content manager governs it — sharing a folder with them must not shrink their view", () => {
    expect(
      _governsLibrary(
        eff([
          "learning.library.console",
          "learning.library.share_view",
          "learning.library.share_club",
          "learning.library.share_member",
          "learning.library.folder_manage",
        ]),
      ),
    ).toBe(true);
  });

  it("a content editor does NOT govern it — one shared folder must mean one folder", () => {
    expect(
      _governsLibrary(
        eff(["learning.library.console", "learning.object.read", "learning.object.edit"]),
      ),
    ).toBe(false);
  });

  it("a club mentor who may file content does NOT govern it", () => {
    // file_content is a WRITE, and a strong one, but it acts on the folders the
    // holder was already given. Treating it as governance would let anyone who can
    // file into a folder browse every folder — the opposite of the point.
    expect(
      _governsLibrary(
        eff([
          "learning.library.console",
          "learning.object.read",
          "learning.library.file_content",
        ]),
      ),
    ).toBe(false);
  });

  it("library.console alone never governs — everyone confined holds it too", () => {
    expect(_governsLibrary(eff(["learning.library.console"]))).toBe(false);
  });

  it("share_view alone never governs — reading the guest list is not curating", () => {
    expect(
      _governsLibrary(eff(["learning.library.console", "learning.library.share_view"])),
    ).toBe(false);
  });

  it.each([
    "learning.library.folder_manage",
    "learning.library.share_club",
    "learning.library.share_member",
    "learning.library.share_app",
    "learning.roles.delegate",
  ])("%s governs the library", (cap) => {
    expect(_governsLibrary(eff(["learning.library.console", cap]))).toBe(true);
  });

  it("a capability-less role governs, because it is UNGATED rather than weak", () => {
    // fineGrained false means the caller's authority came from their launch LEVEL,
    // not from a role — _requireLearningCap returns early for them. Confining such
    // a caller would be confining an admin.
    expect(_governsLibrary(eff([], false))).toBe(true);
  });

  it("an empty capability list with fine-grained ON is confined, not exempt", () => {
    // The mirror of the case above, and the one that must not be conflated with it:
    // a ROLE that grants nothing is the weakest caller there is.
    expect(_governsLibrary(eff([], true))).toBe(false);
  });

  it("an app administrator does not govern the program library", () => {
    // Their authority is a granted catalogue, not the library. app.administer is
    // deliberately absent from the governor set.
    expect(
      _governsLibrary(eff(["learning.library.console", "learning.app.administer"])),
    ).toBe(false);
  });
});
