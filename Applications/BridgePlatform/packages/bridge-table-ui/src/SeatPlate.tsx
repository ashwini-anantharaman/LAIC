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
  /**
   * This seat is on turn — the plate LIGHTS rather than an arrow pointing at it
   * (owner, 2026-08-13). A plate is already the thing that says whose hand this
   * is, so lighting it says "and it is their go" in the same object, instead of
   * adding a second mark to read. Costs no space, which matters in a band that
   * is already tight.
   */
  onTurn?: boolean;
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
  onTurn = false,
  metrics = {},
}: Readonly<SeatPlateProps>) {
  const h = metrics.height ?? 22;
  const badge = metrics.badge ?? 20;
  const font = metrics.font ?? 15;
  const tagFont = metrics.tagFont ?? 11;
  const weight = metrics.weight ?? 400;
  return (
    <div
      data-testid="seat-plate"
      data-seat={seat}
      data-on-turn={onTurn ? "" : undefined}
      style={{
        display: "flex", alignItems: "stretch", gap: 5, width, height: h,
        padding: "0 3px 0 0", background: bg,
        // The dealer ring still owns the border, so a dealer on turn keeps its
        // ring and takes the glow — the two marks never compete for the edge.
        boxShadow: onTurn
          ? "0 0 0 2px rgba(255,226,140,.95), 0 0 10px 2px rgba(255,214,92,.55)"
          : "0 1px 2px rgba(0,0,0,.45)",
        border: `2px solid ${isDealer ? DEALER_RING : "transparent"}`,
        boxSizing: "border-box", overflow: "hidden",
        transition: "box-shadow 200ms ease",
      }}
    >
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
