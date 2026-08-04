"use client";

// SeatDiagram — a hand as a suit-per-line panel (the E/W wide columns and every
// seat in the stacked-narrow tier). Lifted verbatim from PlayTable's suitPanel()
// closure. The host resolves the panel background (bare mode), whether this seat
// is the touch-active one, and which cards are playable; this leaf draws them.
//
// The callsRow above and the SeatPlate below stay in the host — its per-tier
// wrappers interleave them — so this component is just the panel.

import type { Card } from "@bridge/events";
import { RED, GLYPH, DISPLAY, isRed, rankText } from "./tokens";

export interface SeatDiagramProps {
  cards: readonly Card[];
  /** Bare-mode background (panelBgFor); ignored unless `bare`. */
  panelBg: string;
  width: number | string;
  suitW?: number;
  font?: number;
  pad?: string;
  /** Sit flat on the felt (no card, panel-tinted) vs. the white boxed panel. */
  bare?: boolean;
  /** This seat is the big-touch one (already gated on turn by the host). */
  touch?: boolean;
  isPlayable?: (card: Card) => boolean;
  onPlay?: (card: Card) => void;
}

export function SeatDiagram({
  cards,
  panelBg,
  width,
  suitW,
  font: fontProp,
  pad,
  bare,
  touch,
  isPlayable,
  onPlay,
}: Readonly<SeatDiagramProps>) {
  const font = fontProp ?? 19;
  const touchy = !!touch;
  return (
    <div style={{ width, background: bare ? panelBg : "#fff", border: bare ? 0 : "1px solid #8a8a8a", borderRadius: bare ? 0 : 3, padding: pad ?? "4px 8px", boxShadow: "0 2px 5px rgba(0,0,0,.4)", boxSizing: "border-box" }}>
      {DISPLAY.map((su) => {
        const suitCards = cards.filter((x) => x.suit === su).sort((a, b) => b.rank - a.rank);
        return (
          <div key={su} style={{ display: "flex", alignItems: "center", gap: 5, lineHeight: 1.3, color: isRed(su) ? RED : "#000" }}>
            <span style={{ flex: "none", width: suitW ?? 16, fontSize: font }}>{GLYPH[su]}</span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: touchy ? "0 4px" : "0 5px", fontSize: font }}>
              {suitCards.length === 0 ? (
                <span>—</span>
              ) : (
                suitCards.map((card) => {
                  const on = isPlayable ? isPlayable(card) : false;
                  return (
                    <button
                      key={card.rank}
                      type="button"
                      onClick={on ? () => onPlay?.(card) : undefined}
                      aria-label={`Play ${rankText(card.rank)}${GLYPH[su]}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: touchy ? 84 : 0, minHeight: touchy ? 78 : 0, background: on ? "#d9f2d9" : "transparent", border: 0, borderRadius: touchy ? 6 : 0, padding: touchy ? "0 4px" : "0 1px", fontSize: font, fontWeight: on ? 700 : 400, color: "inherit", cursor: on ? "pointer" : "default" }}
                    >
                      {rankText(card.rank)}
                    </button>
                  );
                })
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
