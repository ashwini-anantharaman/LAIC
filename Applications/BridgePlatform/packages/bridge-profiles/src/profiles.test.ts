// Phase 7 acceptance: resolution-chain precedence; AI behavior demonstrably
// changes with settings; convention card entries all resolve to knowledge
// items and react to values; ownership scoping with copy-on-customize.

import { initialState, interpretBid, type BridgeRulePackage } from "@bridge/engine";
import {
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
  InMemoryKnowledgeStore,
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
  pkg = (await kstore.getPackage(BEGINNER_NATURAL_PACKAGE_ID, "0.1.0"))!.pkg;
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

describe("teaching scopes are coach judgment, not system truth", () => {
  it("system scopes are read-only suggestions; coaches customize and redefine levels", async () => {
    const service = new ProfileService(new InMemoryProfileStore(), () => "aip_s1", () => NOW);
    const suggested = await service.ensureSystemScope({
      teachingScopeId: "ts_system_bn_level1",
      name: "Level 1 (suggested)",
      derivedFromItemId: "ki_bn_scope_level1",
      evaluatorFilter: { seats: "dealer", requireSystemicActionIn: ["1C", "1D", "1H", "1S"] },
      targetConceptIds: ["bn_opening_bids"],
    });
    const coach = ctx({ nexusUserId: "user_carlos", accessLevel: "coach" });

    await expect(
      service.updateScope(suggested.teachingScopeId, coach, { name: "mine" }),
    ).rejects.toThrow(/read-only/);

    const own = await service.customizeScope(suggested.teachingScopeId, coach);
    expect(own.ownerType).toBe("coach");
    expect(own.derivedFromItemId).toBe("ki_bn_scope_level1"); // lineage, not authority

    // The coach redefines what "Level 1" means for their learners.
    const updated = await service.updateScope(own.teachingScopeId, coach, {
      evaluatorFilter: { seats: "dealer", requireSystemicActionIn: ["1H", "1S"] },
    });
    expect(updated.evaluatorFilter.requireSystemicActionIn).toEqual(["1H", "1S"]);

    // Other-org users don't see the coach's scope; the suggestion stays visible.
    const otherOrg = ctx({ nexusUserId: "x", programOrganizationId: "bporg_other" });
    expect((await service.listScopes(otherOrg)).map((s) => s.teachingScopeId)).toEqual([
      "ts_system_bn_level1",
    ]);
  });
});

describe("org model (§3.4–3.5)", () => {
  it("org profile: save requires bridge.org.manage; reads are open", async () => {
    const service = new ProfileService(new InMemoryProfileStore(), () => "id_1", () => NOW);
    const admin = ctx({
      nexusUserId: "user_admin",
      accessLevel: "admin",
      permissions: ["bridge.org.manage"],
    });
    await expect(
      service.saveOrgProfile(ctx({ nexusUserId: "user_x" }), { allowAiPlayers: false }),
    ).rejects.toThrow("bridge.org.manage");

    const saved = await service.saveOrgProfile(admin, {
      bridgeOrgType: "bridge_club",
      allowAiPlayers: false,
      allowedBiddingSystems: ["natural"],
    });
    expect(saved.allowAiPlayers).toBe(false);
    expect((await service.getOrgProfile(ctx({})))?.allowedBiddingSystems).toEqual(["natural"]);
  });

  it("affiliations: pending unless self-administered; switch needs an ACTIVE one", async () => {
    let n = 0;
    const service = new ProfileService(new InMemoryProfileStore(), () => `id_${n++}`, () => NOW);
    const coach = ctx({ nexusUserId: "user_coach", accessLevel: "coach" });

    const pending = await service.addAffiliation(coach, {
      programOrganizationId: "bporg_other",
      affiliationType: "organization_coach",
    });
    expect(pending.status).toBe("pending");
    // Pending affiliation is NOT a valid switch target.
    await expect(service.switchActiveOrg(coach, "bporg_other")).rejects.toThrow("active affiliation");

    // Org admin adding themselves to their own org: active immediately.
    const admin = ctx({
      nexusUserId: "user_admin2",
      programOrganizationId: "bporg_club_a",
      permissions: ["bridge.org.manage"],
    });
    const active = await service.addAffiliation(admin, {
      programOrganizationId: "bporg_club_a",
      affiliationType: "organization_coach",
    });
    expect(active.status).toBe("active");
    await service.switchActiveOrg(admin, "bporg_club_a");
    expect((await service.getUserProfile(admin))?.activeProgramOrganizationId).toBe("bporg_club_a");
    // Clearing the switch is always allowed.
    await service.switchActiveOrg(admin, null);
    expect((await service.getUserProfile(admin))?.activeProgramOrganizationId).toBeUndefined();
  });
});

describe("sandboxes (coach-curated configuration surfaces)", () => {
  const coach = ctx({ nexusUserId: "user_coach", accessLevel: "coach", roles: ["bridge_coach"] });
  const learner = ctx({ nexusUserId: "user_learner" });

  const makeSandbox = (service: ProfileService) =>
    service.createSandbox(coach, {
      name: "Week 3 — the 1NT response",
      packageRef: { packageId: pkg.packageId, version: pkg.version },
      basePresetId: "bn_default",
      exposedSettingKeys: ["bn_1nt_response"],
    });

  it("learners configure ONLY the exposed settings; the rest is locked to the baseline", async () => {
    let n = 0;
    const service = new ProfileService(new InMemoryProfileStore(), () => `id_${n++}`, () => NOW);
    const sandbox = await makeSandbox(service);

    // Exposed key: accepted, becomes a normal pinned profile with lineage.
    const mine = await service.configureFromSandbox(learner, sandbox.sandboxId, {
      overrides: { bn_1nt_response: false },
      settings: pkg.settings,
    });
    expect(mine.sandboxId).toBe(sandbox.sandboxId);
    expect(mine.ownerId).toBe("user_learner");
    expect(mine.valueOverrides.bn_1nt_response).toBe(false);

    // Unexposed key: rejected loudly at creation…
    await expect(
      service.configureFromSandbox(learner, sandbox.sandboxId, {
        overrides: { bn_1nt_open: true },
        settings: pkg.settings,
      }),
    ).rejects.toThrow("not exposed by this sandbox");

    // …and on ANY later edit path of the sandboxed profile.
    await expect(
      service.updateValues(mine.aiPlayerProfileId, learner, pkg.settings, {
        valueOverrides: { bn_1nt_response: true, bn_1nt_open: true },
      }),
    ).rejects.toThrow("not exposed by this sandbox");

    // Editing only the exposed key is fine.
    const updated = await service.updateValues(mine.aiPlayerProfileId, learner, pkg.settings, {
      valueOverrides: { bn_1nt_response: true },
    });
    expect(updated.valueOverrides.bn_1nt_response).toBe(true);
  });

  it("creation is a coach tool; visibility follows profile tenancy", async () => {
    let n = 0;
    const service = new ProfileService(new InMemoryProfileStore(), () => `id_${n++}`, () => NOW);
    await expect(makeSandbox.call(null, service).then(() => service.createSandbox(learner, {
      name: "x",
      packageRef: { packageId: pkg.packageId, version: pkg.version },
      exposedSettingKeys: ["bn_1nt_response"],
    }))).rejects.toThrow("coach");

    const sameOrg = ctx({ nexusUserId: "user_other" });
    const otherOrg = ctx({ nexusUserId: "user_far", programOrganizationId: "bporg_club_b" });
    expect((await service.listSandboxes(sameOrg)).length).toBe(1);
    expect((await service.listSandboxes(otherOrg)).length).toBe(0);
  });
});
