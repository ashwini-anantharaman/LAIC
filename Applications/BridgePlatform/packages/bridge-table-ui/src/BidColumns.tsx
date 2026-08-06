"use client";

// BidColumns — the suit-column bidding pad (table-skins design). Where the
// classic BidBox is a level-then-strain two-step, this lays all 35 contract
// bids out at once: five strain columns (N,S,H,D,C — NT first) each stacking
// levels 1..7 top→bottom, with a PASS / X / XX row beneath and a Confirm /
// Cancel row on top while a call is staged.
//
// It reuses PlayTable's exact bid plumbing: a legal cell click calls onStage
// (the host's stageCall — which either fires onCall or parks the call in
// `pending` when confirmBids is on); onConfirm / onCancel resolve the staged
// call. Illegal cells sit at opacity .3 and are inert; a pending call freezes
// the whole pad. One geometry knob — `cell` — drives every dimension.

import type { CSSProperties } from "react";
import { STRAIN_TINT, type Strain } from "@bridge/table-config";

/** NT leads, then the four suits in ranking order — the design's column order. */
const COLUMN_ORDER: readonly Strain[] = ["N", "S", "H", "D", "C"];
const GLYPH: Record<Strain, string> = { N: "NT", S: "♠", H: "♥", D: "♦", C: "♣" };
const LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;

const callText = (c: string) =>
  c === "P" ? "Pass" : c === "X" ? "X" : c === "XX" ? "XX" : `${c[0]}${GLYPH[(c[1] ?? "N") as Strain] ?? ""}`;

export interface BidColumnsProps {
  /** The single geometry knob (design default 46). */
  cell?: number;
  /** Rendered-touch floor for cell HEIGHT on scaled tiers (touchH pattern). */
  minCellH?: number;
  /** Skin corner radius (px) for the column boxes and PASS/X/XX row. */
  radius?: number;
  /** Calls legal right now — the same list PlayTable feeds its BidBox. */
  legalCalls: readonly string[];
  /** True when the human is on turn and no call is staged (boxLive). */
  live: boolean;
  /** The staged-but-unconfirmed call, or null. Freezes the pad while set. */
  pending: string | null;
  /** Fire the host's stageCall — stages or posts exactly as BidBox does. */
  onStage: (call: string) => void;
  /** Resolve a staged call (post it). */
  onConfirm: () => void;
  /** Discard a staged call. */
  onCancel: () => void;
}

export function BidColumns({
  cell = 46,
  minCellH = 0,
  radius = 5,
  legalCalls,
  live,
  pending,
  onStage,
  onConfirm,
  onCancel,
}: Readonly<BidColumnsProps>) {
  const gap = Math.round(cell * 0.13);
  const colPad = Math.round(cell * 0.11);
  const cellW = cell;
  const cellH = Math.max(Math.round(cell * 0.92), minCellH);
  const passW = Math.round(cell * 3.4);
  const levelFont = Math.round(cell * 0.62);
  const glyphFont = Math.round(cell * 0.42);
  const legal = new Set(legalCalls);
  const inert = pending != null;

  const cellBtn = (strain: Strain, level: number) => {
    const call = `${level}${strain}`;
    const tint = STRAIN_TINT[strain];
    const isLegal = legal.has(call);
    const ok = live && !inert && isLegal;
    return (
      <button
        key={call}
        type="button"
        disabled={inert}
        onClick={ok ? () => onStage(call) : undefined}
        aria-label={`${level}${strain === "N" ? "NT" : strain}`}
        style={{
          display: "flex", alignItems: "baseline", justifyContent: "center", gap: 1,
          width: cellW, height: cellH, padding: 0, background: "transparent", border: 0,
          color: tint.ink, lineHeight: 1, cursor: ok ? "pointer" : "default",
          opacity: isLegal ? 1 : 0.3,
        }}
      >
        <span style={{ fontSize: levelFont, fontWeight: 700, lineHeight: 1 }}>{level}</span>
        <span style={{ fontSize: glyphFont, fontWeight: 700, lineHeight: 1 }}>{GLYPH[strain]}</span>
      </button>
    );
  };

  const bottomBtn = (call: string, label: string, w: number, bg: string, border: string, extra?: CSSProperties) => {
    const isLegal = legal.has(call);
    const ok = live && !inert && isLegal;
    return (
      <button
        key={call}
        type="button"
        disabled={inert}
        onClick={ok ? () => onStage(call) : undefined}
        aria-label={call === "P" ? "Pass" : call === "X" ? "Double" : "Redouble"}
        style={{
          width: w, height: cellH, background: bg, border: `2px solid ${border}`, borderRadius: radius,
          color: "#fff", fontWeight: 700, fontSize: levelFont, lineHeight: 1,
          cursor: ok ? "pointer" : "default", opacity: isLegal ? 1 : 0.3, ...extra,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap }}>
      {pending != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0" }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#12281f" }}>{callText(pending)}</span>
          <button
            type="button"
            onClick={onConfirm}
            style={{ height: 38, padding: "0 16px", border: "1px solid #0c4b0b", borderRadius: radius, background: "#116710", color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer" }}
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{ height: 38, padding: "0 16px", border: "1px solid #5e1c1c", borderRadius: radius, background: "#8a3030", color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap }}>
        {COLUMN_ORDER.map((strain) => (
          <div
            key={strain}
            style={{
              display: "flex", flexDirection: "column", gap, padding: colPad,
              background: STRAIN_TINT[strain].bg, border: `2px solid ${STRAIN_TINT[strain].edge}`,
              borderRadius: radius,
            }}
          >
            {LEVELS.map((l) => cellBtn(strain, l))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap }}>
        {bottomBtn("P", "Pass", passW, "#116710", "#0c4b0b", { letterSpacing: ".04em" })}
        {bottomBtn("X", "X", cellW, "#7a5b3a", "#5e4227")}
        {bottomBtn("XX", "XX", cellW, "#2b6b73", "#1c4d53")}
      </div>
    </div>
  );
}
