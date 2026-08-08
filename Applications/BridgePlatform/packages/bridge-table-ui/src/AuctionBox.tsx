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

  return (
    <div style={{ width: m.width, height: m.height, maxHeight: m.height === "auto" ? 340 : undefined, background: bg, borderRadius: m.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }}>
        {heads.map((head) => (
          <span key={head.seat} style={{ padding: "2px 0", fontSize: m.headFont, fontWeight: 700, lineHeight: 1.1, background: head.vul ? "#cc1111" : head.isDealer ? DEALER_TINT : "#fff", color: head.vul ? "#fff" : "#000" }}>
            {head.seat}
            {head.isDealer ? " •" : ""}
          </span>
        ))}
      </div>
      <div ref={rowsRef} data-testid="auction-rows" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "3px 5px", display: "flex", flexDirection: "column", gap: 3 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, textAlign: "center" }}>
            {[0, 1, 2, 3].map((j) => {
              const e = row[j];
              return (
                <span key={j} style={{ borderRadius: 3, padding: "2px 0", minHeight: m.cellMinH ?? 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: m.cellFont, lineHeight: 1.15, background: e ? (j === dealerCol ? DEALER_TINT : GREY) : "transparent", color: e ? callColor(e.call) : "#000" }}>
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
