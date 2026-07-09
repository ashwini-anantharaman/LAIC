// Phase 7 acceptance: resolution-chain precedence; AI behavior demonstrably
// changes with settings; convention card entries all resolve to knowledge
// items and react to values; ownership scoping with copy-on-customize.

import { initialState, interpretBid, type BridgeRulePackage } from "@bridge/engine";
import {
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
  InMemoryKnowledgeStore,
  publishPackage,
  runGeneration,
} from "@bridge/knowledge";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { seededBoard } from "@bridge/engine";
import {
  generateConventionCard,
  InMemoryProfileStore,
  ProfileService,
  resolveProfileValues,
} from "./index";

const NOW = "2026-07-09T00:00:00.000Z";
let pkg: BridgeRulePackage;

beforeAll(async () => {
  const kstore = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
  await runGeneration(kstore, {
    systemFamily: "natural",
    requestedBy: "test",
    now: NOW,
    runId: "run_profiles",
  });
  pkg = (await publishPackage(kstore, BEGINNER_NATURAL_PACKAGE_ID, "0.1.0", "test", NOW)).pkg;
});

const ctx = (over: Partial<NexusBridgeContext>): NexusBridgeContext => ({
  nexusUserId: "user_a",
  laicOrgId: "org_laic",
  programId: "bridge_program",
  programOrganizationId: "bporg_club_a",
  appId: "bridge_ai_coach",
  roles: ["bridge_learner"],
  permissions: [],
  accessLevel: "learner",
  ...over,
});

describe("resolution chain (§11.4)", () => {
  it("applies defaults, then preset, then overrides — hashed", () => {
    const defaults = resolveProfileValues(pkg.settings, "bn_default", {});
    expect(defaults.values.bn_1nt_response).toBe(true);

    const preset = resolveProfileValues(pkg.settings, "bn_no_1nt", {});
    expect(preset.values.bn_1nt_response).toBe(false);

    const override = resolveProfileValues(pkg.settings, "bn_no_1nt", { bn_1nt_response: true });
    expect(override.values.bn_1nt_response).toBe(true);

    expect(defaults.hash).toBe(override.hash); // same resolved values
    expect(defaults.hash).not.toBe(preset.hash);
  });
});

describe("AI behavior changes with settings (acceptance)", () => {
  it("a 6-HCP responder bids 1NT with the setting on, passes with it off", () => {
    // Partner (N) opened 1S; South: 2 spades, 6 HCP, no 1-level suit available.
    const board = seededBoard(1);
    board.hands.S = [
      { suit: "S", rank: 7 }, { suit: "S", rank: 2 },
      { suit: "H", rank: 12 }, { suit: "H", rank: 5 }, { suit: "H", rank: 4 }, { suit: "H", rank: 3 },
      { suit: "D", rank: 13 }, { suit: "D", rank: 5 }, { suit: "D", rank: 4 }, { suit: "D", rank: 3 },
      { suit: "C", rank: 11 }, { suit: "C", rank: 9 }, { suit: "C", rank: 2 },
    ];
    const state = {
      ...initialState("t", "N", "none", board.hands),
      auction: [
        { seat: "N" as const, call: "1S" },
        { seat: "E" as const, call: "P" },
      ],
      turn: "S" as const,
    };

    const on = interpretBid(state, "S", {
      pkg,
      values: resolveProfileValues(pkg.settings, "bn_default", {}).values,
    });
    const off = interpretBid(state, "S", {
      pkg,
      values: resolveProfileValues(pkg.settings, "bn_no_1nt", {}).values,
    });

    expect(on.action).toBe("1N");
    expect(on.matchedRuleId).toBe("bn_1nt_response");
    expect(off.action).toBe("P");
    const gated = off.trace.find((r) => r.ruleId === "bn_1nt_response")!;
    expect(gated.matched).toBe(false);
    expect(gated.reason).toContain("setting gate failed");
  });
});

describe("convention card (derived, §11.5)", () => {
  it("every entry resolves to knowledge items; gated entries react to values", () => {
    const onCard = generateConventionCard(
      pkg,
      resolveProfileValues(pkg.settings, "bn_default", {}).values,
      "Standard",
    );
    const allEntries = onCard.sections.flatMap((s) => s.entries);
    expect(allEntries.length).toBe(pkg.bidRules.length + pkg.playRules.length);
    expect(allEntries.every((e) => e.knowledgeItemIds.length > 0)).toBe(true);
    expect(allEntries.find((e) => e.ruleId === "bn_1nt_response")!.active).toBe(true);

    const offCard = generateConventionCard(
      pkg,
      resolveProfileValues(pkg.settings, "bn_no_1nt", {}).values,
      "No 1NT",
    );
    expect(
      offCard.sections.flatMap((s) => s.entries).find((e) => e.ruleId === "bn_1nt_response")!
        .active,
    ).toBe(false);
    expect(offCard.resolvedValueHash).not.toBe(onCard.resolvedValueHash);
  });
});

describe("ownership scoping + copy-on-customize (locked decision 9.2)", () => {
  it("system profiles are read-only; customize clones into the caller's scope", async () => {
    const service = new ProfileService(new InMemoryProfileStore(), () => "aip_copy_1", () => NOW);
    const ref = { packageId: pkg.packageId, version: pkg.version };
    const system = await service.ensureSystemProfile(ref, pkg.settings);
    const lena = ctx({});

    await expect(
      service.updateValues(system.aiPlayerProfileId, lena, pkg.settings, {
        valueOverrides: { bn_1nt_response: false },
      }),
    ).rejects.toThrow(/read-only/);

    const copy = await service.customize(system.aiPlayerProfileId, lena, pkg.settings);
    expect(copy.ownerType).toBe("learner");
    expect(copy.ownerId).toBe("user_a");
    const updated = await service.updateValues(copy.aiPlayerProfileId, lena, pkg.settings, {
      valueOverrides: { bn_1nt_response: false },
    });
    expect(updated.resolvedValueHash).not.toBe(system.resolvedValueHash);

    // Visibility: same org sees it, other org doesn't, program admin does.
    expect((await service.listProfiles(ctx({ nexusUserId: "peer" }))).length).toBe(2);
    expect(
      (await service.listProfiles(ctx({ nexusUserId: "b", programOrganizationId: "bporg_other" })))
        .length,
    ).toBe(1); // system only
    expect(
      (
        await service.listProfiles(
          ctx({ nexusUserId: "adm", programOrganizationId: undefined, accessLevel: "admin" }),
        )
      ).length,
    ).toBe(2);

    // Foreign learner in same org can see but not edit.
    await expect(
      service.updateValues(copy.aiPlayerProfileId, ctx({ nexusUserId: "peer" }), pkg.settings, {
        name: "hijack",
      }),
    ).rejects.toThrow(/read-only/);
  });
});
