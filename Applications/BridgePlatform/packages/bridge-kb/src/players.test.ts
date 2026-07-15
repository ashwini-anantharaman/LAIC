// Stage E: the wizard picks the right ladder rungs; sandbox constraints can
// never be escaped from the client side.

import { describe, expect, it } from "vitest";
import { FIXTURE_EDGES, FIXTURE_ITEMS, fixturePacks } from "./fixture";
import { KbService } from "./service";
import { InMemoryKbStore } from "./store";
import { applySandboxConstraints, suggestMinimalPlayers } from "./players";
import type { KbSandbox } from "./model";

const NOW = "2026-07-14T15:00:00.000Z";

async function compiledFixture() {
  const store = new InMemoryKbStore();
  const service = new KbService(store, { now: () => NOW });
  const kb = await service.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
  for (const item of FIXTURE_ITEMS) {
    await store.putItem(item);
    await store.addMembership({ kbId: kb.kbId, itemId: item.itemId });
  }
  for (const edge of FIXTURE_EDGES) await store.putEdge(edge);
  for (const pack of fixturePacks(kb.kbId)) await store.putPack(pack);
  await service.recompile(kb.kbId);
  return { kbId: kb.kbId, compiled: (await service.liveCompile(kb.kbId))! };
}

describe("suggestMinimalPlayers", () => {
  it("proposes the lowest incomplete pack and the lowest complete chain", async () => {
    const { kbId, compiled } = await compiledFixture();
    const suggested = suggestMinimalPlayers(compiled, kbId);

    const incomplete = suggested.find((s) => s.kind === "minimal_incomplete");
    const complete = suggested.find((s) => s.kind === "minimal_complete");

    // pk_bare_openings (ordinal 1, no fallbacks) is the drill candidate;
    // pk_floor (ordinal 0, all fallbacks + signals) stands alone.
    expect(complete?.enabledPackIds).toEqual(["pk_floor"]);
    expect(incomplete?.enabledPackIds).toEqual(["pk_bare_openings"]);
    expect(incomplete?.rationale).toMatch(/constrained environments/);
  });
});

describe("applySandboxConstraints", () => {
  const sandbox: KbSandbox = {
    sandboxId: "sb_1",
    kbId: "kb_x",
    name: "NT week",
    basePackIds: ["pk_floor", "pk_openings"],
    exposedPackIds: ["pk_conventions"],
    baseOverrides: { nt_range: { low: 15, high: 17 } },
    exposedSettingKeys: ["stayman_on"],
    ownerType: "coach",
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("keeps base packs, allows exposed toggles, snaps the rest back", () => {
    const result = applySandboxConstraints(sandbox, {
      // Learner tries to drop the floor AND enable a non-exposed pack.
      enabledPackIds: ["pk_conventions", "pk_secret"],
      settingOverrides: {
        stayman_on: false, // exposed — allowed
        nt_range: { low: 5, high: 20 }, // NOT exposed — snaps to coach baseline
      },
    });
    expect(result.enabledPackIds.sort()).toEqual(["pk_conventions", "pk_floor", "pk_openings"]);
    expect(result.settingOverrides.stayman_on).toBe(false);
    expect(result.settingOverrides.nt_range).toEqual({ low: 15, high: 17 });
  });

  it("a learner submitting nothing still gets the coach baseline", () => {
    const result = applySandboxConstraints(sandbox, { enabledPackIds: [], settingOverrides: {} });
    expect(result.enabledPackIds.sort()).toEqual(["pk_floor", "pk_openings"]);
    expect(result.settingOverrides).toEqual({ nt_range: { low: 15, high: 17 } });
  });
});

describe("acblConventionCard", () => {
  it("buckets rules into ACBL sections; off conventions stay visible", async () => {
    const { acblConventionCard } = await import("./card");
    const store = new InMemoryKbStore();
    const service = new KbService(store, { now: () => NOW });
    const kb = await service.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    const { FIXTURE_ITEMS, fixturePacks } = await import("./fixture");
    for (const item of FIXTURE_ITEMS) {
      await store.putItem(item);
      await store.addMembership({ kbId: kb.kbId, itemId: item.itemId });
    }
    for (const pack of fixturePacks(kb.kbId)) await store.putPack(pack);
    await service.recompile(kb.kbId);
    const compiled = (await service.liveCompile(kb.kbId))!;

    const player = {
      playerId: "pl", kbId: kb.kbId, name: "Test", enabledPackIds: ["pk_conventions"],
      settingOverrides: { stayman_on: false }, decisionPolicyId: "first_match" as const,
      fallbackPolicyId: "standard" as const, validationStatus: "draft" as const,
      ownerType: "system" as const, version: 1, createdAt: NOW, updatedAt: NOW,
    };
    const card = acblConventionCard(compiled, player, { systemLabel: "SAYC", kbName: "SAYC" });

    const section = (id: string) => card.sections.find((s) => s.id === id);
    // 1NT opening + Stayman live in the notrump box; Stayman is OFF but visible.
    const nt = section("notrump")!;
    expect(nt.entries.some((e) => e.label === "Open 1NT")).toBe(true);
    const stayman = nt.entries.find((e) => e.label.includes("Stayman"))!;
    expect(stayman.on).toBe(false);
    expect(nt.settings.some((s) => s.key === "nt_range")).toBe(true);
    // Strong 2♣ → 2-level; majors → majors box; carding panel populated.
    expect(section("two_level")!.entries.some((e) => e.label.includes("2♣"))).toBe(true);
    expect(section("majors")!.entries.length).toBeGreaterThan(0);
    expect(card.leads.length).toBeGreaterThan(0);
    expect(card.signals.attitude).toBe("none");
  });
});
