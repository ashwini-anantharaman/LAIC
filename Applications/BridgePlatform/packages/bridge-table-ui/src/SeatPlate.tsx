"use client";

// SeatPlate — the identity plate under a hand: colour strip, seat badge, name,
// DEALER mark and a right-aligned tag. Lifted verbatim from PlayTable's plate()
// closure; the host decides the plate's background (human gold / acting pale /
// grey) and width (which narrows with a row hand), this leaf only draws it.

import type { Seat } from "@bridge/events";
import { DEALER_RING, SEAT_BADGE } from "./tokens";

export interface SeatPlateMetrics {
  height?: number;
  badge?: number;
  font?: number;
  tagFont?: number;
  /** Name/tag weight. Default 400/400 — the phone tier asks for bold. */
  weight?: number;
}

export interface SeatPlateProps {
  seat: Seat;
  name: string;
  tag?: string;
  /** Identity strip at the plate's left edge. */
  strip?: string;
  /** Resolved plate background (plateBgFor). */
  bg: string;
  width: number | string;
  /** Ring + DEALER mark when this seat dealt. */
  isDealer: boolean;
  metrics?: SeatPlateMetrics;
}

export function SeatPlate({
  seat,
  name,
  tag,
  strip,
  bg,
  width,
  isDealer,
  metrics = {},
}: Readonly<SeatPlateProps>) {
  const h = metrics.height ?? 22;
  const badge = metrics.badge ?? 20;
  const font = metrics.font ?? 15;
  const tagFont = metrics.tagFont ?? 11;
  const weight = metrics.weight ?? 400;
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 5, width, height: h, padding: "0 3px 0 0", background: bg, boxShadow: "0 1px 2px rgba(0,0,0,.45)", border: `2px solid ${isDealer ? DEALER_RING : "transparent"}`, boxSizing: "border-box", overflow: "hidden" }}>
      <span style={{ flex: "none", width: 6, background: strip ?? "transparent" }} />
      <span style={{ flex: "none", width: badge, height: badge, alignSelf: "center", background: SEAT_BADGE, color: "#fff", fontSize: font - 1, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{seat}</span>
      <span style={{ alignSelf: "center", fontSize: font, fontWeight: weight, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      {isDealer && (
        <span style={{ alignSelf: "center", flex: "none", padding: "0 2px", fontSize: tagFont, fontWeight: 700, color: "#7a5a12" }}>DEALER</span>
      )}
      <span style={{ marginLeft: "auto", alignSelf: "center", flex: "none", fontSize: tagFont, fontWeight: weight, color: "#555" }}>{tag ?? ""}</span>
    </div>
  );
}
