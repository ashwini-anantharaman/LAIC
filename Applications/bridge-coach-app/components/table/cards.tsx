// Playing-card primitives for the native felt (Part II Phase A).
//
// Plain Views + Text — a card here is a rounded rect with a corner index and
// a suit glyph (the app's Learn cards proved the pattern); no bitmaps, no
// Skia. Sizes come from the caller so one primitive serves the small
// opponents' rows, the trick area's mid-size and the south hand's big fan.

import { StyleSheet, Text, View } from "react-native";

import { Brand, Fonts } from "../../constants/theme";
import type { Card } from "../../lib/vendor/table-kernel/table-kernel";

export const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "10" };

export function rankText(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

export function suitColor(suit: string): string {
  return suit === "H" || suit === "D" ? "#c0392b" : "#17211d";
}

/** One face-up card. `w` drives every internal size. */
export function CardFace({ card, w }: { card: Card; w: number }) {
  const h = w * 1.45;
  return (
    <View style={[styles.face, { width: w, height: h, borderRadius: w * 0.14 }]}>
      <Text
        style={[
          styles.faceRank,
          { fontSize: w * 0.42, lineHeight: w * 0.48, color: suitColor(card.suit) },
        ]}
      >
        {rankText(card.rank)}
      </Text>
      <Text style={[styles.faceSuit, { fontSize: w * 0.4, color: suitColor(card.suit) }]}>
        {SUIT_GLYPH[card.suit]}
      </Text>
    </View>
  );
}

/** One face-down card — the deck's maroon back. */
export function CardBack({ w }: { w: number }) {
  const h = w * 1.45;
  return (
    <View style={[styles.back, { width: w, height: h, borderRadius: w * 0.14 }]}>
      <View style={[styles.backInner, { borderRadius: w * 0.08 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    backgroundColor: "#fffefa",
    borderWidth: 1,
    borderColor: "#d8d2c2",
    paddingLeft: 3,
    paddingTop: 1,
  },
  faceRank: { fontFamily: Fonts.bodySemibold },
  faceSuit: { position: "absolute", right: 3, bottom: 2 },
  back: {
    backgroundColor: Brand.maroon,
    borderWidth: 1,
    borderColor: Brand.cardShadow,
    padding: 3,
  },
  backInner: { flex: 1, borderWidth: 1, borderColor: "rgba(255,244,215,0.35)" },
});
