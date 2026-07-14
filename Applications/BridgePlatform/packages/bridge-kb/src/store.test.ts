import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonFileKbStore } from "./fileStore";
import { hashValue, newId } from "./ids";
import type { KnowledgeBase, KnowledgeItem } from "./model";
import { InMemoryKbStore } from "./store";

const kb = (kbId: string): KnowledgeBase => ({
  kbId,
  name: "SAYC",
  systemLabel: "SAYC",
  levels: [{ levelId: "lvl_min", name: "Minimal", ordinal: 0 }],
  status: "active",
  createdBy: "u_test",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
});

const item = (itemId: string): KnowledgeItem => ({
  itemId,
  title: "Always pass",
  humanReadableText: "With no agreement that applies, pass.",
  knowledgeType: "fallback_rule",
  phase: "auction",
  payload: { kind: "fallback", fallback: { phase: "auction", behavior: "pass" } },
  settings: [],
  sourceReferences: [{ sourceId: "src_claude", anchor: "platform fallback" }],
  supportedLevels: [],
  status: "approved",
  version: 1,
  createdBy: "u_test",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
});

describe("InMemoryKbStore", () => {
  it("round-trips KBs, items, memberships, and edges", async () => {
    const store = new InMemoryKbStore();
    await store.putKb(kb("kb_sayc"));
    await store.putItem(item("ki_pass"));
    await store.addMembership({ kbId: "kb_sayc", itemId: "ki_pass" });

    expect((await store.getKb("kb_sayc"))?.name).toBe("SAYC");
    expect((await store.listItemsForKb("kb_sayc")).map((i) => i.itemId)).toEqual(["ki_pass"]);

    await store.putEdge({
      edgeId: "e1",
      fromItemId: "ki_pass",
      edgeType: "teaches",
      toConceptId: "bn_opening_bids",
      origin: "fellow",
      confirmed: true,
      createdBy: "u_test",
      createdAt: "2026-07-14T00:00:00.000Z",
    });
    expect(await store.listEdgesTouching(["ki_pass"])).toHaveLength(1);
    expect(await store.listEdgesTouching(["ki_other"])).toHaveLength(0);

    await store.removeMembership({ kbId: "kb_sayc", itemId: "ki_pass" });
    expect(await store.listItemsForKb("kb_sayc")).toHaveLength(0);
  });

  it("membership add is idempotent", async () => {
    const store = new InMemoryKbStore();
    await store.addMembership({ kbId: "kb_sayc", itemId: "ki_pass" });
    await store.addMembership({ kbId: "kb_sayc", itemId: "ki_pass" });
    expect(await store.listMembershipsForKb("kb_sayc")).toHaveLength(1);
  });
});

describe("JsonFileKbStore", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("persists across instances", async () => {
    dir = mkdtempSync(join(tmpdir(), "kbstore-"));
    const path = join(dir, "kb.json");
    const a = new JsonFileKbStore(path);
    await a.putKb(kb("kb_sayc"));
    await a.putItem(item("ki_pass"));

    const b = new JsonFileKbStore(path);
    expect((await b.getKb("kb_sayc"))?.systemLabel).toBe("SAYC");
    expect((await b.getItem("ki_pass"))?.knowledgeType).toBe("fallback_rule");
  });
});

describe("ids", () => {
  it("hashValue is stable under key order", () => {
    expect(hashValue({ a: 1, b: [2, 3] })).toBe(hashValue({ b: [2, 3], a: 1 }));
  });
  it("newId carries the prefix and is unique-ish", () => {
    const a = newId("kb");
    const b = newId("kb");
    expect(a.startsWith("kb_")).toBe(true);
    expect(a).not.toBe(b);
  });
});
