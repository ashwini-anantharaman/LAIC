// Whole-system gates for the curated SAYC template:
//   · the KB compiles clean,
//   · a Full-SAYC probe player is 17/17 complete with no conflicts,
//   · 100 seeded self-play deals ALL complete with ZERO engine-floor events
//     (every decision came from knowledge or an explicit fallback item).

import { simulateSelfPlay } from "@bridge/engine";
import {
  CAPABILITY_CATEGORIES,
  InMemoryKbStore,
  KbService,
  playerIsValid,
  validatePlayerStatic,
  type CompiledKb,
  type KbPlayer,
} from "@bridge/kb";
import { beforeAll, describe, expect, it } from "vitest";
import { installSaycTemplate } from "./install";

let compiled: CompiledKb;
let fullPackId: string;
let floorPackId: string;

const probe = (packIds: string[]): KbPlayer =>
  ({
    playerId: "probe",
    kbId: "kb",
    name: "probe",
    enabledPackIds: packIds,
    settingOverrides: {},
    decisionPolicyId: "first_match",
    fallbackPolicyId: "standard",
    validationStatus: "draft",
    ownerType: "coach",
    version: 1,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
  }) as KbPlayer;

beforeAll(async () => {
  const store = new InMemoryKbStore();
  const service = new KbService(store);
  const result = await installSaycTemplate(store, service, { createdBy: "u_test" });
  expect(result.compileError).toBeNull();
  compiled = (await service.liveCompile(result.kbId))!;
  fullPackId = result.packIdByKey.get("full")!;
  floorPackId = result.packIdByKey.get("floor")!;
});

describe("curated SAYC — whole-system gates", () => {
  it("Full SAYC is 17/17 complete with no conflicts", () => {
    const report = validatePlayerStatic(compiled, probe([fullPackId]));
    const ok = report.static.filter((c) => c.ok);
    expect(ok.length).toBe(CAPABILITY_CATEGORIES.length);
    expect(report.conflicts).toEqual([]);
    expect(report.missingRequires).toEqual([]);
    expect(playerIsValid(report)).toBe(true);
  });

  it("the Floor alone is also complete (the minimal player)", () => {
    const report = validatePlayerStatic(compiled, probe([floorPackId]));
    expect(report.static.filter((c) => c.ok).length).toBe(CAPABILITY_CATEGORIES.length);
  });

  it("100 self-play deals: all complete, zero engine-floor events", async () => {
    const report = await simulateSelfPlay({
      compiled,
      player: {
        enabledPackIds: [fullPackId],
        settingOverrides: {},
        decisionPolicyId: "first_match",
      },
      deals: 100,
      seed: 20260721,
    });
    expect(report.completed).toBe(100);
    expect(report.engineFloorEvents).toBe(0);
  }, 120_000);

  it("the Blackwood king-ask requires the ask (authored requires edge holds)", () => {
    // The rebuilt slam chapter is three staged items plus the king-ask and
    // DOPI, which REQUIRE the ask trigger. With everything on by default the
    // requires are satisfied and there are no conflicts.
    const report = validatePlayerStatic(compiled, probe([fullPackId]));
    expect(report.missingRequires).toEqual([]);
    expect(report.conflicts).toEqual([]);
  });
});
