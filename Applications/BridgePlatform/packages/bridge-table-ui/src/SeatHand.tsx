"use client";

// SeatHand — a face-up hand as a fanned card ROW or an arced FAN, or, when
// hidden, a strip of face-down backs. Lifted verbatim from PlayTable's
// cardRow / fanHand / backs closures; the host shapes WHICH cards are here and
// WHICH are playable, this leaf only draws them.

import type { Card, Suit } from "@bridge/events";
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
  /**
   * Draw a gap where one suit ends and the next begins (owner, 2026-08-12).
   *
   * The hand has ALWAYS been sorted by suit — this changes nothing about the
   * order, only whether the seams are visible. Thirteen cards overlapping by
   * `overlap` read as one continuous strip, so finding where the clubs start
   * means reading every pip; a gap the width of the overlap turns the same row
   * into four blocks the eye can count. Off by default so the authored look is
   * unchanged for every caller that does not ask.
   */
  suitGaps?: boolean;
  /**
   * How far a playable card rises, and how far the HELD one goes beyond it
   * (CARD_LIFT_PX). The lift is how the hand says "this one is legal"; how much
   * of it a player wants is taste, so it is a setting rather than a constant.
   * Omitted, the authored 6/16 stands.
   */
  lift?: { playable: number; held: number };
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
  /**
   * Is THIS card lifted and waiting for a second tap (`raise` play mode)? It
   * rises further than a merely-playable card and takes a gold edge, because
   * "playable" and "about to be played" must not look alike — the whole point
   * of the mode is that you can see which card the next tap commits.
   */
  isHeld?: (card: Card) => boolean;
  /**
   * Show ONLY this suit (`suit` play mode). The cards left are drawn at the
   * full width the row can now afford, which is what makes the mode worth
   * having: three big targets instead of thirteen crowded ones.
   */
  only?: Suit | null;
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
  // WHICH CARDS, not how many times React rendered. This effect used to run on
  // every commit, and the table re-renders freely while a slide is in flight —
  // the optimistic board settles, the hand arms, the server's refresh lands. On
  // each of those it re-measured a card that was PART WAY through its slide,
  // took that animated position for the truth, and started a fresh slide from
  // it. Thirteen cards each doing that a few times is the shake (owner,
  // 2026-08-13: "all the cards shake for a split second").
  const sig = keys.join(",");
  useLayoutEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Land any offset still in flight BEFORE measuring, so what we read is
    // where the card actually belongs rather than where it happens to be.
    // One write pass, then one read pass: the reflow is paid once.
    for (const key of keys) {
      const el = nodes.current.get(key);
      if (!el) continue;
      el.style.transition = "none";
      el.style.setProperty("--btu-dx", "0px");
    }
    for (const key of keys) {
      const el = nodes.current.get(key);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const now = r.left;
      const was = lastX.current.get(key);
      lastX.current.set(key, now);
      if (was == null || Math.abs(was - now) < 0.5 || reduce) {
        el.style.transition = "";
        continue;
      }
      // rect/offset is the stage's cumulative scale; guard the degenerate case.
      const k = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
      el.style.setProperty("--btu-dx", `${(was - now) / (k || 1)}px`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
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
  isHeld,
  only = null,
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

  const sorted = [...cards].sort(
    (a, b) => DISPLAY.indexOf(a.suit) - DISPLAY.indexOf(b.suit) || b.rank - a.rank,
  );
  // A narrowed hand shows only the LEGAL cards of one suit, so everything on
  // screen can be played and nothing on it is a dead target.
  const narrowed = only ? sorted.filter((c) => c.suit === only && (isPlayable ? isPlayable(c) : true)) : null;
  const hand = narrowed && narrowed.length ? narrowed : sorted;
  // Room the vacated cards left, spent on the survivors: they stop overlapping
  // and take the pitch a full hand would have used, up to double their width.
  const wide = narrowed && narrowed.length ? Math.min(m.w * 2, Math.floor((m.w + 12 * ((m.w - (m.overlap ?? 1)))) / hand.length)) : null;

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
          const up = on && (isHeld ? isHeld(card) : false);
          return (
            <button
              key={`${card.suit}${card.rank}`}
              ref={(el) => { nodes.current.set(`${card.suit}${card.rank}`, el); }}
              type="button"
              onClick={on ? () => onPlay?.(card) : undefined}
              aria-label={`Play ${rankText(card.rank)}${GLYPH[card.suit]}`}
              aria-pressed={on ? up : undefined}
              data-held={up ? "" : undefined}
              className={LIFT}
              style={{
                position: "relative", display: "block", width: wide ?? m.w, height: m.h, flex: "none",
                background: "#fff",
                border: up ? "2px solid #b8860b" : "1px solid #6b6b6b",
                // With seams every block has a first card, so the left round
                // belongs to any card that opens one.
                borderRadius:
                  i === 0 || (m.suitGaps && card.suit !== hand[i - 1]!.suit) ? "3px" : "0 3px 3px 0",
                // A new suit un-overlaps instead of tucking under its
                // predecessor: the seam is exactly the overlap given back, so
                // the row grows by three gaps and nothing is re-measured.
                marginLeft:
                  i === 0 || wide
                    ? 0
                    : m.suitGaps && card.suit !== hand[i - 1]!.suit
                      ? 0
                      : -(m.overlap ?? 1),
                padding: 0,
                cursor: on ? "pointer" : "default",
                // The re-centre offset and the playable lift, composed: the FLIP
                // owns --btu-dx and React owns the lift, so neither overwrites
                // the other mid-slide.
                // Three heights, not two: flat, playable, and the one card a
                // second tap will commit.
                transform: `translateX(var(--btu-dx, 0px)) translateY(${
                  up ? -(m.lift?.held ?? 16) : on ? -(m.lift?.playable ?? 6) : 0
                }px)`,
                // A lifted card rises ABOVE its neighbours: overlapped cards
                // paint in hand order, so without this the next card clips the
                // one the thumb is about to press.
                zIndex: up ? 3 : on ? 2 : 1,
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
