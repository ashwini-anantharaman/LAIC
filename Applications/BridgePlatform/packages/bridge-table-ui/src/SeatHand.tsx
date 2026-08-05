"use client";

// SeatHand — a face-up hand as a fanned card ROW or an arced FAN, or, when
// hidden, a strip of face-down backs. Lifted verbatim from PlayTable's
// cardRow / fanHand / backs closures; the host shapes WHICH cards are here and
// WHICH are playable, this leaf only draws them.

import type { Card } from "@bridge/events";
import { RED, GLYPH, DISPLAY, isRed, rankText } from "./tokens";

export interface SeatHandMetrics {
  w: number;
  h: number;
  rank: number;
  glyph: number;
  inset: number;
}

export interface SeatHandProps {
  /** The seat's cards, in engine order — SeatHand sorts them for display. */
  cards: readonly Card[];
  /** Card box + rank/glyph sizing. For a fan the host passes the resolved bag. */
  metrics: SeatHandMetrics;
  /** Fanned card row, or an arced fan about one pivot. */
  layout: "row" | "fan";
  /** Draw face-down backs instead (a hidden hand). */
  hidden?: boolean;
  /** Fan spread in degrees (tok.fanSpread). */
  fanSpread: number;
  /** Fan pivot radius (tok.fanRadius); 0 derives it from card height. */
  fanRadius: number;
  /** Back-of-card fill (tok.cardBack). */
  backColor: string;
  /** How many backs — defaults to the hand size. */
  backCount?: number;
  /** Back strip card size. */
  backMetrics?: { w: number; h: number };
  /** Is THIS card playable right now (lifts it, arms the click). */
  isPlayable?: (card: Card) => boolean;
  /** Play a card. A null/absent handler leaves a playable card inert. */
  onPlay?: (card: Card) => void;
}

export function SeatHand({
  cards,
  metrics: m,
  layout,
  hidden = false,
  fanSpread,
  fanRadius,
  backColor,
  backCount,
  backMetrics = { w: 14, h: 71 },
  isPlayable,
  onPlay,
}: Readonly<SeatHandProps>) {
  if (hidden) {
    const count = Math.max(1, backCount ?? cards.length);
    return (
      <div style={{ display: "flex", border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} style={{ display: "block", width: backMetrics.w, height: backMetrics.h, background: backColor, borderLeft: i ? "1.5px solid rgba(255,255,255,.92)" : "none" }} />
        ))}
      </div>
    );
  }

  const hand = [...cards].sort(
    (a, b) => DISPLAY.indexOf(a.suit) - DISPLAY.indexOf(b.suit) || b.rank - a.rank,
  );

  if (layout === "row") {
    return (
      <div style={{ display: "flex", boxShadow: "0 2px 5px rgba(0,0,0,.35)" }}>
        {hand.map((card, i) => {
          const on = isPlayable ? isPlayable(card) : false;
          return (
            <button
              key={`${card.suit}${card.rank}`}
              type="button"
              onClick={on ? () => onPlay?.(card) : undefined}
              aria-label={`Play ${rankText(card.rank)}${GLYPH[card.suit]}`}
              style={{
                position: "relative", display: "block", width: m.w, height: m.h, flex: "none",
                background: "#fff", border: "1px solid #6b6b6b",
                borderRadius: i === 0 ? "3px 0 0 3px" : "0 3px 3px 0",
                marginLeft: i === 0 ? 0 : -1, padding: 0,
                cursor: on ? "pointer" : "default",
                transform: on ? "translateY(-6px)" : "none",
                transition: "transform 120ms ease",
              }}
            >
              <span style={{ position: "absolute", left: m.inset, top: m.inset > 3 ? m.inset : 1, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: isRed(card.suit) ? RED : "#000" }}>
                <span style={{ fontSize: m.rank, fontWeight: 700 }}>{rankText(card.rank)}</span>
                <span style={{ fontSize: m.glyph }}>{GLYPH[card.suit]}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // fan
  const n = hand.length;
  const cw = m.w;
  const ch = m.h;
  const spread = fanSpread;
  const radius = fanRadius > 0 ? fanRadius : Math.round(ch * 4.2);
  const angleAt = (i: number) => (n <= 1 ? 0 : -spread / 2 + i * (spread / (n - 1)));
  // Reserved box = union of every rotated card's four corners.
  let xMin = 0, xMax = 0, yMin = 0, yMax = 0;
  for (let i = 0; i < n; i++) {
    const a = (angleAt(i) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (const dx of [-cw / 2, cw / 2]) {
      for (const dy of [-radius, -radius + ch]) {
        const x = dx * cos - dy * sin;
        const y = dx * sin + dy * cos;
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
  }
  const boxW = Math.ceil(Math.max(-xMin, xMax) * 2) + 4;
  const boxH = Math.ceil(yMax - yMin) + 4;
  const fanTop = Math.ceil(-yMin - radius) + 2;
  const rankF = m.rank;
  const glyphF = m.glyph;
  return (
    <div style={{ position: "relative", width: boxW, height: boxH }}>
      {hand.map((card, i) => {
        const on = isPlayable ? isPlayable(card) : false;
        return (
          <button
            key={`${card.suit}${card.rank}`}
            type="button"
            onClick={on ? () => onPlay?.(card) : undefined}
            aria-label={`Play ${rankText(card.rank)}${GLYPH[card.suit]}`}
            style={{
              position: "absolute", left: "50%", top: fanTop, width: cw, height: ch, padding: 0,
              background: "#fff", border: "1px solid #6b6b6b", borderRadius: 4,
              boxShadow: "-2px 1px 4px rgba(0,0,0,.28)",
              transform: `translateX(-50%) rotate(${angleAt(i)}deg)${on ? " translateY(-14px)" : ""}`,
              transformOrigin: `50% ${radius}px`,
              transition: "transform 120ms ease",
              cursor: on ? "pointer" : "default",
            }}
          >
            <span style={{ position: "absolute", left: m.inset, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: isRed(card.suit) ? RED : "#000" }}>
              <span style={{ fontSize: rankF, fontWeight: 700 }}>{rankText(card.rank)}</span>
              <span style={{ fontSize: glyphF }}>{GLYPH[card.suit]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
