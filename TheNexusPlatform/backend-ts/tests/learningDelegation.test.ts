/**
 * The ceiling around delegated role creation.
 *
 * `learning.roles.delegate` lets a Content Manager mint sub-roles without being
 * an admin. That is only safe while three things hold, and each is easy to get
 * wrong in a way no type checks:
 *
 *   1. A delegate cannot grant a capability they do not hold — including
 *      `roles.delegate` itself, which would turn one grant into an unbounded tree.
 *   2. A delegate cannot WIDEN a type scope. Holding `publish.release` limited to
 *      quizzes still reports `publish.release`, so an id-only ceiling would mint a
 *      sub-role holding it for every type — then assign it to themselves.
 *   3. A delegate cannot leave a role with NO capabilities. This is the
 *      counter-intuitive one: `_requireLearningCap` returns early when a caller's
 *      capabilities came from their launch LEVEL rather than a role, so an empty
 *      role is not a weak role, it is an UNGATED one. Stripping your own role is
 *      an escalation, and an id-set clamp cannot see it — ∅ is within every ceiling.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// Isolated local store BEFORE importing app modules (forces demo mode).
const tempDir = mkdtempSync(join(tmpdir(), "owlwise-delegation-"));
process.env.LOCAL_DATA_DIR = tempDir;
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.DATABASE_URL = "";
process.env.SUPABASE_DB_URL = "";

const { _clampToCeiling, _clampScopesToCeiling, _assertNotDisarming } = await import(
  "../src/routes/platform"
);

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

const ceilingOf = (capabilities: string[], typeScopes: Record<string, string[]> = {}) => ({
  capabilities,
  typeScopes,
});

describe("_clampToCeiling", () => {
  it("drops capabilities the creator does not hold", () => {
    const ceiling = ceilingOf(["learning.object.read", "learning.publish.release"]);
    expect(_clampToCeiling(["learning.object.read", "learning.object.delete"], ceiling))
      .toEqual(["learning.object.read"]);
  });

  it("never passes on roles.delegate, even when the creator holds it", () => {
    const ceiling = ceilingOf(["learning.roles.delegate", "learning.object.read"]);
    expect(_clampToCeiling(["learning.roles.delegate", "learning.object.read"], ceiling))
      .toEqual(["learning.object.read"]);
  });

  it("leaves a structural caller (null ceiling) untouched", () => {
    expect(_clampToCeiling(["anything", "learning.roles.delegate"], null))
      .toEqual(["anything", "learning.roles.delegate"]);
  });
});

describe("_clampScopesToCeiling", () => {
  it("inherits the creator's scope when the sub-role asks for none", () => {
    const ceiling = ceilingOf(["learning.publish.release"], { "learning.publish.release": ["quiz"] });
    // The escalation this blocks: unscoped means EVERY type downstream.
    expect(_clampScopesToCeiling(undefined, ["learning.publish.release"], ceiling))
      .toEqual({ "learning.publish.release": ["quiz"] });
  });

  it("intersects rather than trusting the requested list", () => {
    const ceiling = ceilingOf(["learning.publish.release"], {
      "learning.publish.release": ["quiz", "flashcard_set"],
    });
    expect(
      _clampScopesToCeiling(
        { "learning.publish.release": ["quiz", "tutorial_v2"] },
        ["learning.publish.release"],
        ceiling,
      ),
    ).toEqual({ "learning.publish.release": ["quiz"] });
  });

  it("falls back to the creator's list when the intersection is empty", () => {
    const ceiling = ceilingOf(["learning.publish.release"], { "learning.publish.release": ["quiz"] });
    // NOT {} — an absent scope means unrestricted, which would be a widening.
    expect(
      _clampScopesToCeiling(
        { "learning.publish.release": ["tutorial_v2"] },
        ["learning.publish.release"],
        ceiling,
      ),
    ).toEqual({ "learning.publish.release": ["quiz"] });
  });

  it("leaves capabilities the creator holds unscoped alone", () => {
    const ceiling = ceilingOf(["learning.object.read"], {});
    expect(_clampScopesToCeiling(undefined, ["learning.object.read"], ceiling)).toBeUndefined();
  });

  it("does not constrain a structural caller", () => {
    expect(_clampScopesToCeiling({ x: ["y"] }, ["x"], null)).toEqual({ x: ["y"] });
  });
});

describe("_assertNotDisarming", () => {
  it("refuses to let a delegate write a capability-less role", () => {
    expect(() => _assertNotDisarming([], ceilingOf(["learning.object.read"]))).toThrow(
      /at least one capability/,
    );
  });

  it("allows a delegate a non-empty role", () => {
    expect(() => _assertNotDisarming(["learning.object.read"], ceilingOf(["learning.object.read"])))
      .not.toThrow();
  });

  it("allows a structural admin to write an empty role", () => {
    // They already hold everything; the ungated path is no gain for them.
    expect(() => _assertNotDisarming([], null)).not.toThrow();
  });
});
