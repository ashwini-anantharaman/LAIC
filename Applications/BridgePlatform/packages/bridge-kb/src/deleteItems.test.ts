import { beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeItem } from "./model";
import { KbService } from "./service";
import { InMemoryKbStore, type KbStore } from "./store";

function clock() {
  let t = Date.parse("2026-07-20T00:00:00.000Z");
  return () => new Date((t += 1000)).toISOString();
}

type NewItem = Omit<KnowledgeItem, "itemId" | "version" | "createdAt" | "updatedAt">;

const fallbackItem = (title: string): NewItem => ({
  title,
  humanReadableText: `${title} body`,
  knowledgeType: "fallback_rule",
  phase: "auction",
  payload: { kind: "fallback", fallback: { phase: "auction", behavior: "pass" } },
  settings: [],
  sourceReferences: [{ sourceId: "src_claude", anchor: "test" }],
  supportedLevels: [],
  status: "draft",
  createdBy: "u_test",
});

let store: KbStore;
let svc: KbService;

beforeEach(() => {
  store = new InMemoryKbStore();
  svc = new KbService(store, { now: clock() });
});

describe("bulk item delete", () => {
  it("deletes items, strips them from sets (as a snapshot-versioned save), and recompiles", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const a = await svc.createItem(kb.kbId, fallbackItem("Pass"));
    const b = await svc.createItem(kb.kbId, fallbackItem("Lead low"));
    const pack = await svc.savePack({
      kbId: kb.kbId,
      name: "Floor",
      itemIds: [a.itemId, b.itemId],
      createdBy: "u",
    });

    const result = await svc.deleteItems(kb.kbId, [a.itemId], "u");
    expect(result.deleted.map((d) => d.title)).toEqual(["Pass"]);
    expect(result.blocked).toEqual([]);
    expect(result.setsTouched).toEqual(["Floor"]);

    expect(await store.getItem(a.itemId)).toBeNull();
    expect((await store.getPack(pack.packId))?.itemIds).toEqual([b.itemId]);
    // The strip minted a set snapshot (v1 creation + v2 removal).
    expect((await svc.listPackVersions(pack.packId)).length).toBe(2);
    // KB still compiles cleanly.
    expect((await svc.getKb(kb.kbId)).lastCompileError).toBeUndefined();
  });

  it("blocks items pinned by a published release and reports why", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const a = await svc.createItem(kb.kbId, fallbackItem("Pass"));
    const b = await svc.createItem(kb.kbId, fallbackItem("Lead low"));
    await svc.publishKbVersion(kb.kbId, { label: "Base", publishedBy: "u" });
    // A post-release item is NOT pinned and stays deletable.
    const c = await svc.createItem(kb.kbId, fallbackItem("Discard"));

    const result = await svc.deleteItems(kb.kbId, [a.itemId, b.itemId, c.itemId], "u");
    expect(result.deleted.map((d) => d.title)).toEqual(["Discard"]);
    expect(result.blocked.map((x) => x.title).sort()).toEqual(["Lead low", "Pass"]);
    expect(result.blocked[0]?.reason).toMatch(/pinned by published release v1/);
    expect(await store.getItem(a.itemId)).not.toBeNull();
    expect(await store.getItem(c.itemId)).toBeNull();
  });

  it("only detaches an item another KB still shares, and cleans edges on full delete", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const a = await svc.createItem(kb.kbId, fallbackItem("Pass"));
    const b = await svc.createItem(kb.kbId, fallbackItem("Lead low"));
    await svc.addEdge(kb.kbId, {
      fromItemId: b.itemId,
      edgeType: "requires",
      toItemId: a.itemId,
      origin: "fellow",
      confirmed: true,
      createdBy: "u",
    });
    const linked = await svc.deriveKb(kb.kbId, {
      mode: "linked",
      name: "SAYC child",
      createdBy: "u",
      includePacks: false,
    });

    // Shared elsewhere: membership here goes, the record survives.
    await svc.deleteItems(kb.kbId, [a.itemId], "u");
    expect(await store.getItem(a.itemId)).not.toBeNull();
    expect((await store.listMembershipsForItem(a.itemId)).map((m) => m.kbId)).toEqual([
      linked.kbId,
    ]);

    // Last membership: record, versions, and edges all go.
    await svc.deleteItems(linked.kbId, [a.itemId], "u");
    expect(await store.getItem(a.itemId)).toBeNull();
    expect(await store.listEdgesTouching([a.itemId])).toEqual([]);
  });

  it("reports unknown ids as blocked instead of throwing", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    await svc.createItem(kb.kbId, fallbackItem("Pass"));
    const result = await svc.deleteItems(kb.kbId, ["it_nope"], "u");
    expect(result.deleted).toEqual([]);
    expect(result.blocked[0]?.reason).toBe("not in this knowledge base");
  });
});
