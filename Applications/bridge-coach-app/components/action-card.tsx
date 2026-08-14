// A big tappable playing card — the Play tab's 2x2 grid (Figma 627:4285).
//
// Two cards, as everywhere else in the deck: a dark one rotated behind, and the
// suit-coloured face on top. Here the card behind is ROTATED rather than merely
// offset, so the pair reads as a card lifted off a crooked stack.
//
// The face carries a corner icon top-left and the same icon rotated 180° in the
// bottom-right — a real card's mirrored index. Figma exports the two corners as
// separate nodes, but they are the same glyph (their paths differ only by
// float rounding, e.g. 6.16204 vs 6.16203), so one asset is reused.
//
// Geometry is in design units and scaled by the caller, like every other screen.

import { Pressable, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { Brand, Fonts } from "../constants/theme";

export const ACTION_CARD = {
  width: 151.91,
  height: 218.43,
  radius: 12.58,
  /** How far the card behind is rotated, in degrees. */
  tilt: 5.62,
  /** Corner icon box, and its inset from the card's edges. */
  icon: 22,
  iconInset: 12,
  /** Column pitch and row pitch, from the design's card origins. */
  columnGap: 20,
  rowGap: 36,
} as const;

/** The darker card that sits behind each suit — maroon behind maroon, green behind green. */
const BEHIND: Record<string, string> = {
  [Brand.maroon]: "#220a0b",
  [Brand.green]: "#06140d",
};

export function ActionCard({
  label,
  icon,
  suit,
  onPress,
  scale: s,
  badge,
}: {
  label: string;
  icon: string;
  /** Brand.maroon or Brand.green. */
  suit: string;
  onPress: () => void;
  scale: number;
  /** A notification-style count riding the card's top-right corner — how
   *  many of the thing behind this card are waiting. 0 or omitted draws
   *  nothing. */
  badge?: number;
}) {
  const w = ACTION_CARD.width * s;
  const h = ACTION_CARD.height * s;
  const r = ACTION_CARD.radius * s;
  const iconSize = ACTION_CARD.icon * s;
  const inset = ACTION_CARD.iconInset * s;

  const showBadge = badge != null && badge > 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={showBadge ? `${label} (${badge} waiting)` : label}
      // The tilted card behind reaches outside the face, so the touch target is
      // sized to the face and the backing card is allowed to overflow it.
      style={({ pressed }) => [{ width: w, height: h }, pressed && styles.pressed]}
    >
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: w,
          height: h,
          borderRadius: r,
          backgroundColor: BEHIND[suit] ?? "#220a0b",
          transform: [{ rotate: `${ACTION_CARD.tilt}deg` }],
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: w,
          height: h,
          borderRadius: r,
          backgroundColor: suit,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={{ position: "absolute", left: inset, top: inset }}>
          <SvgXml xml={icon} width={iconSize} height={iconSize} />
        </View>

        <Text style={[styles.label, { fontSize: 17 * s }]} numberOfLines={2}>
          {label}
        </Text>

        <View
          style={{
            position: "absolute",
            right: inset,
            bottom: inset,
            transform: [{ rotate: "180deg" }],
          }}
        >
          <SvgXml xml={icon} width={iconSize} height={iconSize} />
        </View>
      </View>

      {/* The count, as a notification badge overhanging the top-right corner
          — a cream chip so it reads on both suits, edged in the suit's own
          dark backing so it belongs to the deck. Drawn AFTER the face so it
          sits on top; the grid doesn't clip, so the overhang survives. */}
      {showBadge && (
        <View
          style={{
            position: "absolute",
            right: -8 * s,
            top: -8 * s,
            minWidth: 27 * s,
            height: 27 * s,
            borderRadius: 13.5 * s,
            paddingHorizontal: 7 * s,
            backgroundColor: Brand.cream,
            borderWidth: Math.max(1, 1.5 * s),
            borderColor: BEHIND[suit] ?? "#220a0b",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: Fonts.displayMedium,
              fontSize: 14 * s,
              lineHeight: 18 * s,
              color: Brand.maroon,
            }}
          >
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: Fonts.displayMedium,
    color: Brand.white,
    textAlign: "center",
    paddingHorizontal: 14,
  },
  pressed: { opacity: 0.85 },
});
