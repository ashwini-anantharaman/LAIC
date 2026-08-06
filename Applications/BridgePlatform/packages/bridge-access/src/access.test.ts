// Access catalogue behaviors: default role sets, per-catalogue overrides, the
// unknown-key escape hatch (a typo must never brick a page), registry sanity,
// and the store roundtrip (in-memory + JSON-file persistence).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCESS_FEATURES,
  ALL_BRIDGE_ROLES,
  canAccess,
  defaultCatalogue,
  InMemoryAccessStore,
  type AccessCatalogue,
} from "./index";
import { JsonFileAccessStore } from "./fileStore";

describe("defaults", () => {
  it("gates admin-only pages by defaultRoles", () => {
    expect(canAccess(defaultCatalogue(), "page.kb", ["bridge_learner"])).toBe(false);
    expect(canAccess(defaultCatalogue(), "page.kb", ["bridge_fellow"])).toBe(true);
  });
  it("leaves all-role pages open", () => {
    expect(canAccess(defaultCatalogue(), "page.play", ["bridge_learner"])).toBe(true);
  });
});

describe("rule overrides", () => {
  const hidden: AccessCatalogue = {
    catalogueId: "global",
    rules: { "page.library": ["bridge_fellow"] },
  };
  it("hides a page from a role dropped by the rule", () => {
    expect(canAccess(hidden, "page.library", ["bridge_learner"])).toBe(false);
  });
  it("keeps a page for a role the rule still lists", () => {
    expect(canAccess(hidden, "page.library", ["bridge_fellow"])).toBe(true);
  });
});

describe("unknown keys", () => {
  it("are visible — a typo must not brick a page for everyone", () => {
    expect(canAccess(defaultCatalogue(), "page.nonexistent", ["bridge_guest"])).toBe(true);
  });
});

describe("registry sanity", () => {
  it("has unique keys", () => {
    const keys = ACCESS_FEATURES.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("gives every feature a non-empty defaultRoles", () => {
    for (const f of ACCESS_FEATURES) expect(f.defaultRoles.length).toBeGreaterThan(0);
  });
  it("only lists real roles in defaultRoles", () => {
    for (const f of ACCESS_FEATURES)
      for (const r of f.defaultRoles) expect(ALL_BRIDGE_ROLES).toContain(r);
  });
  it("covers the Pages, Table, Players, Library and Organization groups", () => {
    const groups = new Set(ACCESS_FEATURES.map((f) => f.group));
    expect(groups).toEqual(new Set(["Pages", "Table", "Players", "Library", "Organization"]));
  });
});

describe("store roundtrip", () => {
  it("in-memory put/get", async () => {
    const store = new InMemoryAccessStore();
    expect(await store.getCatalogue("global")).toBeNull();
    const cat: AccessCatalogue = { catalogueId: "global", rules: { "page.kb": ["bridge_fellow"] } };
    await store.putCatalogue(cat);
    expect(await store.getCatalogue("global")).toEqual(cat);
  });
  it("JSON file persists across two instances", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "bridge-access-")), "access-store.json");
    const cat: AccessCatalogue = {
      catalogueId: "global",
      rules: { "page.library": ["bridge_fellow"] },
      updatedBy: "user_x",
    };
    await new JsonFileAccessStore(file).putCatalogue(cat);
    const reopened = new JsonFileAccessStore(file);
    expect(await reopened.getCatalogue("global")).toEqual(cat);
  });
});
