import { beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeItem } from "./model";
import { KbService } from "./service";
import { InMemoryKbStore, type KbStore } from "./store";
import { itemIsDirty } from "./versioning";

// A deterministic, monotonic clock so committedAt/updatedAt differ per call.
function clock() {
  let t = Date.parse("2026-07-16T00:00:00.000Z");
  return () => new Date((t += 1000)).toISOString();
}

type NewItem = Omit<KnowledgeItem, "itemId" | "version" | "createdAt" | "updatedAt">;

const fallbackItem = (title: string, phase: KnowledgeItem["phase"] = "auction"): NewItem => ({
  title,
  humanReadableText: `${title} body`,
  knowledgeType: "fallback_rule",
  phase,
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

describe("item versioning", () => {
  it("commits contiguous immutable versions and is no-op-safe when clean", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const item = await svc.createItem(kb.kbId, fallbackItem("Pass"));

    const v1 = await svc.commitItemVersion(item.itemId, "u");
    expect(v1.versionNumber).toBe(1);
    expect((await store.getItem(item.itemId))?.committedVersion).toBe(1);

    // Committing an unchanged head returns the same version — no v2 minted.
    const again = await svc.commitItemVersion(item.itemId, "u");
    expect(again.versionNumber).toBe(1);
    expect(await svc.listItemVersions(item.itemId)).toHaveLength(1);

    // Edit the head, then commit → v2. v1 stays frozen with its old content.
    await svc.saveItem(kb.kbId, item.itemId, { humanReadableText: "changed" }, "u");
    const v2 = await svc.commitItemVersion(item.itemId, "u");
    expect(v2.versionNumber).toBe(2);
    const history = await svc.listItemVersions(item.itemId);
    expect(history.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect((await store.getItemVersion(item.itemId, 1))?.humanReadableText).toBe("Pass body");
    expect((await store.getItemVersion(item.itemId, 2))?.humanReadableText).toBe("changed");
  });

  it("itemIsDirty tracks head vs latest committed content", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const item = await svc.createItem(kb.kbId, fallbackItem("Pass"));
    expect(itemIsDirty(item, null)).toBe(true);

    await svc.commitItemVersion(item.itemId, "u");
    const clean = await store.getItem(item.itemId);
    const latest = (await svc.listItemVersions(item.itemId))[0] ?? null;
    expect(itemIsDirty(clean!, latest)).toBe(false);

    const edited = await svc.saveItem(kb.kbId, item.itemId, { title: "Pass v2" }, "u");
    expect(itemIsDirty(edited, latest)).toBe(true);
  });

  it("makes an old version main without minting a new one", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const item = await svc.createItem(kb.kbId, fallbackItem("Original"));
    await svc.commitItemVersion(item.itemId, "u"); // v1, main=1
    await svc.saveItem(kb.kbId, item.itemId, { title: "Renamed" }, "u");
    await svc.commitItemVersion(item.itemId, "u"); // v2, main=2
    expect(await svc.listItemVersions(item.itemId)).toHaveLength(2);

    const back = await svc.setItemMainVersion(kb.kbId, item.itemId, 1, "u");
    expect(back.title).toBe("Original");
    expect(back.mainVersion).toBe(1);
    // Switching main did NOT create a new version.
    expect(await svc.listItemVersions(item.itemId)).toHaveLength(2);

    // Committing now (head == v1 content == main) is a no-op — nothing changed.
    const noop = await svc.commitItemVersion(item.itemId, "u");
    expect(noop.versionNumber).toBe(1);
    expect(await svc.listItemVersions(item.itemId)).toHaveLength(2);
  });
});

describe("KB versioning (releases)", () => {
  it("publishes a manifest pinning committed item versions + the compile", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const a = await svc.createItem(kb.kbId, fallbackItem("Pass"));
    const b = await svc.createItem(kb.kbId, fallbackItem("Low lead", "opening_lead"));

    const { version: release, created } = await svc.publishKbVersion(kb.kbId, { label: "core", publishedBy: "u" });
    expect(created).toBe(true);
    expect(release.versionNumber).toBe(1);
    expect(release.compileId).toBeTruthy();
    expect(release.items).toEqual(
      expect.arrayContaining([
        { itemId: a.itemId, versionNumber: 1 },
        { itemId: b.itemId, versionNumber: 1 },
      ]),
    );
    const afterPublish = await svc.getKb(kb.kbId);
    expect(afterPublish.latestVersionNumber).toBe(1);
    expect(afterPublish.activeVersionId).toBe(release.versionId); // publish sets active

    // The pinned compile resolves back to a real artifact.
    const compiled = await svc.compileForVersion(release.versionId);
    expect(compiled.compileId).toBe(release.compileId);

    // A second publish after an edit mints v2 and pins the item's v2.
    await svc.saveItem(kb.kbId, a.itemId, { humanReadableText: "reworded" }, "u");
    const { version: v2, created: created2 } = await svc.publishKbVersion(kb.kbId, { publishedBy: "u" });
    expect(created2).toBe(true);
    expect(v2.versionNumber).toBe(2);
    expect(v2.items.find((i) => i.itemId === a.itemId)?.versionNumber).toBe(2);
    expect(v2.items.find((i) => i.itemId === b.itemId)?.versionNumber).toBe(1); // untouched

    // Publishing again with no changes does NOT mint a duplicate.
    const { version: again, created: created3 } = await svc.publishKbVersion(kb.kbId, { publishedBy: "u" });
    expect(created3).toBe(false);
    expect(again.versionNumber).toBe(2);
    expect((await svc.listKbVersions(kb.kbId))).toHaveLength(2);
  });

  it("deletes an item version but guards main + release-pinned", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const item = await svc.createItem(kb.kbId, fallbackItem("Pass"));
    await svc.commitItemVersion(item.itemId, "u"); // v1, main=1
    await svc.saveItem(kb.kbId, item.itemId, { humanReadableText: "b" }, "u");
    await svc.commitItemVersion(item.itemId, "u"); // v2, main=2

    // Can't delete the main version.
    await expect(svc.deleteItemVersion(kb.kbId, item.itemId, 2)).rejects.toThrow(/main version/);

    // v1 isn't main and isn't pinned → deletable.
    await svc.deleteItemVersion(kb.kbId, item.itemId, 1);
    expect((await svc.listItemVersions(item.itemId)).map((v) => v.versionNumber)).toEqual([2]);

    // Pin v2 via a release, then it can't be deleted (after moving main off it).
    await svc.publishKbVersion(kb.kbId, { publishedBy: "u" }); // release pins item@2
    await svc.saveItem(kb.kbId, item.itemId, { humanReadableText: "c" }, "u");
    await svc.commitItemVersion(item.itemId, "u"); // v3, main=3
    await expect(svc.deleteItemVersion(kb.kbId, item.itemId, 2)).rejects.toThrow(/pinned/);
  });

  it("deletes a KB release but guards active + derived-from", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const item = await svc.createItem(kb.kbId, fallbackItem("Pass"));
    const { version: v1 } = await svc.publishKbVersion(kb.kbId, { publishedBy: "u" });
    await svc.saveItem(kb.kbId, item.itemId, { humanReadableText: "b" }, "u");
    const { version: v2 } = await svc.publishKbVersion(kb.kbId, { publishedBy: "u" }); // active = v2

    // Can't delete the active version.
    await expect(svc.deleteKbVersion(kb.kbId, v2.versionId)).rejects.toThrow(/active version/);

    // A child branched from v1 → v1 can't be deleted.
    await svc.deriveKb(kb.kbId, { name: "child", createdBy: "u", mode: "linked", fromVersionId: v1.versionId });
    await expect(svc.deleteKbVersion(kb.kbId, v1.versionId)).rejects.toThrow(/derived from/);
  });

  it("promotes an earlier version to active (rollback) without re-publishing", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const item = await svc.createItem(kb.kbId, fallbackItem("Pass"));
    const { version: v1 } = await svc.publishKbVersion(kb.kbId, { publishedBy: "u" });
    await svc.saveItem(kb.kbId, item.itemId, { humanReadableText: "reworded" }, "u");
    const { version: v2 } = await svc.publishKbVersion(kb.kbId, { publishedBy: "u" });

    expect((await svc.getKb(kb.kbId)).activeVersionId).toBe(v2.versionId);
    await svc.setActiveVersion(kb.kbId, v1.versionId);
    expect((await svc.getKb(kb.kbId)).activeVersionId).toBe(v1.versionId);
    // Both versions still exist — rollback is a pointer move, not a delete.
    expect(await svc.listKbVersions(kb.kbId)).toHaveLength(2);
  });

  it("refuses to publish a KB that does not compile", async () => {
    const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const dup = { key: "clash", label: "x", control: "toggle" as const, role: "enable" as const, default: false };
    await svc.createItem(kb.kbId, { ...fallbackItem("A"), settings: [dup] });
    await svc.createItem(kb.kbId, { ...fallbackItem("B"), settings: [dup] });

    await expect(svc.publishKbVersion(kb.kbId, { publishedBy: "u" })).rejects.toThrow(/does not compile/);
  });
});

describe("KB derivation (master → limited)", () => {
  async function master() {
    const kb = await svc.createKb({ name: "SAYC master", systemLabel: "SAYC", createdBy: "u" });
    const items: [KnowledgeItem, KnowledgeItem, KnowledgeItem] = [
      await svc.createItem(kb.kbId, fallbackItem("Pass")),
      await svc.createItem(kb.kbId, fallbackItem("Low lead", "opening_lead")),
      await svc.createItem(kb.kbId, fallbackItem("Stayman")),
    ];
    return { kb, items };
  }

  it("linked derivation shares a subset; child edits fork without touching master", async () => {
    const { kb, items } = await master();
    const child = await svc.deriveKb(kb.kbId, {
      name: "SAYC beginner",
      createdBy: "u",
      mode: "linked",
      includeItemIds: [items[0].itemId, items[1].itemId],
    });

    expect(child.derivedFromKbId).toBe(kb.kbId);
    expect(child.systemLabel).toBe("SAYC"); // pairing compatibility kept
    const childItems = await store.listItemsForKb(child.kbId);
    expect(childItems.map((i) => i.itemId).sort()).toEqual([items[0].itemId, items[1].itemId].sort());

    // Editing the shared item inside the child forks it; master keeps the original.
    const edited = await svc.saveItem(child.kbId, items[0].itemId, { title: "Beginner pass" }, "u");
    expect(edited.itemId).not.toBe(items[0].itemId);
    expect(edited.forkedFromItemId).toBe(items[0].itemId);
    expect((await store.getItem(items[0].itemId))?.title).toBe("Pass"); // master untouched
  });

  it("copied derivation clones items independently with fresh lineage", async () => {
    const { kb, items } = await master();
    const child = await svc.deriveKb(kb.kbId, {
      name: "SAYC fork",
      createdBy: "u",
      mode: "copied",
      includeItemIds: [items[0].itemId],
    });
    const childItems = await store.listItemsForKb(child.kbId);
    expect(childItems).toHaveLength(1);
    const first = childItems[0]!;
    expect(first.itemId).not.toBe(items[0].itemId);
    expect(first.forkedFromItemId).toBe(items[0].itemId);
    expect(first.committedVersion).toBeUndefined();
  });

  it("duplicateKb copies everything as an independent KB", async () => {
    const { kb, items } = await master();
    const copy = await svc.duplicateKb(kb.kbId, { name: "SAYC copy", createdBy: "u" });
    const copyItems = await store.listItemsForKb(copy.kbId);
    expect(copyItems).toHaveLength(items.length);
    expect(copyItems.every((i) => !items.some((m) => m.itemId === i.itemId))).toBe(true);
  });

  it("reports an upgrade when the master publishes past the branch point", async () => {
    const { kb, items } = await master();
    const { version: v1 } = await svc.publishKbVersion(kb.kbId, { publishedBy: "u" });
    const child = await svc.deriveKb(kb.kbId, { name: "child", createdBy: "u", mode: "linked" });
    expect(child.derivedFromVersionId).toBe(v1.versionId);

    let status = await svc.derivationStatus(child.kbId);
    expect(status.upgradeAvailable).toBe(false);

    await svc.saveItem(kb.kbId, items[0].itemId, { humanReadableText: "master edit" }, "u");
    await svc.publishKbVersion(kb.kbId, { publishedBy: "u" }); // v2
    status = await svc.derivationStatus(child.kbId);
    expect(status.upgradeAvailable).toBe(true);
  });
});
