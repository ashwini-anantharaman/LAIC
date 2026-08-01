"use client";

// EdgeToolbar — one slim bar that can sit on the top or bottom edge of the
// felt (EdgeToolbar.dc.html). Info reads along the top edge; actions sit
// under your hand. A `spacer` item is a HARD SPLIT, not a flexible gap:
// everything after the last spacer is pinned to the far end and never
// scrolls, while the items before it wrap (or scroll when condensed).
//
// Controls are sized FROM the bar, not fixed: a host that scales the whole
// stage down passes its scale, and the touch minimum is divided back through
// it so the RENDERED control still clears the floor.

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export type ToolbarItem =
  | { kind: "chip"; label: string; value: string; color?: string; title?: string }
  | {
      kind: "button" | "icon";
      label: string;
      tone?: "plain" | "accent" | "warn" | "go";
      title?: string;
      ariaLabel?: string;
      disabled?: boolean;
      on?: (() => void) | null;
      href?: string;
    }
  | { kind: "divider" }
  | { kind: "spacer" }
  /** Platform escape hatch: a pre-built node (pause/step/undo controls). */
  | { kind: "node"; node: ReactNode };

const TONES = {
  plain: { bg: "rgba(255,255,255,.10)", border: "rgba(255,255,255,.18)", color: "#eef4f1" },
  accent: { bg: "#384bb3", border: "#5468d6", color: "#fff" },
  warn: { bg: "#8a3030", border: "#a94848", color: "#fff" },
  go: { bg: "#116710", border: "#1a8a18", color: "#fff" },
} as const;

export function EdgeToolbar({
  side,
  items,
  thickness = 44,
  condensed = false,
  scale = 1,
  minTouch = 30,
  bg = "rgba(9,22,17,.90)",
}: Readonly<{
  side: "top" | "bottom";
  items: readonly ToolbarItem[];
  thickness?: number;
  condensed?: boolean;
  /** The stage scale this bar renders under — touch floors divide through it. */
  scale?: number;
  minTouch?: number;
  bg?: string;
}>) {
  const t = thickness;
  const ctrlH = Math.min(
    Math.round(t * 2.2),
    Math.max(Math.round(t * 0.68), Math.ceil(minTouch / Math.max(0.05, scale))),
  );
  const gap = condensed ? 5 : 7;
  const ctrlPad = Math.round(ctrlH * (condensed ? 0.17 : 0.4));
  const ctrlFont = Math.max(condensed ? 11 : 13, Math.round(ctrlH * (condensed ? 0.28 : 0.4)));
  const chipH = Math.round(ctrlH * 0.86);
  const chipLabelFont = Math.max(9, Math.round(ctrlH * 0.26));

  let cut = -1;
  items.forEach((it, i) => {
    if (it.kind === "spacer") cut = i;
  });
  const lead = cut < 0 ? items : items.slice(0, cut);
  const tail = cut < 0 ? [] : items.slice(cut + 1);

  const render = (it: ToolbarItem, i: number) => {
    if (it.kind === "spacer") return null;
    if (it.kind === "node") return <span key={i} style={{ flex: "none", display: "flex", alignItems: "center", gap }}>{it.node}</span>;
    if (it.kind === "divider")
      return <span key={i} style={{ display: "block", flex: "none", width: 1, height: 20, background: "rgba(255,255,255,.16)" }} />;
    if (it.kind === "chip")
      return (
        <div key={i} title={it.title ?? it.label} style={{ flex: "none", display: "flex", alignItems: "baseline", gap: 5, padding: "0 8px", height: chipH, borderRadius: 5, background: "rgba(255,255,255,.07)", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: chipLabelFont, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }}>{it.label}</span>
          <span style={{ fontSize: ctrlFont, fontWeight: 700, lineHeight: 1, color: it.color ?? "#eef4f1" }}>{it.value}</span>
        </div>
      );
    const tone = TONES[it.tone ?? "plain"];
    const dim = it.disabled === true;
    const style: CSSProperties = {
      flex: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      width: it.kind === "icon" ? ctrlH : undefined, height: ctrlH,
      padding: it.kind === "icon" ? 0 : `0 ${ctrlPad}px`,
      border: `1px solid ${tone.border}`, borderRadius: 6, background: tone.bg, color: tone.color,
      fontFamily: "Arial, Helvetica, sans-serif", fontSize: ctrlFont, fontWeight: it.kind === "icon" ? 400 : 700,
      lineHeight: 1, whiteSpace: "nowrap", textDecoration: "none",
      cursor: dim || (!it.on && !it.href) ? "default" : "pointer", opacity: dim ? 0.42 : 1,
    };
    if (it.href && !dim)
      return (
        <Link key={i} href={it.href} title={it.title ?? it.label} aria-label={it.ariaLabel} style={style}>
          {it.label}
        </Link>
      );
    return (
      <button key={i} type="button" title={it.title ?? it.label} aria-label={it.ariaLabel} disabled={dim} onClick={dim ? undefined : (it.on ?? undefined)} style={style}>
        {it.label}
      </button>
    );
  };

  return (
    <div style={{ width: "100%", [condensed ? "height" : "minHeight"]: Math.max(t, ctrlH + 14), flex: "none", display: "flex", alignItems: "center", gap, padding: `6px ${condensed ? 8 : 10}px`, background: bg, boxSizing: "border-box", ...(side === "top" ? { borderBottom: "1px solid rgba(255,255,255,.13)" } : { borderTop: "1px solid rgba(255,255,255,.13)" }) } as CSSProperties}>
      {/* The scrolling half — min-width:0 lets it shrink instead of pushing
          the pinned half out of the bar. `safe center` centres while items
          fit and falls back to flex-start on overflow. */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "safe center", gap, ...(condensed ? { overflowX: "auto", overflowY: "hidden", flexWrap: "nowrap" } : { flexWrap: "wrap" }) } as CSSProperties}>
        {lead.map(render)}
      </div>
      {tail.length > 0 && (
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap, marginLeft: "auto" }}>
          {tail.map(render)}
        </div>
      )}
    </div>
  );
}
