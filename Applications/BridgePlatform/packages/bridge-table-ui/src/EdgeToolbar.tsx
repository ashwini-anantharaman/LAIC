"use client";

// EdgeToolbar — one slim bar that can sit on the top or bottom edge of the
// felt (EdgeToolbar.dc.html). Info reads along the top edge; actions sit
// under your hand. A `spacer` item is a HARD SPLIT, not a flexible gap:
// everything after the last spacer is pinned to the far end and never scrolls.
//
// OVERFLOW, not scroll. Control sizes come from a rendered-px touch floor, so
// as the host's scale falls each control gets WIDER in authored px — a bar that
// fits at one scale silently overruns at another. What does not fit moves into a
// `⋯` group with a popover instead, so every item stays reachable at any size.
// The lead track shrinks in ONE measured step (longest prefix that fits, by
// offsetWidth), with hysteresis on the way back; once the lead has shed
// everything the pinned tail sheds from its FRONT, protecting the far end.
//
// Single-pricing: a control is priced EITHER by a host that already sized the
// bar against the touch floor (it passes `thickness`, and the control inside is
// t − 14) OR by a host that passes its `scale` and lets the floor resolve here.
// Doing both compounds the division — that produced a 325px control in a 338px
// bar — so `scale` only participates when the host actually passes it.

import { useTableHost } from "./host";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

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

const DEFAULT_ACCENT = "#384bb3";
const TONES = {
  plain: { bg: "rgba(255,255,255,.10)", border: "rgba(255,255,255,.18)", color: "#eef4f1" },
  accent: { bg: DEFAULT_ACCENT, border: "#5468d6", color: "#fff" },
  warn: { bg: "#8a3030", border: "#a94848", color: "#fff" },
  go: { bg: "#116710", border: "#1a8a18", color: "#fff" },
} as const;

// Hysteresis: an item is dropped the moment it does not fit, but only restored
// once there is real room for it. Without the gap the track would add an item,
// overflow, drop it, and oscillate forever.
const GIVE_BACK = 48;

export function EdgeToolbar({
  side,
  items,
  thickness = 44,
  condensed = false,
  scale,
  minTouch = 30,
  bg = "rgba(9,22,17,.90)",
  accent = DEFAULT_ACCENT,
}: Readonly<{
  side: "top" | "bottom";
  items: readonly ToolbarItem[];
  thickness?: number;
  condensed?: boolean;
  /**
   * The stage scale this bar renders under. Pass it ONLY when the host has NOT
   * already priced `thickness` against the touch floor — passing both compounds
   * the division. Omit it when the host sizes the bar itself (the phone tier).
   */
  scale?: number;
  minTouch?: number;
  bg?: string;
  /** Accent for the ☰ / Claim buttons — a skin's `accent` token dresses it. */
  accent?: string;
}>) {
  const [vis, setVis] = useState(99);
  const [tvis, setTvis] = useState(99);
  const [open, setOpen] = useState(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const measureRef = useRef<() => void>(() => {});

  const tones =
    accent === DEFAULT_ACCENT
      ? TONES
      : { ...TONES, accent: { bg: accent, border: accent, color: "#fff" } };

  const t = thickness;
  // Two ways to price a control, and only one may apply. `t - 14` is the control
  // inside a host-priced bar; the scale term is added only when the host passed
  // a scale (undefined is falsy — a default of 1 would wrongly always apply it).
  const ctrlH = Math.min(
    Math.round(t * 2.2),
    Math.max(
      Math.round(t * 0.68),
      t - 14,
      scale ? Math.ceil(minTouch / Math.max(0.05, scale)) : 0,
    ),
  );
  const { LinkComponent } = useTableHost();
  const gap = condensed ? 5 : 7;
  const ctrlPad = Math.round(ctrlH * (condensed ? 0.17 : 0.4));
  const ctrlFont = Math.max(condensed ? 11 : 13, Math.round(ctrlH * (condensed ? 0.28 : 0.4)));
  const chipH = Math.round(ctrlH * 0.86);
  const chipLabelFont = Math.max(9, Math.round(ctrlH * 0.26));

  // A spacer is the hard split: everything after the LAST one is the pinned tail.
  let cut = -1;
  items.forEach((it, i) => {
    if (it.kind === "spacer") cut = i;
  });
  const leadRaw = cut < 0 ? items : items.slice(0, cut);
  const tailRaw = cut < 0 ? [] : items.slice(cut + 1);
  const n = leadRaw.length;
  const tn = tailRaw.length;

  const visC = Math.max(0, Math.min(vis, n));
  // Dividers alone in the overflow are noise — they only separate what is still
  // on the bar.
  const tvisC = Math.max(1, Math.min(tvis, tn));
  const tailShown = tailRaw.slice(tailRaw.length - tvisC);
  const hidden = leadRaw
    .slice(visC)
    .concat(tailRaw.slice(0, tailRaw.length - tvisC))
    .filter((it) => it.kind !== "divider");
  const hasMore = hidden.length > 0;
  const openEff = open && hasMore;

  // Measure the RENDERED children and keep the longest prefix that fits — one
  // step down, incremental on the way back. offsetWidth (layout px), never
  // getBoundingClientRect (post-transform px): the host may scale the whole bar.
  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const visM = Math.min(vis, n);
    const track = el.clientWidth;
    // A track squeezed to zero is the case that MATTERS — the lead has given up
    // everything and the tail is what still overruns. Do not bail on it.
    if (track > 0) {
      if (el.scrollWidth > track + 1) {
        const g = parseFloat(getComputedStyle(el).gap) || 0;
        let used = 0;
        let fits = 0;
        for (const kid of Array.from(el.children)) {
          used += (kid as HTMLElement).offsetWidth + (fits ? g : 0);
          if (used <= track) fits++;
          else break;
        }
        if (fits < visM) setVis(fits);
        return;
      }
      if (track - el.scrollWidth > GIVE_BACK && visM < n) {
        setVis(visM + 1);
        return;
      }
      if (visM !== vis) {
        setVis(visM);
        return;
      }
    }
    // The pinned tail is exempt from scrolling, not from fitting. Once the lead
    // has shed everything and the bar still overruns, the tail sheds from its
    // FRONT — the far end is the end the pin exists to protect.
    const root = rootRef.current;
    if (!root) return;
    const tvisM = Math.min(tvis, tn);
    if (visM === 0 && root.scrollWidth > root.clientWidth + 1 && tvisM > 1) setTvis(tvisM - 1);
    else if (root.clientWidth - root.scrollWidth > GIVE_BACK && tvisM < tn) setTvis(tvisM + 1);
    else if (tvisM !== tvis) setTvis(tvisM);
  }, [vis, tvis, n, tn]);

  // Re-measure after every render (mirrors componentDidUpdate) — the loop
  // converges because vis only ever decreases when the bar overruns.
  useLayoutEffect(() => {
    measureRef.current = measure;
    measure();
  });

  // Close the popover on an outside click; tear the observer down on unmount.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      if (roRef.current) roRef.current.disconnect();
    };
  }, []);

  // Observe the TRACK's box, not its content: the box is the bar's own width, so
  // watching it cannot feed itself.
  const setTrack = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    trackRef.current = el;
    rootRef.current = el ? (el.parentElement as HTMLDivElement | null) : null;
    if (!el) return;
    if (typeof ResizeObserver === "function") {
      roRef.current = new ResizeObserver(() => measureRef.current());
      roRef.current.observe(el);
    }
    measureRef.current();
  }, []);

  // ── item renderers ────────────────────────────────────────────────────────
  const renderItem = (it: ToolbarItem, i: number) => {
    if (it.kind === "spacer") return null;
    if (it.kind === "node")
      return (
        <span key={i} style={{ flex: "none", display: "flex", alignItems: "center", gap }}>
          {it.node}
        </span>
      );
    if (it.kind === "divider")
      return <span key={i} style={{ display: "block", flex: "none", width: 1, height: 20, background: "rgba(255,255,255,.16)" }} />;
    if (it.kind === "chip")
      return (
        <div key={i} title={it.title ?? it.label} style={{ flex: "none", display: "flex", alignItems: "baseline", gap: 5, padding: "0 8px", height: chipH, borderRadius: 5, background: "rgba(255,255,255,.07)", whiteSpace: "nowrap" }}>
          {/* The condensed bar is the PHONE bar: it renders through the stage
              scale, where a 400-weight micro-label smears. Bold it there only —
              the wide bar reads at full size and keeps its authored weight. */}
          <span style={{ fontSize: chipLabelFont, fontWeight: condensed ? 700 : 400, letterSpacing: ".09em", textTransform: "uppercase", color: condensed ? "#a3b7ae" : "#8fa39a" }}>{it.label}</span>
          <span style={{ fontSize: ctrlFont, fontWeight: condensed ? 800 : 700, lineHeight: 1, color: it.color ?? "#eef4f1" }}>{it.value}</span>
        </div>
      );
    const tone = tones[it.tone ?? "plain"];
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
        <LinkComponent key={i} href={it.href} title={it.title ?? it.label} aria-label={it.ariaLabel} style={style}>
          {it.label}
        </LinkComponent>
      );
    return (
      <button key={i} type="button" title={it.title ?? it.label} aria-label={it.ariaLabel} disabled={dim} onClick={dim ? undefined : (it.on ?? undefined)} style={style}>
        {it.label}
      </button>
    );
  };

  // In the popover chips read as label/value rows; buttons/icons go full-width.
  const renderPop = (it: ToolbarItem, i: number) => {
    if (it.kind === "divider" || it.kind === "spacer") return null;
    if (it.kind === "chip")
      return (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 4px" }}>
          <span style={{ fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }}>{it.label}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: it.color ?? "#eef4f1" }}>{it.value}</span>
        </div>
      );
    if (it.kind === "node")
      return (
        <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          {it.node}
        </div>
      );
    const tone = tones[it.tone ?? "plain"];
    const dim = it.disabled === true;
    const style: CSSProperties = {
      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      width: "100%", height: ctrlH, marginBottom: 4, padding: `0 ${ctrlPad}px`,
      border: `1px solid ${tone.border}`, borderRadius: 6, background: tone.bg, color: tone.color,
      fontFamily: "Arial, Helvetica, sans-serif", fontSize: ctrlFont, fontWeight: 700,
      lineHeight: 1, whiteSpace: "nowrap", textDecoration: "none",
      cursor: dim || (!it.on && !it.href) ? "default" : "pointer", opacity: dim ? 0.42 : 1,
    };
    // Close the popover once a control inside it has been used.
    const close = () => setOpen(false);
    if (it.href && !dim)
      return (
        <LinkComponent key={i} href={it.href} title={it.title ?? it.label} aria-label={it.ariaLabel} style={style} onClick={close}>
          {it.label}
        </LinkComponent>
      );
    return (
      <button key={i} type="button" title={it.title ?? it.label} aria-label={it.ariaLabel} disabled={dim} onClick={dim ? undefined : () => { it.on?.(); close(); }} style={style}>
        {it.label}
      </button>
    );
  };

  const barMinH = Math.max(t, ctrlH + 14);
  const popStyle: CSSProperties = {
    position: "absolute",
    ...(side === "bottom" ? { bottom: ctrlH + 12 } : { top: ctrlH + 12 }),
    right: 0,
    zIndex: 40,
    minWidth: Math.round(ctrlH * 4.2),
    maxHeight: Math.round(ctrlH * 7),
    overflowY: "auto",
    padding: 8,
    borderRadius: 8,
    background: "#0f1a16",
    border: "1px solid rgba(255,255,255,.16)",
    boxShadow: "0 10px 26px rgba(0,0,0,.45)",
  };

  return (
    <div
      data-testid="edge-toolbar"
      style={{ width: "100%", [condensed ? "height" : "minHeight"]: barMinH, flex: "none", display: "flex", alignItems: "center", gap, padding: `6px ${condensed ? 8 : 10}px`, background: bg, boxSizing: "border-box", ...(side === "top" ? { borderBottom: "1px solid rgba(255,255,255,.13)" } : { borderTop: "1px solid rgba(255,255,255,.13)" }) } as CSSProperties}
    >
      {/* The measured lead track. min-width:0 lets it shrink instead of pushing
          the pinned half out; overflow is hidden because the ⋯ group — not a
          scroll strip — is what reveals what does not fit. */}
      <div
        ref={setTrack}
        style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "safe center", gap, ...(condensed ? { overflow: "hidden", flexWrap: "nowrap" } : { flexWrap: "wrap" }) } as CSSProperties}
      >
        {leadRaw.slice(0, visC).map(renderItem)}
      </div>

      {hasMore && (
        <div style={{ position: "relative", flex: "none" }}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            title={`${hidden.length} more`}
            aria-label="More controls"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: ctrlH, padding: `0 ${ctrlPad}px`, border: `1px solid ${openEff ? "#12909f" : "rgba(255,255,255,.18)"}`, borderRadius: 6, background: openEff ? "#0d707c" : "rgba(255,255,255,.10)", color: "#eef4f1", fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, fontSize: ctrlFont, lineHeight: 1, cursor: "pointer" }}
          >
            <span>⋯</span>
            <span style={{ fontSize: chipLabelFont, opacity: 0.8 }}>{hidden.length}</span>
          </button>
          {openEff && <div style={popStyle}>{hidden.map(renderPop)}</div>}
        </div>
      )}

      {tailShown.length > 0 && (
        <div style={{ flex: "none", minWidth: 0, display: "flex", alignItems: "center", gap }}>
          {tailShown.map(renderItem)}
        </div>
      )}
    </div>
  );
}
