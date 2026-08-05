// A BirdBridge playing card.
//
// From the Learn design (Figma 476:663): a 146.88x211.2 card, radius 12.17,
// with a second card of #2a0506 offset behind it (+6.77, -5.8) so the pair reads
// as a card sitting on a stack. Suits alternate maroon / green — the deck's red
// and black. Like a real card it carries a corner index in the top-left and the
// SAME index rotated 180° in the bottom-right.
//
// Geometry is in design units and scaled by the caller's factor so a card keeps
// its proportions on any screen width.

import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Brand, Fonts, Type } from "../constants/theme";

export const CARD = {
  width: 146.88,
  height: 211.2,
  radius: 12.17,
  /** How far the card behind is nudged right and up. */
  offsetX: 6.77,
  offsetY: 5.8,
  /** Gap between consecutive cards in a row (design: 161 pitch − 146.88). */
  gap: 14.1,
} as const;

/** Alternating suit colours: even index red, odd index green. */
export function cardSuit(index: number): string {
  return index % 2 === 0 ? Brand.maroon : Brand.green;
}

/**
 * Derive a two-letter corner index from a title, the way the design does:
 * "Trump v. NoTrump" → TN, "Nil Bidding" → NB, "Bridge Fundamentals" → BF.
 * Single-word titles fall back to their first two letters.
 */
export function cornerIndex(title: string): string {
  const words = title
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 || /\p{Lu}/u.test(w));
  if (words.length >= 2) {
    return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
  }
  return (words[0] ?? title).slice(0, 2).toUpperCase();
}

export function PlayingCard({
  title,
  body,
  index,
  scale: s = 1,
  onPress,
  footer,
}: {
  title: string;
  body?: string;
  /** Position in the row — drives the suit colour. */
  index: number;
  scale?: number;
  onPress?: () => void;
  /** Optional extra line under the body (e.g. "10 Chapters"). */
  footer?: ReactNode;
}) {
  const initials = cornerIndex(title);
  const w = CARD.width * s;
  const h = CARD.height * s;
  const r = CARD.radius * s;

  const face = (
    <View style={{ width: w + CARD.offsetX * s, height: h + CARD.offsetY * s }}>
      {/* The card behind, peeking out top-right. */}
      <View
        style={{
          position: "absolute",
          left: CARD.offsetX * s,
          top: 0,
          width: w,
          height: h,
          borderRadius: r,
          backgroundColor: Brand.cardShadow,
        }}
      />
      {/* The face. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          top: CARD.offsetY * s,
          width: w,
          height: h,
          borderRadius: r,
          backgroundColor: cardSuit(index),
          overflow: "hidden",
          paddingHorizontal: 12.6 * s,
          paddingTop: 12.6 * s,
        }}
      >
        <Text style={[styles.index, { fontSize: Type.cardTitle * s }]}>{initials}</Text>

        <Text
          style={[styles.title, { fontSize: Type.cardTitle * s, marginTop: 20 * s }]}
          numberOfLines={2}
        >
          {title}
        </Text>

        {body ? (
          <Text
            style={[styles.body, { fontSize: Type.cardBody * s, marginTop: 10 * s }]}
            numberOfLines={4}
          >
            {body}
          </Text>
        ) : null}

        {footer}

        {/* The mirrored corner index, as on a real card. */}
        <Text
          style={[
            styles.indexFlipped,
            { fontSize: Type.cardTitle * s, right: 12.6 * s, bottom: 10 * s },
          ]}
        >
          {initials}
        </Text>
      </View>
    </View>
  );

  if (!onPress) return face;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {face}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  index: {
    fontFamily: Fonts.displayMedium,
    color: Brand.cream,
  },
  indexFlipped: {
    position: "absolute",
    fontFamily: Fonts.displayMedium,
    color: Brand.cream,
    transform: [{ rotate: "180deg" }],
  },
  title: {
    fontFamily: Fonts.displayMedium,
    color: Brand.white,
  },
  body: {
    fontFamily: Fonts.body,
    color: Brand.white,
    lineHeight: 13,
  },
  pressed: { opacity: 0.85 },
});
