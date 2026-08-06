"use client";

// The skins configurator client. All state is a single STAGED TableAppearance,
// initialised from the user's saved look. Every control (presets, skin gallery,
// layout toggles, fan sliders, colour overrides) mutates that staged copy, and
// the live preview at the bottom re-derives itself from resolveSkin(staged) on
// every render — so it visibly reacts to each control. Save posts the staged
// JSON to the server action; Reset stages the built-in defaults.

import {
  DEFAULT_APPEARANCE,
  FAN_LIMITS,
  OVERRIDE_OPTIONS,
  PRESETS,
  SKIN_ORDER,
  STRAIN_TINT,
  applyPreset,
  resolveSkin,
  TABLE_SKINS,
  type AppearanceOverrides,
  type SkinName,
  type SkinTokens,
  type Strain,
  type TableAppearance,
} from "@bridge/table-config";
import { useState } from "react";

// ── Appearance equality (for highlighting the matching preset / skin) ─────────

const OVERRIDE_KEYS: readonly (keyof AppearanceOverrides)[] = [
  "feltColor",
  "accent",
  "bidBoxColor",
  "auctionColor",
  "cardBackColor",
];

function sameOverrides(a: AppearanceOverrides, b: AppearanceOverrides): boolean {
  return OVERRIDE_KEYS.every((k) => (a[k] ?? "") === (b[k] ?? ""));
}

function sameAppearance(a: TableAppearance, b: TableAppearance): boolean {
  return (
    a.skin === b.skin &&
    a.handLayout === b.handLayout &&
    a.bidPad === b.bidPad &&
    a.centreFrame === b.centreFrame &&
    a.fanSpread === b.fanSpread &&
    a.fanRadius === b.fanRadius &&
    sameOverrides(a.overrides, b.overrides)
  );
}

// Preset order: the reference look first, then one per plain skin.
const PRESET_IDS = [
  "classic-club",
  ...Object.keys(PRESETS).filter((id) => id !== "classic-club"),
];

// A demo 13-card hand for the preview fan / row.
const DEMO_HAND: { r: string; s: string; red: boolean }[] = [
  { r: "A", s: "♠", red: false },
  { r: "K", s: "♠", red: false },
  { r: "Q", s: "♠", red: false },
  { r: "J", s: "♥", red: true },
  { r: "T", s: "♥", red: true },
  { r: "9", s: "♥", red: true },
  { r: "8", s: "♦", red: true },
  { r: "7", s: "♦", red: true },
  { r: "6", s: "♦", red: true },
  { r: "5", s: "♣", red: false },
  { r: "4", s: "♣", red: false },
  { r: "3", s: "♣", red: false },
  { r: "2", s: "♣", red: false },
];

const STRAIN_ORDER: { key: Strain; glyph: string }[] = [
  { key: "N", glyph: "NT" },
  { key: "S", glyph: "♠" },
  { key: "H", glyph: "♥" },
  { key: "D", glyph: "♦" },
  { key: "C", glyph: "♣" },
];

// ── Section shells ────────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: Readonly<{ title: string; hint?: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <div className="mb-3">
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
  disabled,
}: Readonly<{
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}>) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-neutral-700">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="inline-flex overflow-hidden rounded-md border border-neutral-300"
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`px-3 py-1 text-sm font-medium transition-colors ${
                active
                  ? "bg-emerald-700 text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-50"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Live preview ──────────────────────────────────────────────────────────────

/** Reserved-box + per-card fan geometry, verbatim from the SeatHand contract. */
function fanGeometry(n: number, spreadDeg: number, radius: number, cw: number, ch: number) {
  const angles: number[] = [];
  for (let i = 0; i < n; i++) {
    angles.push(n === 1 ? 0 : -spreadDeg / 2 + i * (spreadDeg / (n - 1)));
  }
  let xMin = Infinity,
    xMax = -Infinity,
    yMin = Infinity,
    yMax = -Infinity;
  for (const deg of angles) {
    const a = (deg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (const dx of [-cw / 2, cw / 2]) {
      for (const dy of [-radius, -radius + ch]) {
        const x = dx * cos - dy * sin;
        const y = dx * sin + dy * cos;
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
      }
    }
  }
  const w = Math.ceil(Math.max(-xMin, xMax) * 2) + 4;
  const h = Math.ceil(yMax - yMin) + 4;
  const top = Math.ceil(-yMin - radius) + 2;
  return { angles, w, h, top };
}

const PREVIEW_CW = 44;
const PREVIEW_CH = 64;

function CardFace({
  card,
  style,
}: Readonly<{ card: { r: string; s: string; red: boolean }; style?: React.CSSProperties }>) {
  return (
    <div
      style={{
        width: PREVIEW_CW,
        height: PREVIEW_CH,
        background: "#fff",
        border: "1px solid #6b6b6b",
        borderRadius: 4,
        boxShadow: "-2px 1px 4px rgba(0,0,0,.28)",
        color: card.red ? "#c02020" : "#161616",
        ...style,
      }}
    >
      <div
        style={{
          padding: "2px 0 0 4px",
          lineHeight: 1,
          fontWeight: 700,
          fontSize: 15,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <span>{card.r}</span>
        <span style={{ fontSize: 14 }}>{card.s}</span>
      </div>
    </div>
  );
}

function FanHand({ spread, radius }: Readonly<{ spread: number; radius: number }>) {
  const n = DEMO_HAND.length;
  const geo = fanGeometry(n, spread, radius, PREVIEW_CW, PREVIEW_CH);
  return (
    <div
      data-testid="preview-hand-fan"
      style={{ position: "relative", width: geo.w, height: geo.h, margin: "0 auto" }}
    >
      {DEMO_HAND.map((card, i) => (
        <div
          key={i}
          data-fan-card="1"
          style={{
            position: "absolute",
            left: "50%",
            top: geo.top,
            transform: `translateX(-50%) rotate(${geo.angles[i]}deg)`,
            transformOrigin: `50% ${radius}px`,
            transition: "transform 120ms",
          }}
        >
          <CardFace card={card} />
        </div>
      ))}
    </div>
  );
}

function RowHand() {
  return (
    <div
      data-testid="preview-hand-row"
      style={{ display: "flex", justifyContent: "center", paddingTop: 6 }}
    >
      {DEMO_HAND.map((card, i) => (
        <CardFace key={i} card={card} style={{ marginLeft: i === 0 ? 0 : -22 }} />
      ))}
    </div>
  );
}

/** Mini suit-column bidding pad — STRAIN_TINT, contract geometry at cell≈34. */
function ColumnsPad({ radius }: Readonly<{ radius: string }>) {
  const cell = 34;
  const gap = Math.round(cell * 0.13);
  const colPad = Math.round(cell * 0.11);
  const cellW = cell;
  const cellH = Math.round(cell * 0.92);
  const levelFont = Math.round(cell * 0.62);
  const glyphFont = Math.round(cell * 0.42);
  const levels = [1, 2, 3, 4, 5, 6, 7];
  return (
    <div
      data-testid="preview-bidpad-columns"
      style={{ display: "flex", gap, justifyContent: "center", flexWrap: "nowrap" }}
    >
      {STRAIN_ORDER.map(({ key, glyph }) => {
        const col = STRAIN_TINT[key];
        return (
          <div
            key={key}
            style={{
              display: "flex",
              flexDirection: "column",
              gap,
              padding: colPad,
              background: col.bg,
              border: `2px solid ${col.edge}`,
              borderRadius: radius,
            }}
          >
            {levels.map((lvl) => (
              <button
                key={lvl}
                type="button"
                tabIndex={-1}
                style={{
                  width: cellW,
                  height: cellH,
                  background: "transparent",
                  border: "none",
                  color: col.ink,
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "center",
                  gap: 1,
                  cursor: "default",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: levelFont }}>{lvl}</span>
                <span style={{ fontWeight: 700, fontSize: glyphFont }}>{glyph}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Mini level-grid tray — today's BidBox, dressed by the skin's trayBg. */
function GridPad({ tokens }: Readonly<{ tokens: SkinTokens }>) {
  const levels = [1, 2, 3, 4, 5, 6, 7];
  return (
    <div
      data-testid="preview-bidpad-grid"
      style={{
        display: "inline-block",
        background: tokens.trayBg,
        border: `1px solid ${tokens.levelBorder}`,
        borderRadius: tokens.radius,
        padding: 8,
        margin: "0 auto",
      }}
    >
      {levels.map((lvl) => (
        <div key={lvl} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          {STRAIN_ORDER.map(({ key, glyph }) => {
            const col = STRAIN_TINT[key];
            return (
              <span
                key={key}
                style={{
                  width: 30,
                  height: 22,
                  background: tokens.strainBg,
                  border: `1px solid ${col.edge}`,
                  borderRadius: 3,
                  color: col.ink,
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {lvl}
                {glyph}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Preview({ staged }: Readonly<{ staged: TableAppearance }>) {
  const t = resolveSkin(staged.skin, staged.overrides);
  const radiusPx =
    staged.fanRadius === 0 ? Math.round(PREVIEW_CH * 4.2) : staged.fanRadius;

  const feltContent = (
    <div style={{ padding: "10px 8px" }}>
      {staged.handLayout === "fan" ? (
        <FanHand spread={staged.fanSpread} radius={radiusPx} />
      ) : (
        <RowHand />
      )}
      {/* Auction chip */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
        <span
          style={{
            background: t.auctionBg,
            color: "#1b1b1b",
            borderRadius: t.radius,
            padding: "3px 10px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          1♠ · Pass · 2♥ · Pass
        </span>
      </div>
      {/* Card-back strip */}
      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: 22,
              height: 32,
              background: t.cardBack,
              borderRadius: 3,
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)",
            }}
          />
        ))}
      </div>
      {/* Bid pad */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
        {staged.bidPad === "columns" ? <ColumnsPad radius={t.radius} /> : <GridPad tokens={t} />}
      </div>
    </div>
  );

  return (
    <div
      data-testid="skins-preview"
      style={{
        background: t.stageBg,
        fontFamily: t.font,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(0,0,0,.25)",
      }}
    >
      {/* Top toolbar strip */}
      <div
        style={{
          background: t.barBg,
          height: t.barThickness,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
        }}
      >
        <span
          data-testid="preview-accent"
          style={{ width: 26, height: 26, background: t.accent, borderRadius: 6 }}
        />
        <span style={{ width: 40, height: 14, background: t.chip, borderRadius: 7 }} />
        <span style={{ marginLeft: "auto", width: 40, height: 14, background: t.chip, borderRadius: 7 }} />
      </div>
      {/* Felt panel */}
      <div style={{ background: t.felt, padding: 12 }}>
        {staged.centreFrame ? (
          <div
            data-testid="preview-frame"
            style={{ border: "3px solid #c9992b", borderRadius: 10, padding: 10 }}
          >
            {feltContent}
          </div>
        ) : (
          feltContent
        )}
      </div>
    </div>
  );
}

// ── Swatch bits ───────────────────────────────────────────────────────────────

const GALLERY_SWATCHES: { label: string; key: keyof SkinTokens }[] = [
  { label: "Felt", key: "feltFlat" },
  { label: "Tray", key: "trayBg" },
  { label: "Auction", key: "auctionBg" },
  { label: "Card back", key: "cardBack" },
  { label: "Accent", key: "accent" },
  { label: "Chip", key: "chip" },
];

// ── Main ──────────────────────────────────────────────────────────────────────

export function SkinsClient({
  initial,
  save,
}: Readonly<{
  initial: TableAppearance;
  save: (formData: FormData) => void | Promise<void>;
}>) {
  const [staged, setStaged] = useState<TableAppearance>(initial);

  const patch = (p: Partial<TableAppearance>) => setStaged((s) => ({ ...s, ...p }));
  const setOverride = (key: keyof AppearanceOverrides, value: string | undefined) =>
    setStaged((s) => {
      const overrides = { ...s.overrides };
      if (value) overrides[key] = value;
      else delete overrides[key];
      return { ...s, overrides };
    });

  const isFan = staged.handLayout === "fan";
  const autoRadius = staged.fanRadius === 0;

  return (
    <div className="space-y-6">
      {/* (a) Presets */}
      <Section title="Presets" hint="One click stages a whole look. The card lights up when your staged appearance matches it.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PRESET_IDS.map((id) => {
            const preset = PRESETS[id];
            if (!preset) return null;
            const matches = sameAppearance(staged, applyPreset(id));
            return (
              <button
                key={id}
                type="button"
                data-testid="preset-card"
                onClick={() => setStaged(applyPreset(id))}
                aria-pressed={matches}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  matches
                    ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                    : "border-neutral-200 hover:bg-neutral-50"
                }`}
              >
                <span className="block text-sm font-semibold text-neutral-800">{preset.label}</span>
                {preset.note && (
                  <span className="mt-0.5 block text-xs text-neutral-500">{preset.note}</span>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      {/* (b) Skin gallery */}
      <Section title="Skin" hint="Pick a base skin; layout and colour choices below stay as they are.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SKIN_ORDER.map((name) => {
            const skin = TABLE_SKINS[name];
            const selected = staged.skin === name;
            return (
              <button
                key={name}
                type="button"
                data-testid="skin-card"
                onClick={() => patch({ skin: name as SkinName })}
                aria-pressed={selected}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                    : "border-neutral-200 hover:bg-neutral-50"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-neutral-800">{skin.label}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-400">
                    {name}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">{skin.note}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {GALLERY_SWATCHES.map((sw) => (
                    <span
                      key={sw.label}
                      title={sw.label}
                      style={{
                        display: "inline-flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 3,
                        background: "#18211e",
                        borderRadius: 6,
                        padding: "5px 6px",
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          background: String(skin[sw.key]),
                          boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          color: "#c9d4d0",
                        }}
                      >
                        {sw.label}
                      </span>
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* (c) Layout */}
      <Section title="Layout" hint="Hand shape, bidding pad, centre frame, and the fan geometry.">
        <div className="max-w-md space-y-1 divide-y divide-neutral-100">
          <Segmented
            label="Hand layout"
            value={staged.handLayout}
            options={[
              { value: "row", label: "Row" },
              { value: "fan", label: "Fan" },
            ]}
            onChange={(v) => patch({ handLayout: v })}
          />
          <Segmented
            label="Bid pad"
            value={staged.bidPad}
            options={[
              { value: "grid", label: "Level grid" },
              { value: "columns", label: "Suit columns" },
            ]}
            onChange={(v) => patch({ bidPad: v })}
          />
          <Segmented
            label="Centre frame"
            value={staged.centreFrame}
            options={[
              { value: false, label: "Off" },
              { value: true, label: "On" },
            ]}
            onChange={(v) => patch({ centreFrame: v })}
          />
        </div>

        <div className={`mt-4 max-w-md space-y-4 ${isFan ? "" : "opacity-50"}`}>
          <label className="block">
            <span className="flex items-center justify-between text-sm text-neutral-700">
              Fan spread
              <span className="font-mono text-xs text-neutral-500">{staged.fanSpread}°</span>
            </span>
            <input
              type="range"
              min={FAN_LIMITS.spread.min}
              max={FAN_LIMITS.spread.max}
              step={FAN_LIMITS.spread.step}
              value={staged.fanSpread}
              disabled={!isFan}
              onChange={(e) => patch({ fanSpread: Number(e.target.value) })}
              className="mt-1 w-full"
              aria-label="Fan spread"
            />
          </label>
          <div>
            <span className="flex items-center justify-between text-sm text-neutral-700">
              Fan radius
              <span className="font-mono text-xs text-neutral-500">
                {autoRadius ? "Auto" : `${staged.fanRadius}px`}
              </span>
            </span>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range"
                min={FAN_LIMITS.radius.min}
                max={FAN_LIMITS.radius.max}
                step={1}
                value={autoRadius ? FAN_LIMITS.radius.min : staged.fanRadius}
                disabled={!isFan || autoRadius}
                onChange={(e) => patch({ fanRadius: Number(e.target.value) })}
                className="w-full"
                aria-label="Fan radius"
              />
              <button
                type="button"
                aria-pressed={autoRadius}
                disabled={!isFan}
                onClick={() => patch({ fanRadius: autoRadius ? FAN_LIMITS.radius.min : 0 })}
                className={`shrink-0 rounded border px-2 py-1 text-xs font-medium ${
                  autoRadius
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                } ${!isFan ? "cursor-not-allowed opacity-50" : ""}`}
              >
                Auto
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* (d) Colour overrides */}
      <Section title="Colour overrides" hint="Override individual surrounds; leave on Skin default to follow the skin.">
        <div className="space-y-3">
          {(Object.keys(OVERRIDE_OPTIONS) as (keyof AppearanceOverrides)[]).map((key) => {
            const current = staged.overrides[key];
            return (
              <div key={key} className="flex flex-wrap items-center gap-2">
                <span className="w-28 shrink-0 text-sm text-neutral-700">{key}</span>
                <button
                  type="button"
                  aria-pressed={!current}
                  onClick={() => setOverride(key, undefined)}
                  className={`rounded border px-2 py-1 text-xs font-medium ${
                    !current
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  Skin default
                </button>
                {OVERRIDE_OPTIONS[key].map((hex) => {
                  const active = current === hex;
                  return (
                    <button
                      key={hex}
                      type="button"
                      title={hex}
                      aria-label={`${key} ${hex}`}
                      aria-pressed={active}
                      onClick={() => setOverride(key, hex)}
                      style={{ background: hex }}
                      className={`h-7 w-7 rounded ${
                        active
                          ? "ring-2 ring-emerald-500 ring-offset-1"
                          : "ring-1 ring-black/15"
                      }`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </Section>

      {/* (e) Live preview */}
      <Section title="Live preview" hint="Every control above changes this table.">
        <Preview staged={staged} />
      </Section>

      {/* (f) Footer */}
      <Section title="Save">
        <div className="flex flex-wrap items-center gap-3">
          <form action={save}>
            <input type="hidden" name="appearance" value={JSON.stringify(staged)} />
            <button
              type="submit"
              className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Save appearance
            </button>
          </form>
          <button
            type="button"
            onClick={() => setStaged(DEFAULT_APPEARANCE)}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            Reset to skin defaults
          </button>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Saved to your account — this appearance is per-user and follows you to every table you
          open.
        </p>
      </Section>
    </div>
  );
}
