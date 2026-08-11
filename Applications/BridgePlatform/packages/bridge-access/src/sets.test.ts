// Capability-set designer: the partition (every registry key in exactly one
// set) and THE INVARIANT — compiling the default assignment reproduces every
// feature's built-in defaultRoles, proving the coarse designer model and the
// fine enforcement defaults agree.

import { describe, expect, it } from "vitest";
import { ACCESS_FEATURES } from "./index";
import {
  CAPABILITY_SETS,
  DEFAULT_ASSIGNMENT,
  compileAssignment,
  type SetAssignment,
} from "./sets";
import type { BridgeRole } from "@bridge/nexus-client";

/** Order-insensitive role-set equality. */
function sameRoles(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((r) => set.has(r));
}

/**
 * A set assignment and a compiled rule map are both keyed by plain strings, so
 * every lookup is `| undefined` under noUncheckedIndexedAccess. A key that is
 * missing is precisely the breakage these tests exist to catch, so surface it
 * as a failure here instead of threading optionals through every assertion.
 */
function rolesAt(map: Record<string, readonly BridgeRole[]>, key: string): readonly BridgeRole[] {
  const roles = map[key];
  if (!roles) throw new Error(`no roles for "${key}" — the partition is broken`);
  return roles;
}

describe("partition", () => {
  it("places every ACCESS_FEATURES key in exactly one set", () => {
    const counts = new Map<string, number>();
    for (const set of CAPABILITY_SETS)
      for (const key of set.featureKeys) counts.set(key, (counts.get(key) ?? 0) + 1);

    const knownKeys = new Set(ACCESS_FEATURES.map((f) => f.key));

    // Every registry key appears, and exactly once.
    for (const feature of ACCESS_FEATURES) {
      expect(counts.get(feature.key), `${feature.key} must appear once`).toBe(1);
    }
    // No set references an unknown key.
    for (const key of counts.keys()) {
      expect(knownKeys.has(key), `${key} is not a registry key`).toBe(true);
    }
    // The union covers exactly the 43 registry keys.
    expect(counts.size).toBe(knownKeys.size);
  });
});

describe("the invariant", () => {
  it("compileAssignment(DEFAULT_ASSIGNMENT) equals each feature's defaultRoles", () => {
    const compiled = compileAssignment(DEFAULT_ASSIGNMENT);
    for (const feature of ACCESS_FEATURES) {
      const roles = rolesAt(compiled, feature.key);
      expect(
        sameRoles(roles, feature.defaultRoles),
        `${feature.key}: compiled ${JSON.stringify(roles)} vs default ${JSON.stringify(feature.defaultRoles)}`,
      ).toBe(true);
    }
    // Nothing beyond the registry keys is produced.
    expect(Object.keys(compiled).sort()).toEqual(ACCESS_FEATURES.map((f) => f.key).sort());
  });
});

describe("compile reflects a toggle", () => {
  it("removing learner from the library set drops learner from all 6 library keys only", () => {
    const libraryKeys = CAPABILITY_SETS.find((s) => s.id === "library")!.featureKeys;
    expect(libraryKeys).toHaveLength(6);

    const before = compileAssignment(DEFAULT_ASSIGNMENT);
    const toggled: SetAssignment = {
      ...DEFAULT_ASSIGNMENT,
      library: rolesAt(DEFAULT_ASSIGNMENT, "library").filter((r) => r !== "bridge_learner"),
    };
    const after = compileAssignment(toggled);

    // Every library key loses exactly bridge_learner.
    for (const key of libraryKeys) {
      const was = rolesAt(before, key);
      const now = rolesAt(after, key);
      expect(was).toContain("bridge_learner");
      expect(now).not.toContain("bridge_learner");
      expect(sameRoles(now, was.filter((r) => r !== "bridge_learner"))).toBe(true);
    }
    // Every non-library key is unchanged.
    for (const feature of ACCESS_FEATURES) {
      if (libraryKeys.includes(feature.key)) continue;
      expect(sameRoles(rolesAt(after, feature.key), rolesAt(before, feature.key))).toBe(true);
    }
  });
});
