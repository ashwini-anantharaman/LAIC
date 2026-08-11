"use client";

// AuctionBox — the central auction grid: a four-column head (vulnerable seats
// on red, the dealer tinted and dotted) over dealer-aligned call rows. Lifted
// verbatim from PlayTable's auctionBox() closure. The host shapes the head
// flags, the padded rows and the "you deal" empty line; this leaf draws them.

import type { AuctionCall, Seat } from "@bridge/events";
import { useLayoutEffect, useRef } from "react";
import { DEALER_TINT, GREY, callText, callColor } from "./tokens";

export interface AuctionBoxSizing {
  width: number;
  height: number | "auto" | "100%";
  headFont: number;
  cellFont: number;
  radius?: number;
  cellMinH?: number;
  /**
   * Ceiling for a content-sized (`height: "auto"`) grid. The phone hands it the
   * band's own height: the grid then takes the rows it HAS and leaves the rest
   * as felt, instead of stretching a four-call auction over a wall of empty
   * cells — and it still scrolls, pinned to the newest call, once the auction
   * outgrows the band. Defaults to the authored 340 cap.
   */
  maxH?: number;
  /**
   * RESERVE this many call rows, always. The grid then has ONE height for the
   * whole auction: a two-call auction shows two calls over empty reserved rows,
   * and the ninth row scrolls the oldest off the top (the grid is already
   * pinned to the newest call). Omit for the authored content-sized grid.
   *
   * The reservation is made on the ROWS area, not the box, so the head keeps
   * its natural height and a caller can price the box without knowing the
   * head's font metrics — `auctionRowsBoxH` is that arithmetic, exported so the
   * budget that hands this grid a band and the grid itself never drift.
   */
  rowsVisible?: number;
}

const ROW_GAP = 3;
const ROWS_PAD = 3;

/** Border-box height of a rows area holding exactly `rows` call rows. */
export function auctionRowsBoxH(rows: number, rowH: number): number {
  return rows * rowH + Math.max(0, rows - 1) * ROW_GAP + ROWS_PAD * 2;
}

export interface AuctionHead {
  seat: Seat;
  vul: boolean;
  isDealer: boolean;
}

export interface AuctionBoxProps {
  /** Auction-grid background (tok.auctionBg). */
  bg: string;
  m?: AuctionBoxSizing;
  /** The four column heads, in display order. */
  heads: readonly AuctionHead[];
  /** Dealer-aligned rows of calls (null pads the pre-dealer cells). */
  rows: readonly (AuctionCall | null)[][];
  /** Which column index is the dealer's (tints its filled cells). */
  dealerCol: number;
  /** The "You deal" / "N deals" line, or null once the auction has calls. */
  emptyText?: string | null;
}

export function AuctionBox({
  bg,
  m = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 },
  heads,
  rows,
  dealerCol,
  emptyText = null,
}: Readonly<AuctionBoxProps>) {
  // The band the grid is given is elastic and can sit at its floor, so a long
  // auction outgrows it. It already scrolled; what it did not do was FOLLOW the
  // auction, so the row that overflowed was the newest one — the call you most
  // need — sliced through the middle. Older calls scroll off the top instead.
  const rowsRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = rowsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  // A reserved rows area is a FIXED height that ignores how many calls there
  // are; without one the area flexes into whatever the box has left, which is
  // the content-sized behaviour every other caller still gets. It may still
  // SHRINK (flex 0 1 auto): a band squeezed below the reservation clamps the
  // box, and the rows have to scroll inside what is left rather than be cut off
  // by the box's overflow — the newest call is the one that would go.
  const rowH = m.cellMinH ?? Math.round(m.cellFont * 1.15) + 4;
  const reserved =
    m.rowsVisible != null && m.rowsVisible > 0
      ? { flex: "0 1 auto", height: auctionRowsBoxH(m.rowsVisible, rowH), minHeight: 0, boxSizing: "border-box" as const }
      : { flex: 1, minHeight: 0 };

  return (
    <div style={{ width: m.width, height: m.height, maxHeight: m.maxH ?? (m.height === "auto" ? 340 : undefined), background: bg, borderRadius: m.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }}>
        {heads.map((head) => (
          <span key={head.seat} style={{ padding: "2px 0", fontSize: m.headFont, fontWeight: 700, lineHeight: 1.1, background: head.vul ? "#cc1111" : head.isDealer ? DEALER_TINT : "#fff", color: head.vul ? "#fff" : "#000" }}>
            {head.seat}
            {head.isDealer ? " •" : ""}
          </span>
        ))}
      </div>
      <div ref={rowsRef} data-testid="auction-rows" style={{ ...reserved, overflowY: "auto", padding: `${ROWS_PAD}px 5px`, display: "flex", flexDirection: "column", gap: ROW_GAP }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, textAlign: "center" }}>
            {[0, 1, 2, 3].map((j) => {
              const e = row[j];
              return (
                <span key={j} style={{ borderRadius: 3, padding: "2px 0", minHeight: m.cellMinH ?? 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: m.cellFont, lineHeight: 1.15, background: e ? (j === dealerCol ? DEALER_TINT : GREY) : "transparent", color: e ? callColor(e.call) : "#000" }}>
                  {e ? callText(e.call) : ""}
                </span>
              );
            })}
          </div>
        ))}
        {emptyText != null && (
          <div style={{ textAlign: "center", fontSize: 17, color: "#3c4c4c", paddingTop: 6 }}>
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}
