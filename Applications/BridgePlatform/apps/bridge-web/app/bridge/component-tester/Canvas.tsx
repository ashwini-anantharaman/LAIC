"use client";

// The Build-mode Canvas — a client renderer that lays real @bridge/table-ui
// components out from a `slots` array (Canvas's own vocabulary) over ONE shared
// GameState snapshot. It mirrors the design's Canvas semantics reimplemented on
// OUR snapshots: grid/row/column layouts, per-slot footprints, whole-layout
// fit-scale (the natural-size inner box is transform-scaled as a whole so
// proportions are preserved), hideInactive via slotActive, optional labels, and
// the STYLE ⊕ session-base ⊕ slot.props merge (slot.props always wins).
//
// Nothing here is live: every handler is inert, so a Build view is a faithful
// static preview of a composed screen. The saved-view library reuses this same
// component at thumbnail scale, so a thumbnail is a real mount, not a snapshot.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { legalCalls } from "@bridge/engine";
import type { SkinTokens } from "@bridge/table-config";
import {
  AuctionBox,
  BidColumns,
  HandViewer,
  ResultCard,
  SeatDiagram,
  SeatHand,
  SeatPlate,
  TrickArea,
  type SeatHandMetrics,
} from "@bridge/table-ui";
import type {
  AuctionCall,
  CanvasLayout,
  CanvasSlot,
  Density,
  GameState,
  HandExposure,
  HandLayout,
  MomentResult,
  Seat,
} from "./types";

// ── small shaping helpers (shared with the inspect registry's intent) ─────────
const ORDER: Seat[] = ["W", "N", "E", "S"];
const PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };
const SEAT_NAMES: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const GLYPH: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" };
const GREY = "#d3d3d3";

const METRICS: Record<Density, SeatHandMetrics> = {
  comfortable: { w: 50, h: 71, rank: 26, glyph: 22, inset: 3 },
  compact: { w: 38, h: 54, rank: 20, glyph: 17, inset: 3 },
};

const vulFor = (state: GameState, seat: Seat) => {
  const v = String(state.vul).toLowerCase();
  const side = seat === "N" || seat === "S" ? "ns" : "ew";
  return v === "both" || v === "all" || v === side;
};

function auctionRows(state: GameState): (AuctionCall | null)[][] {
  const padded: (AuctionCall | null)[] = [
    ...Array.from({ length: ORDER.indexOf(state.dealer) }, () => null),
    ...state.auction,
  ];
  const rows: (AuctionCall | null)[][] = [];
  for (let i = 0; i < padded.length; i += 4) rows.push(padded.slice(i, i + 4));
  return rows;
}

// ── palette (only components OUR Canvas can actually place + Spacer) ──────────
export interface PaletteEntry {
  key: string;
  label: string;
  seat?: boolean;
}
export const PALETTE: PaletteEntry[] = [
  { key: "SeatDiagram", label: "Seat diagram", seat: true },
  { key: "SeatHand", label: "Seat hand", seat: true },
  { key: "SeatPlate", label: "Seat plate", seat: true },
  { key: "AuctionBox", label: "Auction box" },
  { key: "BidColumns", label: "Bid columns" },
  { key: "TrickArea", label: "Trick area" },
  { key: "ResultCard", label: "Result card" },
  { key: "HandViewer", label: "All four hands" },
  { key: "Spacer", label: "Spacer" },
];
export const SEAT_KINDS = new Set(["SeatDiagram", "SeatHand", "SeatPlate"]);
export const PALETTE_LABEL: Record<string, string> = Object.fromEntries(
  PALETTE.map((p) => [p.key, p.label]),
);
export const SEAT_ORDER: Seat[] = ["N", "E", "S", "W"];

// ── per-component visibility toggles ("Show in <component>") ──────────────────
// EVERY entry names a prop OUR Canvas really forwards to that component, so a
// flipped toggle always changes the cell DOM — a toggle that changed nothing
// would be worse than no toggle. `off` is the override written into slot.props;
// a part is "on" unless slot.props already carries that exact off value.
export interface PartDef {
  key: string;
  label: string;
  off: Record<string, unknown>;
}
export const PARTS: Record<string, PartDef[]> = {
  SeatHand: [{ key: "faces", label: "Card faces", off: { hidden: true } }],
  SeatDiagram: [{ key: "panel", label: "Boxed panel", off: { bare: true } }],
  SeatPlate: [
    { key: "tag", label: "Tag", off: { tag: "" } },
    { key: "dealer", label: "Dealer mark", off: { isDealer: false } },
  ],
  AuctionBox: [
    { key: "heads", label: "Seat header", off: { heads: [] } },
    { key: "deals", label: "Deals line", off: { emptyText: null } },
  ],
  TrickArea: [{ key: "cross", label: "Cross layout", off: { variant: "pill" } }],
  ResultCard: [
    { key: "score", label: "Score", off: { score: "" } },
    { key: "detail", label: "Detail", off: { detail: "" } },
  ],
};

export function partOn(slot: CanvasSlot, part: PartDef): boolean {
  const p = slot.props ?? {};
  return !Object.keys(part.off).every(
    (k) => k in p && JSON.stringify(p[k]) === JSON.stringify(part.off[k]),
  );
}

// ── presets (design layouts adapted to OUR available components) ──────────────
export interface PresetDef {
  layout: CanvasLayout;
  cols: number;
  slots: CanvasSlot[];
}
const sd = (seat: Seat): CanvasSlot => ({ component: "SeatDiagram", seat });
export const PRESETS: Record<string, PresetDef> = {
  table3x3: {
    layout: "grid",
    cols: 3,
    slots: [
      { component: "Spacer" }, sd("N"), { component: "Spacer" },
      sd("W"), { component: "AuctionBox" }, sd("E"),
      { component: "Spacer" }, sd("S"), { component: "Spacer" },
    ],
  },
  strip3x1: {
    layout: "row",
    cols: 3,
    slots: [{ component: "AuctionBox" }, { component: "SeatHand", seat: "S" }, { component: "BidColumns" }],
  },
  bidding: {
    layout: "grid",
    cols: 2,
    slots: [{ component: "AuctionBox" }, { component: "BidColumns" }],
  },
  fourHands: {
    layout: "grid",
    cols: 2,
    slots: [sd("N"), sd("E"), sd("S"), sd("W")],
  },
  compass: {
    layout: "grid",
    cols: 3,
    slots: [
      { component: "Spacer" }, { component: "SeatPlate", seat: "N" }, { component: "Spacer" },
      sd("W"), { component: "TrickArea" }, sd("E"),
      { component: "Spacer" }, { component: "SeatHand", seat: "S" }, { component: "Spacer" },
    ],
  },
  blank: { layout: "grid", cols: 3, slots: [] },
};
export const PRESET_KEYS: [string, string][] = [
  ["table3x3", "Table 3×3"],
  ["strip3x1", "Strip"],
  ["bidding", "Bidding"],
  ["fourHands", "Four hands"],
  ["compass", "Compass"],
  ["blank", "Blank"],
];

export const EXPOSURE_KEYS: HandExposure[] = ["auto", "faces", "backs", "hidden"];
export const EXPOSURE_LABEL: Record<HandExposure, string> = {
  auto: "Auto",
  faces: "Faces",
  backs: "Backs",
  hidden: "Hidden",
};
export const DEFAULT_HANDS: Record<Seat, HandExposure> = {
  N: "auto", E: "auto", S: "auto", W: "auto",
};

// ── the shared snapshot every canvas mount reads ─────────────────────────────
export interface VizContext {
  state: GameState;
  result: MomentResult;
  canSee: (seat: Seat) => boolean;
  dummy: Seat | null;
  skin: SkinTokens;
  density: Density;
  hand: HandLayout;
}

/** True when a slot has something to show in this phase (else hideInactive drops it). */
function slotActive(state: GameState, slot: CanvasSlot): boolean {
  switch (slot.component) {
    case "Spacer":
      return false;
    case "AuctionBox":
    case "BidColumns":
      return state.phase === "auction";
    case "TrickArea":
      return state.phase === "play";
    case "ResultCard":
      return state.phase === "complete";
    default:
      return true;
  }
}

/** Whether a seat's cards are hidden, resolving the per-seat exposure override. */
function seatHidden(ctx: VizContext, seat: Seat, exposure: HandExposure): boolean {
  if (exposure === "faces") return false;
  if (exposure === "backs" || exposure === "hidden") return true;
  return !ctx.canSee(seat); // auto → defer to the snapshot's real visibility
}

/** The base props for one slot from the snapshot, before slot.props overrides. */
function baseProps(ctx: VizContext, slot: CanvasSlot, exposure: HandExposure): Record<string, unknown> {
  const s = ctx.state;
  const seat = slot.seat ?? "S";
  switch (slot.component) {
    case "SeatHand":
      return {
        cards: s.hands[seat],
        metrics: METRICS[ctx.density],
        layout: ctx.hand,
        hidden: seatHidden(ctx, seat, exposure),
        fanSpread: 78,
        fanRadius: 0,
        backColor: ctx.skin.cardBack,
        backCount: s.hands[seat].length,
        isPlayable: () => false,
      };
    case "SeatDiagram": {
      const visible = !seatHidden(ctx, seat, exposure);
      return {
        cards: visible ? s.hands[seat] : [],
        panelBg: visible ? "#fff" : "#b3b3b3",
        width: 210,
        bare: false,
        isPlayable: () => false,
      };
    }
    case "SeatPlate":
      return {
        seat,
        name: SEAT_NAMES[seat],
        tag: seat === ctx.dummy ? "dummy" : "",
        bg: s.phase !== "complete" && seat === s.turn ? "#e8e8c8" : GREY,
        width: 200,
        isDealer: seat === s.dealer,
      };
    case "AuctionBox":
      return {
        bg: ctx.skin.auctionBg,
        heads: ORDER.map((st) => ({ seat: st, vul: vulFor(s, st), isDealer: st === s.dealer })),
        rows: auctionRows(s),
        dealerCol: ORDER.indexOf(s.dealer),
        emptyText: s.auction.length === 0 ? `${s.dealer} deals` : null,
      };
    case "BidColumns": {
      const inAuction = s.phase === "auction";
      return {
        legalCalls: inAuction ? [...legalCalls(s.auction, s.turn)] : [],
        live: false,
        pending: null,
        onStage: () => {},
        onConfirm: () => {},
        onCancel: () => {},
      };
    }
    case "TrickArea": {
      const plays = s.phase === "play" ? (s.tricks[s.tricks.length - 1]?.plays ?? []) : [];
      return { plays, turn: s.turn, variant: "cross" };
    }
    case "ResultCard":
      return { line: ctx.result.line, score: ctx.result.score, detail: ctx.result.detail };
    case "HandViewer":
      return {
        boardLabel: 7,
        dealer: s.dealer,
        vul: s.vul,
        hands: s.hands,
        names: SEAT_NAMES,
        visible: { N: ctx.canSee("N"), E: ctx.canSee("E"), S: ctx.canSee("S"), W: ctx.canSee("W") },
        auction: s.auction,
        highlightSeat: s.phase === "complete" ? (s.contract?.declarer ?? null) : s.turn,
        info: [
          { label: "NS tricks", value: String(s.trickCount.NS) },
          { label: "EW tricks", value: String(s.trickCount.EW) },
        ],
        result: [{ label: ctx.result.line, value: ctx.result.score }],
      };
    default:
      return {};
  }
}

/** Render one slot's real component, with slot.props merged last (it wins). */
function renderSlot(ctx: VizContext, slot: CanvasSlot, exposure: HandExposure): ReactNode {
  if (slot.component === "Spacer") return <div style={{ width: 120, height: 80 }} />;
  const p = { ...baseProps(ctx, slot, exposure), ...(slot.props ?? {}) } as Record<string, unknown>;
  switch (slot.component) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case "SeatHand": return <SeatHand {...(p as any)} />;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case "SeatDiagram": return <SeatDiagram {...(p as any)} />;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case "SeatPlate": return <SeatPlate {...(p as any)} />;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case "AuctionBox": return <AuctionBox {...(p as any)} />;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case "BidColumns": return <BidColumns {...(p as any)} />;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case "TrickArea": return <TrickArea {...(p as any)} />;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case "ResultCard": return <ResultCard {...(p as any)} />;
    case "HandViewer":
      return (
        <div style={{ width: 640, height: 460 }}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <HandViewer {...(p as any)} />
        </div>
      );
    default:
      return null;
  }
}

// ── the Canvas component ──────────────────────────────────────────────────────
export interface CanvasProps {
  slots: CanvasSlot[];
  layout: CanvasLayout;
  cols: number;
  gap: number;
  labels: boolean;
  hideInactive: boolean;
  hands: Record<Seat, HandExposure>;
  ctx: VizContext;
  /** min-height of the canvas box (reserves felt for an empty view). */
  minHeight: number;
  /** "width" fills width and scales down only; "box" fits inside a fixed box (thumbnails). */
  fit?: "width" | "box";
  /** Selection + click-to-select are only wired when editing chrome is shown. */
  selected?: number;
  onSelect?: (index: number) => void;
}

export function Canvas({
  slots,
  layout,
  cols,
  gap,
  labels,
  hideInactive,
  hands,
  ctx,
  minHeight,
  fit = "width",
  selected = -1,
  onSelect,
}: Readonly<CanvasProps>) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    // Guard every setState with an equality check: this effect settles rather
    // than looping (measure → setState → re-render → measure) because a scale it
    // has already reached produces no state change. A transform scale does not
    // change offsetWidth/Height, so observing `inner` only fires on real content
    // resizes, never on our own rescale.
    const measure = () => {
      const nw = inner.offsetWidth || 1;
      const nh = inner.offsetHeight || 1;
      const availW = outer.clientWidth || nw;
      const availH = (fit === "box" ? outer.clientHeight : minHeight) || nh;
      let s = Math.min(availW / nw, 1);
      if (fit === "box") s = Math.min(s, availH / nh);
      if (!Number.isFinite(s) || s <= 0) s = 1;
      setScale((prev) => (Math.abs(prev - s) > 0.002 ? s : prev));
      setNatural((prev) => (prev.w === nw && prev.h === nh ? prev : { w: nw, h: nh }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [fit, minHeight, layout, cols, gap]);

  const gridStyle: React.CSSProperties =
    layout === "grid"
      ? { display: "grid", gridTemplateColumns: `repeat(${cols}, max-content)`, gap, alignItems: "start", justifyItems: "start" }
      : layout === "row"
        ? { display: "flex", flexDirection: "row", flexWrap: "nowrap", gap, alignItems: "flex-start" }
        : { display: "flex", flexDirection: "column", gap, alignItems: "flex-start" };

  // Reserve the scaled height so the felt box grows with the content.
  const reservedH = fit === "box" ? "100%" : Math.max(minHeight, Math.round(natural.h * scale));

  return (
    <div
      ref={outerRef}
      data-testid="canvas"
      style={{
        position: "relative",
        width: "100%",
        height: reservedH,
        minHeight,
        overflow: "hidden",
        background: ctx.skin.feltFlat,
        borderRadius: 8,
      }}
    >
      <div
        ref={innerRef}
        style={{
          position: "absolute",
          top: fit === "box" ? "50%" : 0,
          left: fit === "box" ? "50%" : 0,
          transform: fit === "box" ? `translate(-50%,-50%) scale(${scale})` : `scale(${scale})`,
          transformOrigin: fit === "box" ? "center center" : "top left",
          padding: fit === "box" ? 8 : 16,
          ...gridStyle,
        }}
      >
        {slots.map((slot, i) => {
          if (hideInactive && !slotActive(ctx.state, slot)) return null;
          const exposure = slot.seat ? (hands[slot.seat] ?? "auto") : "auto";
          const isSel = i === selected;
          return (
            <div
              key={i}
              data-testid="canvas-cell"
              data-component={slot.component}
              onClick={onSelect ? () => onSelect(i) : undefined}
              style={{
                gridColumn: layout === "grid" && slot.span ? `span ${Math.min(slot.span, cols)}` : undefined,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: onSelect ? 4 : 0,
                borderRadius: 6,
                outline: isSel ? "2px solid #12909f" : "none",
                cursor: onSelect ? "pointer" : "default",
              }}
            >
              {labels && (
                <span style={{ fontSize: 10, color: "#cbd6da", fontFamily: "ui-monospace, monospace" }}>
                  {(PALETTE_LABEL[slot.component] ?? slot.component) + (slot.seat ? ` ${slot.seat}` : "")}
                </span>
              )}
              {renderSlot(ctx, slot, exposure)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
