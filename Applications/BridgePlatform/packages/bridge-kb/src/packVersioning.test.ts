import { beforeEach, describe, expect, it } from "vitest";
import type { KbPlayer, KnowledgeItem } from "./model";
import { KbService } from "./service";
import { InMemoryKbStore, type KbStore } from "./store";

// Same deterministic clock as versioning.test.ts.
function clock() {
  let t = Date.parse("2026-07-17T00:00:00.000Z");
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

const playerOn = (kbId: string, packIds: string[], name = "P"): KbPlayer => ({
  playerId: `pl_${name}`,
  kbId,
  name,
  enabledPackIds: packIds,
  settingOverrides: {},
  decisionPolicyId: "first_match",
  fallbackPolicyId: "standard",
  validationStatus: "draft",
  ownerType: "coach",
  version: 1,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
});

let store: KbStore;
let svc: KbService;

beforeEach(() => {
  store = new InMemoryKbStore();
  svc = new KbService(store, { now: clock() });
});

async function seedKb() {
  const kb = await svc.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
  const a = await svc.createItem(kb.kbId, fallbackItem("Pass"));
  const b = await svc.createItem(kb.kbId, fallbackItem("Lead low"));
  return { kb, a, b };
}

describe("knowledge-set auto-versioning", () => {
  it("snapshots every save with contiguous numbers and dedupes identical re-saves", async () => {
    const { kb, a, b } = await seedKb();
    const pack = await svc.savePack({
      kbId: kb.kbId,
      name: "Floor",
      itemIds: [a.itemId],
      createdBy: "u",
    });
    expect((await svc.listPackVersions(pack.packId)).map((v) => v.versionNumber)).toEqual([1]);

    // Identical content (even with itemIds reordered) → no new snapshot.
    await svc.savePack({ ...pack, itemIds: [...pack.itemIds].reverse() });
    expect(await svc.listPackVersions(pack.packId)).toHaveLength(1);

    // Real change → v2.
    await svc.savePack({ ...pack, itemIds: [a.itemId, b.itemId] });
    const history = await svc.listPackVersions(pack.packId);
    expect(history.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(history[1]?.itemIds).toEqual([a.itemId]);
  });

  it("envelope recomputation never mints snapshots", async () => {
    const { kb, a } = await seedKb();
    const pack = await svc.savePack({
      kbId: kb.kbId,
      name: "Floor",
      itemIds: [a.itemId],
      createdBy: "u",
    });
    // savePack already ran recompile → deriveEnvelopes wrote the pack directly.
    expect((await store.getPack(pack.packId))?.derivedEnvelope).toBeDefined();
    expect(await svc.listPackVersions(pack.packId)).toHaveLength(1);
    // A second full recompile cycle also stays quiet.
    await svc.recompile(kb.kbId);
    expect(await svc.listPackVersions(pack.packId)).toHaveLength(1);
  });

  it("rejects self-includes and include cycles at save time", async () => {
    const { kb, a, b } = await seedKb();
    const base = await svc.savePack({ kbId: kb.kbId, name: "Base", itemIds: [a.itemId], createdBy: "u" });
    const top = await svc.savePack({
      kbId: kb.kbId,
      name: "Top",
      itemIds: [b.itemId],
      extendsPackId: base.packId,
      createdBy: "u",
    });
    await expect(svc.savePack({ ...top, extendsPackId: top.packId })).rejects.toThrow(/itself/);
    await expect(svc.savePack({ ...base, extendsPackId: top.packId })).rejects.toThrow(/loop/);
    await expect(svc.savePack({ ...base, extendsPackId: "pk_missing" })).rejects.toThrow(
      /no longer exists/,
    );
  });

  it("restore overlays a snapshot, sanitizes dropped references, and mints a new version", async () => {
    const { kb, a, b } = await seedKb();
    const pack = await svc.savePack({
      kbId: kb.kbId,
      name: "Openings",
      itemIds: [a.itemId, b.itemId],
      createdBy: "u",
    });
    await svc.savePack({ ...pack, name: "Openings v2", itemIds: [a.itemId] }); // v2

    // Restoring the latest state is a dedupe no-op.
    await svc.restorePackVersion(kb.kbId, pack.packId, 2, "u");
    expect(await svc.listPackVersions(pack.packId)).toHaveLength(2);

    // Item b leaves the KB → restoring v1 drops it and reports the drop.
    await store.removeMembership({ kbId: kb.kbId, itemId: b.itemId });
    const { pack: restored, droppedItemIds } = await svc.restorePackVersion(
      kb.kbId,
      pack.packId,
      1,
      "u",
    );
    expect(restored.name).toBe("Openings");
    expect(restored.itemIds).toEqual([a.itemId]);
    expect(droppedItemIds).toEqual([b.itemId]);
    expect((await svc.listPackVersions(pack.packId))[0]?.versionNumber).toBe(3);
  });

  it("packReferences finds direct players, via-includes players, and including sets", async () => {
    const { kb, a, b } = await seedKb();
    const base = await svc.savePack({ kbId: kb.kbId, name: "Base", itemIds: [a.itemId], createdBy: "u" });
    const top = await svc.savePack({
      kbId: kb.kbId,
      name: "Top",
      itemIds: [b.itemId],
      extendsPackId: base.packId,
      createdBy: "u",
    });
    await store.putPlayer(playerOn(kb.kbId, [base.packId], "direct"));
    await store.putPlayer(playerOn(kb.kbId, [top.packId], "indirect"));

    const refs = await svc.packReferences(kb.kbId, base.packId);
    expect(refs.extendedBy.map((p) => p.name)).toEqual(["Top"]);
    const byName = Object.fromEntries(refs.players.map((r) => [r.player.name, r.via?.name]));
    expect(byName).toEqual({ direct: undefined, indirect: "Top" });
  });

  it("deletePack refuses while referenced, then deletes with its history", async () => {
    const { kb, a, b } = await seedKb();
    const base = await svc.savePack({ kbId: kb.kbId, name: "Base", itemIds: [a.itemId], createdBy: "u" });
    const top = await svc.savePack({
      kbId: kb.kbId,
      name: "Top",
      itemIds: [b.itemId],
      extendsPackId: base.packId,
      createdBy: "u",
    });
    await store.putPlayer(playerOn(kb.kbId, [base.packId], "House · Base"));

    await expect(svc.deletePack(kb.kbId, base.packId)).rejects.toThrow(/House · Base/);
    await expect(svc.deletePack(kb.kbId, base.packId)).rejects.toThrow(/"Top" includes it/);

    await store.deletePlayer("pl_House · Base");
    await svc.savePack({ ...top, extendsPackId: undefined });
    await svc.deletePack(kb.kbId, base.packId);
    expect(await store.getPack(base.packId)).toBeNull();
    expect(await svc.listPackVersions(base.packId)).toHaveLength(0);
  });

  it("deleteKb cascades pack version history", async () => {
    const { kb, a } = await seedKb();
    const pack = await svc.savePack({ kbId: kb.kbId, name: "Floor", itemIds: [a.itemId], createdBy: "u" });
    await svc.savePack({ ...pack, name: "Floor v2" });
    expect(await svc.listPackVersions(pack.packId)).toHaveLength(2);
    await svc.deleteKb(kb.kbId);
    expect(await svc.listPackVersions(pack.packId)).toHaveLength(0);
  });
});
