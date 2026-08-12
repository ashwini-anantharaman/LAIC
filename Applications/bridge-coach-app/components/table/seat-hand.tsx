// SeatHand — bridge-table-ui/src/SeatHand.tsx ported 1:1 to RN (owner
// direction 2026-08-12: paste and rewire, don't reinterpret). A face-up hand
// as a fanned card ROW or an arced FAN, or, when hidden, a strip of
// face-down backs. The host shapes WHICH cards are here and WHICH are
// playable; this leaf only draws them.
//
// Translation notes (the fixed dictionary, no design decisions):
//   · button → Pressable, span → View/Text;
//   · row border-radius pair "3px 0 0 3px" / "0 3px 3px 0" → per-corner radii;
//   · the fan's `transform-origin: 50% radius px` → translate-rotate-translate
//     (RN's transformOrigin is unreliable on web);
//   · box-shadows → shadow props + elevation at the same offsets.

import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Card } from "../../lib/vendor/table-kernel/table-kernel";
import { DISPLAY, GLYPH, RED, isRed, rankText } from "./table-tokens";

export interface SeatHandMetrics {
  w: number;
  h: number;
  rank: number;
  glyph: number;
  inset: number;
  /** Row layout: how far each card slides UNDER the one before it (default 1). */
  overlap?: number;
  /** Font weight for the rank AND the pip. Default 700/400 (the authored look). */
  weight?: number;
}

export interface SeatHandProps {
  cards: readonly Card[];
  metrics: SeatHandMetrics;
  layout: "row" | "fan";
  hidden?: boolean;
  fanSpread: number;
  fanRadius: number;
  backColor: string;
  backCount?: number;
  backMetrics?: { w: number; h: number };
  isPlayable?: (card: Card) => boolean;
  onPlay?: (card: Card) => void;
}

export const SeatHand = memo(function SeatHand({
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
}: SeatHandProps) {
  if (hidden) {
    const count = Math.max(1, backCount ?? cards.length);
    return (
      <View style={styles.backsFrame}>
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            style={{
              width: backMetrics.w,
              height: backMetrics.h,
              backgroundColor: backColor,
              borderLeftWidth: i ? 1.5 : 0,
              borderLeftColor: "rgba(255,255,255,.92)",
            }}
          />
        ))}
      </View>
    );
  }

  const hand = [...cards].sort(
    (a, b) =>
      DISPLAY.indexOf(a.suit as (typeof DISPLAY)[number]) -
        DISPLAY.indexOf(b.suit as (typeof DISPLAY)[number]) || b.rank - a.rank,
  );

  const rankWeight = m.weight ?? 700;
  const glyphWeight = m.weight ?? 400;
  const index = (card: Card, top: number) => (
    <View style={{ position: "absolute", left: m.inset, top, alignItems: "flex-start" }}>
      <Text
        style={{
          fontSize: m.rank,
          lineHeight: Math.round(m.rank * 0.95),
          fontWeight: String(rankWeight) as "700",
          color: isRed(card.suit) ? RED : "#000",
        }}
      >
        {rankText(card.rank)}
      </Text>
      <Text
        style={{
          fontSize: m.glyph,
          lineHeight: Math.round(m.glyph * 0.95),
          fontWeight: String(glyphWeight) as "400",
          color: isRed(card.suit) ? RED : "#000",
        }}
      >
        {GLYPH[card.suit]}
      </Text>
    </View>
  );

  if (layout === "row") {
    return (
      <View style={styles.rowShadow}>
        {hand.map((card, i) => {
          const on = isPlayable ? isPlayable(card) : false;
          return (
            <Pressable
              key={`${card.suit}${card.rank}`}
              onPress={on ? () => onPlay?.(card) : undefined}
              disabled={!on}
              accessibilityLabel={`Play ${rankText(card.rank)}${GLYPH[card.suit]}`}
              style={{
                width: m.w,
                height: m.h,
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: "#6b6b6b",
                borderTopLeftRadius: i === 0 ? 3 : 0,
                borderBottomLeftRadius: i === 0 ? 3 : 0,
                borderTopRightRadius: i === 0 ? 0 : 3,
                borderBottomRightRadius: i === 0 ? 0 : 3,
                marginLeft: i === 0 ? 0 : -(m.overlap ?? 1),
                transform: on ? [{ translateY: -6 }] : [],
                zIndex: on ? 2 : 1,
              }}
            >
              {index(card, m.inset > 3 ? m.inset : 1)}
            </Pressable>
          );
        })}
      </View>
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
  let xMin = 0,
    xMax = 0,
    yMin = 0,
    yMax = 0;
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
  // Pivot `radius` px below the card's top-centre, from RN's centre origin.
  const pivot = radius - ch / 2;
  return (
    <View style={{ width: boxW, height: boxH }}>
      {hand.map((card, i) => {
        const on = isPlayable ? isPlayable(card) : false;
        return (
          <Pressable
            key={`${card.suit}${card.rank}`}
            onPress={on ? () => onPlay?.(card) : undefined}
            disabled={!on}
            accessibilityLabel={`Play ${rankText(card.rank)}${GLYPH[card.suit]}`}
            style={{
              position: "absolute",
              left: boxW / 2 - cw / 2,
              top: fanTop,
              width: cw,
              height: ch,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: "#6b6b6b",
              borderRadius: 4,
              transform: [
                { translateY: pivot },
                { rotate: `${angleAt(i)}deg` },
                { translateY: -pivot },
                ...(on ? [{ translateY: -14 }] : []),
              ],
              zIndex: on ? 2 : 1,
              shadowColor: "#000",
              shadowOffset: { width: -2, height: 1 },
              shadowOpacity: 0.28,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            {index(card, 2)}
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  backsFrame: {
    flexDirection: "row",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,.92)",
    borderRadius: 3,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  rowShadow: {
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
});
