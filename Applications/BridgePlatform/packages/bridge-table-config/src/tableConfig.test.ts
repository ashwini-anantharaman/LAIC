// Table-appearance behaviours: resolveSkin override semantics ("" falls
// through), normalizeAppearance clamping/fail-safe, preset application, the
// JSON invariants (every order entry has a skin, every preset's skin exists),
// and the store roundtrip (in-memory + JSON-file persistence).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyPreset,
  DEFAULT_APPEARANCE,
  FAN_LIMITS,
  InMemoryTableConfigStore,
  nextSkin,
  normalizeAppearance,
  OVERRIDE_OPTIONS,
  PRESETS,
  resolveSkin,
  skinLabel,
  SKIN_ORDER,
  STRAIN_TINT,
  TABLE_SKINS,
  type SkinName,
  type TableAppearance,
} from "./index";
import { JsonFileTableConfigStore } from "./fileStore";

describe("resolveSkin", () => {
  it("returns the skin's own tokens when no overrides are set", () => {
    const r = resolveSkin("bbo");
    expect(r.felt).toBe(TABLE_SKINS.bbo.felt);
    expect(r.trayBg).toBe(TABLE_SKINS.bbo.trayBg);
    expect(r.cardBack).toBe(TABLE_SKINS.bbo.cardBack);
  });
  it("applies each colour override where set", () => {
    const r = resolveSkin("bbo", {
      feltColor: "#123456",
      accent: "#abcdef",
      bidBoxColor: "#111111",
      auctionColor: "#222222",
      cardBackColor: "#333333",
    });
    // feltColor drives BOTH felt and feltFlat.
    expect(r.felt).toBe("#123456");
    expect(r.feltFlat).toBe("#123456");
    expect(r.accent).toBe("#abcdef");
    expect(r.trayBg).toBe("#111111");
    expect(r.auctionBg).toBe("#222222");
    expect(r.cardBack).toBe("#333333");
  });
  it("lets empty-string / undefined overrides fall through to the skin token", () => {
    const r = resolveSkin("bbo", { feltColor: "", accent: undefined });
    expect(r.felt).toBe(TABLE_SKINS.bbo.felt);
    expect(r.accent).toBe(TABLE_SKINS.bbo.accent);
  });
});

describe("nextSkin / skinLabel", () => {
  it("cycles through SKIN_ORDER and wraps", () => {
    expect(nextSkin("bbo")).toBe("midnight");
    expect(nextSkin("claret")).toBe("bbo");
  });
  it("returns the label token", () => {
    expect(skinLabel("bbo")).toBe("Green baize");
    expect(skinLabel("midnight")).toBe("Midnight");
  });
});

describe("normalizeAppearance", () => {
  it("returns the defaults for junk input", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance("nope")).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({})).toEqual(DEFAULT_APPEARANCE);
  });
  it("drops unknown fields and unknown enum values", () => {
    const a = normalizeAppearance({
      skin: "rainbow",
      handLayout: "spiral",
      bidPad: "wheel",
      centreFrame: "yes",
      extra: 1,
    });
    expect(a.skin).toBe(DEFAULT_APPEARANCE.skin);
    expect(a.handLayout).toBe(DEFAULT_APPEARANCE.handLayout);
    expect(a.bidPad).toBe(DEFAULT_APPEARANCE.bidPad);
    expect(a.centreFrame).toBe(DEFAULT_APPEARANCE.centreFrame);
    expect(a).not.toHaveProperty("extra");
  });
  it("keeps valid values", () => {
    // Every field at a NON-default value, so "keeps" is actually being tested:
    // a normalizer that silently substituted its own defaults would pass an
    // input that already matched them.
    const a = normalizeAppearance({
      skin: "noir",
      handLayout: "fan",
      bidPad: "columns",
      centreFrame: true,
      fanSpread: 100,
      fanRadius: 400,
      playMode: "suit",
      trickPause: "2s",
      suitGroups: false,
      cardLift: "pronounced",
      overrides: { feltColor: "#0d707c" },
    });
    expect(a).toEqual({
      skin: "noir",
      handLayout: "fan",
      bidPad: "columns",
      centreFrame: true,
      fanSpread: 100,
      fanRadius: 400,
      playMode: "suit",
      trickPause: "2s",
      suitGroups: false,
      cardLift: "pronounced",
      overrides: { feltColor: "#0d707c" },
    });
  });
  it("falls back to the SAFE interaction defaults on junk", () => {
    // The defaults are deliberate (owner, 2026-08-12): a new player should not
    // lose a card to a mis-tap, so a corrupt stored value must degrade towards
    // the rails, never away from them.
    const a = normalizeAppearance({ playMode: "yolo", trickPause: 5, suitGroups: "yes", cardLift: 9 });
    expect(a.playMode).toBe("raise");
    expect(a.trickPause).toBe("tap");
    expect(a.suitGroups).toBe(true);
    expect(a.cardLift).toBe("subtle");
  });
  it("clamps fanSpread into range and snaps to the step", () => {
    expect(normalizeAppearance({ fanSpread: 5 }).fanSpread).toBe(FAN_LIMITS.spread.min);
    expect(normalizeAppearance({ fanSpread: 999 }).fanSpread).toBe(FAN_LIMITS.spread.max);
    expect(normalizeAppearance({ fanSpread: 79 }).fanSpread % FAN_LIMITS.spread.step).toBe(
      FAN_LIMITS.spread.min % FAN_LIMITS.spread.step,
    );
  });
  it("clamps fanRadius but keeps 0 as the auto sentinel", () => {
    expect(normalizeAppearance({ fanRadius: 0 }).fanRadius).toBe(0);
    expect(normalizeAppearance({ fanRadius: 50 }).fanRadius).toBe(FAN_LIMITS.radius.min);
    expect(normalizeAppearance({ fanRadius: 9999 }).fanRadius).toBe(FAN_LIMITS.radius.max);
  });
  it("drops empty-string and unknown overrides", () => {
    const a = normalizeAppearance({
      overrides: { feltColor: "", accent: "#384bb3", bogus: "#fff" },
    });
    expect(a.overrides).toEqual({ accent: "#384bb3" });
  });
});

describe("applyPreset", () => {
  it("classic-club is bbo + fan + columns + gold frame", () => {
    const a = applyPreset("classic-club");
    expect(a).toEqual({
      ...DEFAULT_APPEARANCE,
      skin: "bbo",
      handLayout: "fan",
      bidPad: "columns",
      centreFrame: true,
    });
  });
  it("a plain-skin preset selects the skin with default layout", () => {
    const a = applyPreset("noir");
    expect(a.skin).toBe("noir");
    expect(a.handLayout).toBe(DEFAULT_APPEARANCE.handLayout);
    expect(a.bidPad).toBe(DEFAULT_APPEARANCE.bidPad);
    expect(a.centreFrame).toBe(DEFAULT_APPEARANCE.centreFrame);
  });
  it("an unknown preset id yields the defaults", () => {
    expect(applyPreset("nope")).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("JSON invariants", () => {
  it("every order entry has a skin with all tokens", () => {
    for (const name of SKIN_ORDER) {
      const s = TABLE_SKINS[name];
      expect(s, name).toBeTruthy();
      for (const key of [
        "label", "note", "felt", "feltFlat", "stageBg", "barBg", "accent", "chip",
        "trayBg", "strainBg", "levelBorder", "auctionBg", "cardBack", "radius", "font",
      ] as const) {
        expect(typeof s[key], `${name}.${key}`).toBe("string");
      }
      expect(typeof s.barThickness).toBe("number");
      expect(typeof s.cardW).toBe("number");
    }
  });
  it("every preset's skin exists in the registry", () => {
    for (const [id, preset] of Object.entries(PRESETS)) {
      const skin = preset.appearance.skin as SkinName | undefined;
      expect(skin, `${id} has a skin`).toBeTruthy();
      expect(SKIN_ORDER, `${id}.skin is real`).toContain(skin);
    }
  });
  it("has a strain tint for all five columns", () => {
    for (const strain of ["N", "S", "H", "D", "C"] as const) {
      expect(STRAIN_TINT[strain].bg).toMatch(/^#/);
    }
  });
  it("has non-empty override option palettes for every override key", () => {
    for (const key of ["feltColor", "accent", "bidBoxColor", "auctionColor", "cardBackColor"] as const) {
      expect(OVERRIDE_OPTIONS[key].length).toBeGreaterThan(0);
    }
  });
});

describe("store roundtrip", () => {
  const sample: TableAppearance = {
    ...DEFAULT_APPEARANCE,
    skin: "claret",
    handLayout: "fan",
  };
  it("in-memory put/get", async () => {
    const store = new InMemoryTableConfigStore();
    expect(await store.getForUser("user_x")).toBeNull();
    await store.putForUser("user_x", sample);
    expect(await store.getForUser("user_x")).toEqual(sample);
  });
  it("JSON file persists across two instances", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "bridge-table-config-")), "table-config-store.json");
    await new JsonFileTableConfigStore(file).putForUser("user_y", sample);
    const reopened = new JsonFileTableConfigStore(file);
    expect(await reopened.getForUser("user_y")).toEqual(sample);
  });
});
