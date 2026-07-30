// Whole-system gates for the teaching-deck template:
//   · the KB compiles clean,
//   · a Full probe player is 17/17 complete with no conflicts,
//   · 100 seeded self-play deals ALL complete with ZERO engine-floor events,
//   · and — specific to this template — EVERY item cites a real slide, because
//     an item nobody can trace back to the deck is an item nobody can check.

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
import { GIRKAR_TEMPLATE } from "./index";
import { installGirkarTemplate } from "./install";
import { DECK_PAGE_COUNT, SLIDES_BY_KEY } from "./slides";

let compiled: CompiledKb;
let fullPackId: string;
let floorPackId: string;
let store: InMemoryKbStore;
let kbId: string;

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
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  }) as KbPlayer;

beforeAll(async () => {
  store = new InMemoryKbStore();
  const service = new KbService(store);
  const result = await installGirkarTemplate(store, service, { createdBy: "u_test" });
  expect(result.compileError).toBeNull();
  kbId = result.kbId;
  compiled = (await service.liveCompile(result.kbId))!;
  fullPackId = result.packIdByKey.get("full")!;
  floorPackId = result.packIdByKey.get("floor")!;
});

describe("teaching deck — whole-system gates", () => {
  it("the Full set is 17/17 complete with no conflicts", () => {
    const report = validatePlayerStatic(compiled, probe([fullPackId]));
    // Name the gaps in the failure message — "16 !== 17" tells a fellow nothing.
    const missing = CAPABILITY_CATEGORIES.filter(
      (c) => !report.static.some((s) => s.categoryId === c.categoryId && s.ok),
    ).map((c) => c.categoryId);
    expect(missing).toEqual([]);
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
      seed: 20260725,
    });
    expect(report.completed).toBe(100);
    expect(report.engineFloorEvents).toBe(0);
  }, 120_000);
});

describe("slide provenance", () => {
  it("every item is traceable to at least one slide", () => {
    const untraced = GIRKAR_TEMPLATE.items
      .filter((i) => !(SLIDES_BY_KEY[i.key]?.length ?? 0))
      .map((i) => i.key);
    expect(untraced).toEqual([]);
  });

  it("every cited slide is a real page of the 88-slide deck", () => {
    const bad: string[] = [];
    for (const [key, pages] of Object.entries(SLIDES_BY_KEY)) {
      for (const p of pages) {
        if (!Number.isInteger(p) || p < 1 || p > DECK_PAGE_COUNT) bad.push(`${key}→${p}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the slide map has no entries for items that do not exist", () => {
    const keys = new Set(GIRKAR_TEMPLATE.items.map((i) => i.key));
    expect(Object.keys(SLIDES_BY_KEY).filter((k) => !keys.has(k))).toEqual([]);
  });

  it("installed items carry a `slide N` citation and land as drafts", async () => {
    const items = await store.listItemsForKb(kbId);
    expect(items.length).toBe(GIRKAR_TEMPLATE.items.length);
    for (const item of items) {
      expect(item.status).toBe("draft");
      expect(item.sourceReferences.length).toBeGreaterThan(0);
      for (const ref of item.sourceReferences) {
        expect(ref.anchor).toMatch(/^slide \d+$/);
      }
    }
  });

  it("covers the deck's substantive teaching slides", () => {
    // Title/agenda/section-divider slides carry no rules; everything else in the
    // deck should have left a trace somewhere in the template.
    const cited = new Set(Object.values(SLIDES_BY_KEY).flat());
    const teaching = [
      // scoring & incentives
      4, 5, 6, 7, 8, 9, 10, 13, 14,
      // the bidding tables
      15, 16, 17, 18, 19, 22, 23, 24, 26, 27, 28, 29, 30, 31,
      // evaluation, competition, slam
      32, 33, 34, 36, 37, 38, 39, 40, 41, 42, 46, 47, 48, 49, 50, 51,
      // play, leads, carding, process
      52, 53, 54, 55, 61, 73, 74, 75, 76, 77, 78, 82, 83, 85, 86, 87,
    ];
    expect(teaching.filter((p) => !cited.has(p))).toEqual([]);
  });
});

describe("authoring hygiene", () => {
  it("every convention is gated — by its own toggle or by a requires edge", () => {
    // A convention must be switchable off. Satellite items (keycard responses,
    // "may not be passed" forcing entries) deliberately carry no toggle of
    // their own — turning off Roman keycards should not mean hunting down four
    // more switches — so for them the gate is a `requires` edge to the parent
    // that does carry it. Either mechanism is fine; having neither is a bug,
    // because the item would stay live with its convention switched off.
    const hasToggle = (key: string) =>
      (GIRKAR_TEMPLATE.items.find((i) => i.key === key)?.settings ?? []).some(
        (s) => s.role === "enable",
      );
    const parentsOf = (key: string) =>
      GIRKAR_TEMPLATE.edges
        .filter((e) => e.from === key && e.edgeType === "requires")
        .map((e) => e.to);

    const ungated = GIRKAR_TEMPLATE.items
      .filter((i) => i.sets.includes("conventions"))
      .filter((i) => !hasToggle(i.key) && !parentsOf(i.key).some(hasToggle))
      .map((i) => i.key);
    expect(ungated).toEqual([]);
  });

  it("every edge points at an item that exists", () => {
    const keys = new Set(GIRKAR_TEMPLATE.items.map((i) => i.key));
    const dangling = GIRKAR_TEMPLATE.edges
      .filter((e) => !keys.has(e.from) || !keys.has(e.to))
      .map((e) => `${e.from}→${e.to}`);
    expect(dangling).toEqual([]);
  });

  it("the Full pack is marked intendedComplete so the checklist scores it", () => {
    expect(GIRKAR_TEMPLATE.packs.find((p) => p.key === "full")?.intendedComplete).toBe(true);
  });

  it("every item has real human-readable text", () => {
    const thin = GIRKAR_TEMPLATE.items
      .filter((i) => i.humanReadableText.trim().length < 40)
      .map((i) => i.key);
    expect(thin).toEqual([]);
  });
});
