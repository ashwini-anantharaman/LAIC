// Stage B acceptance (kb side): the compiler produces ordered, gated,
// provenance-carrying artifacts; the service auto-recompiles with last-good
// protection and forks shared items on divergence; the static capability
// checker distinguishes minimally complete from incomplete players.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_EDGES, FIXTURE_ITEMS, fixturePacks } from "./fixture";
import type { KbPlayer, KnowledgeBase } from "./model";
import { KbService } from "./service";
import { InMemoryKbStore } from "./store";
import { playerIsValid, validatePlayerStatic } from "./validatePlayer";

const NOW = "2026-07-14T12:00:00.000Z";

async function seedKb(store: InMemoryKbStore, service: KbService): Promise<KnowledgeBase> {
  const kb = await service.createKb({
    name: "Fixture SAYC",
    systemLabel: "SAYC",
    createdBy: "u_test",
  });
  for (const item of FIXTURE_ITEMS) {
    await store.putItem(item);
    await store.addMembership({ kbId: kb.kbId, itemId: item.itemId });
  }
  for (const edge of FIXTURE_EDGES) await store.putEdge(edge);
  for (const pack of fixturePacks(kb.kbId)) await store.putPack(pack);
  await service.recompile(kb.kbId);
  return (await store.getKb(kb.kbId))!;
}

function player(over: Partial<KbPlayer>): KbPlayer {
  return {
    playerId: "pl_test",
    kbId: "kb_x",
    name: "Test player",
    enabledPackIds: [],
    settingOverrides: {},
    decisionPolicyId: "first_match",
    fallbackPolicyId: "standard",
    validationStatus: "draft",
    ownerType: "system",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("compileKb via KbService", () => {
  let store: InMemoryKbStore;
  let service: KbService;
  let kb: KnowledgeBase;

  beforeEach(async () => {
    store = new InMemoryKbStore();
    service = new KbService(store, { now: () => NOW });
    kb = await seedKb(store, service);
  });

  it("compiles with band ordering, settings registry, and flattened packs", async () => {
    const compiled = (await service.liveCompile(kb.kbId))!;
    expect(compiled).toBeTruthy();

    // Convention band (Stayman) fires before agreement/rule band.
    const ids = compiled.auctionRules.map((r) => r.ruleId);
    expect(ids.indexOf("ki_stayman.ask")).toBeLessThan(ids.indexOf("ki_open_2c.open"));
    // Within the agreement band, priority orders 2C before 1NT before majors.
    expect(ids.indexOf("ki_open_2c.open")).toBeLessThan(ids.indexOf("ki_open_1nt.open"));
    expect(ids.indexOf("ki_open_1nt.open")).toBeLessThan(ids.indexOf("ki_open_major.open"));

    // Inline settings aggregate with provenance and defaults.
    const ntRange = compiled.settings.find((s) => s.key === "nt_range");
    expect(ntRange?.itemId).toBe("ki_open_1nt");
    expect(compiled.defaults.nt_range).toEqual({ low: 15, high: 17 });

    // Enable settings gate their item's rules.
    const stayman = compiled.auctionRules.find((r) => r.ruleId === "ki_stayman.ask");
    expect(stayman?.settingGates).toEqual(["stayman_on"]);

    // Edges recorded; packs flattened up the extends chain.
    expect(compiled.conflicts).toEqual([{ aItemId: "ki_stayman", bItemId: "ki_nat_2c_resp" }]);
    expect(compiled.requires).toEqual([{ itemId: "ki_stayman", requiresItemId: "ki_open_1nt" }]);
    const conv = compiled.packs.find((p) => p.packId === "pk_conventions")!;
    expect(conv.itemIds).toContain("ki_fb_auction"); // from pk_floor via chain
    expect(conv.itemIds).toContain("ki_stayman");
  });

  it("last-good: a broken save keeps the previous compile live", async () => {
    const before = (await store.getKb(kb.kbId))!.liveCompileId!;

    await store.putPack({
      packId: "pk_broken",
      kbId: kb.kbId,
      name: "Broken",
      ordinal: 9,
      itemIds: ["ki_does_not_exist"],
      createdBy: "u_test",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const result = await service.recompile(kb.kbId);
    expect(result.error).toMatch(/ki_does_not_exist/);

    const after = (await store.getKb(kb.kbId))!;
    expect(after.liveCompileId).toBe(before); // last-good serves
    expect(after.lastCompileError?.message).toMatch(/pk_broken/);

    // Fixing the pack clears the error and advances the pointer.
    await store.deletePack("pk_broken");
    await service.recompile(kb.kbId);
    const fixed = (await store.getKb(kb.kbId))!;
    expect(fixed.lastCompileError).toBeUndefined();
  });

  it("identical inputs do not mint a new version", async () => {
    const v1 = (await service.liveCompile(kb.kbId))!.version;
    await service.recompile(kb.kbId);
    expect((await service.liveCompile(kb.kbId))!.version).toBe(v1);
  });

  it("copy-on-diverge: editing a shared item forks it for the editing KB only", async () => {
    const other = await service.createKb({
      name: "Other system",
      systemLabel: "2/1",
      createdBy: "u_test",
    });
    await service.shareItem(other.kbId, "ki_open_1nt");

    const forked = await service.saveItem(
      other.kbId,
      "ki_open_1nt",
      { humanReadableText: "Open 1NT with 14–16." },
      "u_editor",
    );
    expect(forked.itemId).not.toBe("ki_open_1nt");
    expect(forked.forkedFromItemId).toBe("ki_open_1nt");

    // The original KB keeps the original; the editor's KB has the fork.
    const original = (await store.listItemsForKb(kb.kbId)).find((i) => i.itemId === "ki_open_1nt");
    expect(original?.humanReadableText).toContain("15–17");
    const otherItems = await store.listItemsForKb(other.kbId);
    expect(otherItems.map((i) => i.itemId)).toEqual([forked.itemId]);
  });

  it("in-place edit (unshared) bumps version and recompiles", async () => {
    const before = (await service.liveCompile(kb.kbId))!.version;
    const edited = await service.saveItem(
      kb.kbId,
      "ki_open_2c",
      {
        payload: {
          kind: "auction_rules",
          rules: [
            {
              key: "open",
              label: "Weak 2♣ (nonsense edit)",
              context: { role: "opening" },
              conditions: { hcp: { max: 9 } },
              action: { type: "bid", level: 2, strain: "C" },
              priority: 5,
            },
          ],
        },
      },
      "u_editor",
    );
    expect(edited.itemId).toBe("ki_open_2c");
    expect(edited.version).toBe(2);
    const compiled = (await service.liveCompile(kb.kbId))!;
    expect(compiled.version).toBeGreaterThan(before);
    const rule = compiled.auctionRules.find((r) => r.ruleId === "ki_open_2c.open")!;
    expect(rule.conditions).toEqual({ hcp: { max: 9 } });
  });
});

describe("setItemsStatus", () => {
  let store: InMemoryKbStore;
  let service: KbService;
  let kb: KnowledgeBase;

  beforeEach(async () => {
    store = new InMemoryKbStore();
    service = new KbService(store, { now: () => NOW });
    kb = await seedKb(store, service);
  });

  it("persists the status across items with ONE recompile", async () => {
    const recompile = vi.spyOn(service, "recompile");
    const { changed } = await service.setItemsStatus(
      kb.kbId,
      ["ki_open_1nt", "ki_open_2c"],
      "reviewed",
      "u_editor",
    );
    expect(changed.map((c) => c.itemId).sort()).toEqual(["ki_open_1nt", "ki_open_2c"]);
    expect(recompile).toHaveBeenCalledTimes(1);
    expect((await store.getItem("ki_open_1nt"))?.status).toBe("reviewed");
    expect((await store.getItem("ki_open_2c"))?.status).toBe("reviewed");
  });

  it("skips items already at the target status", async () => {
    await service.setItemsStatus(kb.kbId, ["ki_open_1nt"], "reviewed", "u_editor");
    const recompile = vi.spyOn(service, "recompile");
    const { changed } = await service.setItemsStatus(kb.kbId, ["ki_open_1nt"], "reviewed", "u_editor");
    expect(changed).toEqual([]);
    expect(recompile).not.toHaveBeenCalled();
  });

  it("forks a shared item for the editing KB only", async () => {
    const other = await service.createKb({
      name: "Other system",
      systemLabel: "2/1",
      createdBy: "u_test",
    });
    await service.shareItem(other.kbId, "ki_open_1nt");

    const { changed } = await service.setItemsStatus(other.kbId, ["ki_open_1nt"], "reviewed", "u_editor");
    expect(changed).toHaveLength(1);
    const forkedId = changed[0]!.itemId;
    expect(forkedId).not.toBe("ki_open_1nt");
    const forked = (await store.getItem(forkedId))!;
    expect(forked.forkedFromItemId).toBe("ki_open_1nt");
    expect(forked.status).toBe("reviewed");

    // The original KB keeps the original, untouched.
    const original = (await store.getItem("ki_open_1nt"))!;
    expect(original.status).not.toBe("reviewed");
    expect((await store.listItemsForKb(other.kbId)).map((i) => i.itemId)).toEqual([forkedId]);
  });
});

describe("validatePlayerStatic", () => {
  let store: InMemoryKbStore;
  let service: KbService;
  let kb: KnowledgeBase;

  beforeEach(async () => {
    store = new InMemoryKbStore();
    service = new KbService(store, { now: () => NOW });
    kb = await seedKb(store, service);
  });

  it("the floor pack alone is minimally complete", async () => {
    const compiled = (await service.liveCompile(kb.kbId))!;
    const report = validatePlayerStatic(compiled, player({ enabledPackIds: ["pk_floor"] }));
    expect(report.static.filter((r) => !r.ok)).toEqual([]);
    expect(playerIsValid(report)).toBe(true);
  });

  it("bare openings without fallbacks are incomplete", async () => {
    const compiled = (await service.liveCompile(kb.kbId))!;
    const report = validatePlayerStatic(
      compiled,
      player({ enabledPackIds: ["pk_bare_openings"] }),
    );
    const failing = report.static.filter((r) => !r.ok).map((r) => r.categoryId);
    expect(failing).toContain("auction.pass");
    expect(failing).toContain("lead.policy");
    expect(failing).toContain("defense.signals");
    expect(playerIsValid(report)).toBe(false);
  });

  it("conflicts bite at the player when both items activate", async () => {
    // Add the natural 2♣ response into the conventions pack alongside Stayman.
    const packs = fixturePacks(kb.kbId);
    const conv = packs.find((p) => p.packId === "pk_conventions")!;
    await store.putPack({ ...conv, itemIds: [...conv.itemIds, "ki_nat_2c_resp"] });
    await service.recompile(kb.kbId);

    const compiled = (await service.liveCompile(kb.kbId))!;
    const report = validatePlayerStatic(
      compiled,
      player({ enabledPackIds: ["pk_conventions"] }),
    );
    expect(report.conflicts).toHaveLength(1);
    expect(playerIsValid(report)).toBe(false);

    // Turning Stayman OFF deactivates one side — the conflict clears.
    const off = validatePlayerStatic(
      compiled,
      player({ enabledPackIds: ["pk_conventions"], settingOverrides: { stayman_on: false } }),
    );
    expect(off.conflicts).toHaveLength(0);
  });

  it("missing requires flags when the prerequisite is not activated", async () => {
    // A pack carrying Stayman but not the 1NT opening.
    await store.putPack({
      packId: "pk_stayman_only",
      kbId: kb.kbId,
      name: "Stayman alone",
      ordinal: 3,
      itemIds: ["ki_stayman", "ki_fb_auction", "ki_fb_lead", "ki_fb_play", "ki_signals_none"],
      createdBy: "u_test",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await service.recompile(kb.kbId);
    const compiled = (await service.liveCompile(kb.kbId))!;
    const report = validatePlayerStatic(
      compiled,
      player({ enabledPackIds: ["pk_stayman_only"] }),
    );
    expect(report.missingRequires).toEqual([
      { itemId: "ki_stayman", requiresItemId: "ki_open_1nt" },
    ]);
    expect(playerIsValid(report)).toBe(false);
  });
});
