// Table skins & appearance: the canonical, client-safe read model for the play
// table's look. One JSON file (table-skins.json) is the single source of truth
// for the five skins, their strain tints, colour-override palettes, fan limits,
// presets, and the built-in defaults. This module parses that JSON, types it,
// and exposes the pure helpers the app dresses the table with — resolveSkin
// (override semantics), normalizeAppearance (validate/clamp untrusted input),
// applyPreset — plus the per-user persistence seam (InMemory here; JSON-file in
// ./fileStore, Postgres in @bridge/pg-stores). NO node:fs here — client-safe.

import skinsData from "./table-skins.json";

export type SkinName = "bbo" | "midnight" | "parchment" | "noir" | "claret";

/** The 17 verbatim design tokens that dress one skin's surrounds. */
export interface SkinTokens {
  label: string;
  note: string;
  felt: string;
  feltFlat: string;
  stageBg: string;
  barBg: string;
  accent: string;
  chip: string;
  trayBg: string;
  strainBg: string;
  levelBorder: string;
  auctionBg: string;
  cardBack: string;
  radius: string;
  font: string;
  barThickness: number;
  cardW: number;
}

/** One strain column's fill/ink/edge (BidColumns). */
export interface StrainTint {
  bg: string;
  ink: string;
  edge: string;
}
export type Strain = "N" | "S" | "H" | "D" | "C";

/** Per-user colour overrides. Each, when set, wins over the skin's token. */
export interface AppearanceOverrides {
  feltColor?: string;
  accent?: string;
  bidBoxColor?: string;
  auctionColor?: string;
  cardBackColor?: string;
}

/** A user's full table appearance choice — the persisted read model. */
export interface TableAppearance {
  skin: SkinName;
  handLayout: "row" | "fan";
  bidPad: "grid" | "columns";
  centreFrame: boolean;
  fanSpread: number;
  fanRadius: number;
  overrides: AppearanceOverrides;
}

/** A named appearance bundle (the reference look + one per plain skin). */
export interface Preset {
  label: string;
  note?: string;
  appearance: Partial<TableAppearance>;
}

export interface FanLimits {
  spread: { min: number; max: number; step: number; default: number };
  radius: { min: number; max: number; default: number };
}

interface SkinsFile {
  order: SkinName[];
  skins: Record<SkinName, SkinTokens>;
  strainTint: Record<Strain, StrainTint>;
  overrideOptions: Record<keyof AppearanceOverrides, string[]>;
  fan: FanLimits;
  defaults: {
    skin: SkinName;
    handLayout: "row" | "fan";
    bidPad: "grid" | "columns";
    centreFrame: boolean;
    fanSpread: number;
    fanRadius: number;
    overrides: AppearanceOverrides;
  };
  presets: Record<string, Preset>;
}

const RAW = skinsData as unknown as SkinsFile;

export const TABLE_SKINS: Record<SkinName, SkinTokens> = RAW.skins;
export const SKIN_ORDER: readonly SkinName[] = RAW.order;
export const STRAIN_TINT: Record<Strain, StrainTint> = RAW.strainTint;
export const OVERRIDE_OPTIONS: Record<keyof AppearanceOverrides, string[]> = RAW.overrideOptions;
export const FAN_LIMITS: FanLimits = RAW.fan;
export const PRESETS: Record<string, Preset> = RAW.presets;

/** The 17-token surrounds keys that dress a skin — the columns of SkinTokens. */
const OVERRIDE_KEYS: readonly (keyof AppearanceOverrides)[] = [
  "feltColor",
  "accent",
  "bidBoxColor",
  "auctionColor",
  "cardBackColor",
];

/** The built-in appearance: bbo, row hands, grid pad, no frame, no overrides. */
export const DEFAULT_APPEARANCE: TableAppearance = {
  skin: RAW.defaults.skin,
  handLayout: RAW.defaults.handLayout,
  bidPad: RAW.defaults.bidPad,
  centreFrame: RAW.defaults.centreFrame,
  fanSpread: RAW.defaults.fanSpread,
  fanRadius: RAW.defaults.fanRadius,
  overrides: {},
};

function isSkinName(v: unknown): v is SkinName {
  return typeof v === "string" && (SKIN_ORDER as readonly string[]).includes(v);
}

/** Resolved tokens for a skin, its five colour overrides applied where set. */
export function resolveSkin(
  name: SkinName,
  overrides: AppearanceOverrides = {},
): SkinTokens {
  const base = TABLE_SKINS[name] ?? TABLE_SKINS[DEFAULT_APPEARANCE.skin];
  // An override wins ONLY when set to a non-empty string; "" / null / undefined
  // fall through to the skin's own token.
  const ov = (k: keyof AppearanceOverrides): string | undefined => {
    const v = overrides[k];
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
  };
  const felt = ov("feltColor");
  return {
    ...base,
    felt: felt ?? base.felt,
    feltFlat: felt ?? base.feltFlat,
    accent: ov("accent") ?? base.accent,
    trayBg: ov("bidBoxColor") ?? base.trayBg,
    auctionBg: ov("auctionColor") ?? base.auctionBg,
    cardBack: ov("cardBackColor") ?? base.cardBack,
  };
}

/** The next skin in SKIN_ORDER, wrapping round (bbo→…→claret→bbo). */
export function nextSkin(name: SkinName): SkinName {
  const i = SKIN_ORDER.indexOf(name);
  return SKIN_ORDER[(i + 1) % SKIN_ORDER.length] ?? DEFAULT_APPEARANCE.skin;
}

/** A skin's display label (the value the ☰ Skin row shows). */
export function skinLabel(name: SkinName): string {
  return (TABLE_SKINS[name] ?? TABLE_SKINS[DEFAULT_APPEARANCE.skin]).label;
}

function normalizeOverrides(input: unknown): AppearanceOverrides {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: AppearanceOverrides = {};
  for (const k of OVERRIDE_KEYS) {
    const v = o[k];
    if (typeof v === "string" && v.trim() !== "") out[k] = v;
  }
  return out;
}

function normalizeSpread(v: unknown): number {
  const { min, max, step, default: def } = FAN_LIMITS.spread;
  if (typeof v !== "number" || !Number.isFinite(v)) return def;
  const clamped = Math.min(max, Math.max(min, v));
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

function normalizeRadius(v: unknown): number {
  const { min, max } = FAN_LIMITS.radius;
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_APPEARANCE.fanRadius;
  // 0 is the sentinel for "auto" and is always valid; any other value clamps
  // into the slider range.
  if (v === 0) return 0;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/**
 * Coerce untrusted input into a valid TableAppearance: unknown skins/layouts
 * fall back to defaults, fan values clamp into range, unknown fields are
 * dropped. Never throws — a corrupt stored value degrades to the defaults.
 */
export function normalizeAppearance(input: unknown): TableAppearance {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    skin: isSkinName(o.skin) ? o.skin : DEFAULT_APPEARANCE.skin,
    handLayout:
      o.handLayout === "fan" || o.handLayout === "row"
        ? o.handLayout
        : DEFAULT_APPEARANCE.handLayout,
    bidPad:
      o.bidPad === "columns" || o.bidPad === "grid" ? o.bidPad : DEFAULT_APPEARANCE.bidPad,
    centreFrame:
      typeof o.centreFrame === "boolean" ? o.centreFrame : DEFAULT_APPEARANCE.centreFrame,
    fanSpread: normalizeSpread(o.fanSpread),
    fanRadius: normalizeRadius(o.fanRadius),
    overrides: normalizeOverrides(o.overrides),
  };
}

/** The appearance a named preset stages, filled onto the defaults. */
export function applyPreset(id: string): TableAppearance {
  const preset = PRESETS[id];
  if (!preset) return normalizeAppearance(DEFAULT_APPEARANCE);
  return normalizeAppearance({ ...DEFAULT_APPEARANCE, ...preset.appearance });
}

// ── Persistence seam ─────────────────────────────────────────────────────────

export interface TableConfigStore {
  getForUser(userId: string): Promise<TableAppearance | null>;
  putForUser(userId: string, a: TableAppearance): Promise<void>;
}

export interface TableConfigStoreData {
  entries: Record<string, TableAppearance>;
}

export class InMemoryTableConfigStore implements TableConfigStore {
  constructor(protected data: TableConfigStoreData = { entries: {} }) {}
  protected persist(): void {}
  async getForUser(userId: string): Promise<TableAppearance | null> {
    return this.data.entries[userId] ?? null;
  }
  async putForUser(userId: string, a: TableAppearance): Promise<void> {
    this.data.entries[userId] = a;
    this.persist();
  }
}
