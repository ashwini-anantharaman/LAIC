import { beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeItem } from "./model";
import { KbService } from "./service";
import { InMemoryKbStore, type KbStore } from "./store";

function clock() {
  let t = Date.parse("2026-07-16T00:00:00.000Z");
  return () => new Date((t += 1000)).toISOString();
}

const fallbackItem = (title: string): Omit<KnowledgeItem, "itemId" | "version" | "createdAt" | "updatedAt"> => ({
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

describe("deleteKb", () => {
  it("refuses to delete a KB with derived children", async () => {
    const master = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    await svc.deriveKb(master.kbId, { name: "SAYC beginner", createdBy: "u", mode: "linked" });

    await expect(svc.deleteKb(master.kbId)).rejects.toThrow(/derived from this KB/);
    expect(await store.getKb(master.kbId)).not.toBeNull();
  });

  it("hard-deletes items, packs, players, versions once the only owner", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const item = await svc.createItem(kb.kbId, fallbackItem("Pass"));
    await svc.commitItemVersion(item.itemId, "u");
    await svc.savePack({ kbId: kb.kbId, name: "Floor", ordinal: 0, itemIds: [item.itemId], createdBy: "u" });
    await svc.publishKbVersion(kb.kbId, { publishedBy: "u" });

    await svc.deleteKb(kb.kbId);

    expect(await store.getKb(kb.kbId)).toBeNull();
    expect(await store.getItem(item.itemId)).toBeNull();
    expect(await store.listItemVersions(item.itemId)).toHaveLength(0);
    expect(await store.listPacksForKb(kb.kbId)).toHaveLength(0);
    expect(await store.listKbVersions(kb.kbId)).toHaveLength(0);
    expect(await store.listCompilesForKb(kb.kbId)).toHaveLength(0);
  });

  it("keeps a shared item alive in the other KB when only one owner is deleted", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const item = await svc.createItem(kb.kbId, fallbackItem("Pass"));
    const child = await svc.deriveKb(kb.kbId, {
      name: "Child",
      createdBy: "u",
      mode: "linked",
      includeItemIds: [item.itemId],
    });

    await svc.deleteKb(child.kbId);

    expect(await store.getKb(child.kbId)).toBeNull();
    expect(await store.getItem(item.itemId)).not.toBeNull(); // still owned by the master
    expect((await store.listItemsForKb(kb.kbId)).map((i) => i.itemId)).toContain(item.itemId);
  });

  it("allows deleting the master once its derivative is gone", async () => {
    const master = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const child = await svc.deriveKb(master.kbId, { name: "Child", createdBy: "u", mode: "linked" });
    await svc.deleteKb(child.kbId);
    await expect(svc.deleteKb(master.kbId)).resolves.toBeUndefined();
    expect(await store.getKb(master.kbId)).toBeNull();
  });
});
