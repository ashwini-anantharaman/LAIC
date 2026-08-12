"use client";

// SeatHand — a face-up hand as a fanned card ROW or an arced FAN, or, when
// hidden, a strip of face-down backs. Lifted verbatim from PlayTable's
// cardRow / fanHand / backs closures; the host shapes WHICH cards are here and
// WHICH are playable, this leaf only draws them.

import type { Card } from "@bridge/events";
import { useLayoutEffect, useRef } from "react";
import { RED, GLYPH, DISPLAY, isRed, rankText } from "./tokens";
import { LIFT, TableMotion } from "./motion";

export interface SeatHandMetrics {
  w: number;
  h: number;
  rank: number;
  glyph: number;
  inset: number;
  /**
   * Row layout: how far each card slides UNDER the one before it. The default 1
   * is the hairline the wide tier has always drawn; the phone passes a real
   * overlap so thirteen cards read as one tight held hand instead of a strip
   * that spans the whole stage. The rank+pip index lives at the card's LEFT
   * edge, so the visible sliver still says which card it is.
   */
  overlap?: number;
  /** Font weight for the rank AND the pip. Default 700/400 (the authored look). */
  weight?: number;
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

/**
 * Slide the cards that STAY when one leaves, instead of teleporting them.
 *
 * The row is centred in the stage — measured on a live board: eleven cards at
 * x59..331 inside a 366 stage, gaps of 47 and 47. So playing a card does not
 * merely delete it; the row narrows by one pitch and RE-CENTRES, and every
 * remaining card jumps sideways by half a pitch in the same frame. That jump is
 * the jitter, and no amount of easing on the played card hides it.
 *
 * Standard FLIP, with two details this table forces:
 *
 *  · MEASURE IN VIEWPORT SPACE. A card's offsetLeft inside the row does not
 *    change at all — the cards keep their places and the ROW moves — so the
 *    only frame that sees the shift is the page's.
 *  · UNPROJECT THE STAGE SCALE. The whole stage is transform:scale(~0.5) on a
 *    phone, so a 12px shift on screen is 24px in the element's own coordinates.
 *    The ratio is read off the element itself (rect width vs offsetWidth), so
 *    it stays right at any tier without being told the scale.
 *
 * The offset rides a CSS variable rather than the inline `transform`, because
 * the playable lift already owns that property; composing them in one
 * declaration lets both move at once without either clobbering the other.
 */
function useHandSlide(keys: readonly string[]) {
  const nodes = useRef(new Map<string, HTMLButtonElement | null>());
  const lastX = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const key of keys) {
      const el = nodes.current.get(key);
      if (!el) continue;
      const now = el.getBoundingClientRect().left;
      const was = lastX.current.get(key);
      lastX.current.set(key, now);
      if (was == null || Math.abs(was - now) < 0.5 || reduce) continue;
      // rect/offset is the stage's cumulative scale; guard the degenerate case.
      const k = el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 1;
      el.style.setProperty("--btu-dx", `${(was - now) / (k || 1)}px`);
      el.style.transition = "none";
      void el.offsetWidth; // commit the start frame before re-enabling motion
      el.style.transition = "";
      el.style.setProperty("--btu-dx", "0px");
    }
    // Cards that left take their measurement with them.
    for (const key of [...lastX.current.keys()]) {
      if (!keys.includes(key)) {
        lastX.current.delete(key);
        nodes.current.delete(key);
      }
    }
  });
  return nodes;
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

  const rankWeight = m.weight ?? 700;
  const glyphWeight = m.weight ?? 400;
  const keys = hand.map((c) => `${c.suit}${c.rank}`);
  const nodes = useHandSlide(keys);

  if (layout === "row") {
    return (
      <div style={{ display: "flex", boxShadow: "0 2px 5px rgba(0,0,0,.35)" }}>
        <TableMotion />
        {hand.map((card, i) => {
          const on = isPlayable ? isPlayable(card) : false;
          return (
            <button
              key={`${card.suit}${card.rank}`}
              ref={(el) => { nodes.current.set(`${card.suit}${card.rank}`, el); }}
              type="button"
              onClick={on ? () => onPlay?.(card) : undefined}
              aria-label={`Play ${rankText(card.rank)}${GLYPH[card.suit]}`}
              className={LIFT}
              style={{
                position: "relative", display: "block", width: m.w, height: m.h, flex: "none",
                background: "#fff", border: "1px solid #6b6b6b",
                borderRadius: i === 0 ? "3px 0 0 3px" : "0 3px 3px 0",
                marginLeft: i === 0 ? 0 : -(m.overlap ?? 1), padding: 0,
                cursor: on ? "pointer" : "default",
                // The re-centre offset and the playable lift, composed: the FLIP
                // owns --btu-dx and React owns the lift, so neither overwrites
                // the other mid-slide.
                transform: `translateX(var(--btu-dx, 0px)) translateY(${on ? -6 : 0}px)`,
                // A lifted card rises ABOVE its neighbours: overlapped cards
                // paint in hand order, so without this the next card clips the
                // one the thumb is about to press.
                zIndex: on ? 2 : 1,
              }}
            >
              <span style={{ position: "absolute", left: m.inset, top: m.inset > 3 ? m.inset : 1, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 0.95, color: isRed(card.suit) ? RED : "#000" }}>
                <span style={{ fontSize: m.rank, fontWeight: rankWeight }}>{rankText(card.rank)}</span>
                <span style={{ fontSize: m.glyph, fontWeight: glyphWeight }}>{GLYPH[card.suit]}</span>
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
      <TableMotion />
      {hand.map((card, i) => {
        const on = isPlayable ? isPlayable(card) : false;
        return (
          <button
            key={`${card.suit}${card.rank}`}
            type="button"
            onClick={on ? () => onPlay?.(card) : undefined}
            aria-label={`Play ${rankText(card.rank)}${GLYPH[card.suit]}`}
            className={LIFT}
            style={{
              position: "absolute", left: "50%", top: fanTop, width: cw, height: ch, padding: 0,
              background: "#fff", border: "1px solid #6b6b6b", borderRadius: 4,
              boxShadow: "-2px 1px 4px rgba(0,0,0,.28)",
              transform: `translateX(-50%) rotate(${angleAt(i)}deg)${on ? " translateY(-14px)" : ""}`,
              transformOrigin: `50% ${radius}px`,
              zIndex: on ? 2 : 1,
              cursor: on ? "pointer" : "default",
            }}
          >
            <span style={{ position: "absolute", left: m.inset, top: 2, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 0.95, color: isRed(card.suit) ? RED : "#000" }}>
              <span style={{ fontSize: rankF, fontWeight: rankWeight }}>{rankText(card.rank)}</span>
              <span style={{ fontSize: glyphF, fontWeight: glyphWeight }}>{GLYPH[card.suit]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
