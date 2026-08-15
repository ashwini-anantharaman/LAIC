// A tappable playing card — the Play tab's grid (Figma 870:752).
//
// Two cards, as everywhere else in the deck: a dark one rotated behind, and the
// suit-coloured face on top. Here the card behind is ROTATED rather than merely
// offset, so the pair reads as a card lifted off a crooked stack.
//
// The face carries a corner glyph top-left and the same glyph rotated 180° in the
// bottom-right — a real card's mirrored index. Figma exports the two corners as
// separate nodes, and the two are byte-identical assets (the "picture frame" in
// the bottom-right of From Coach is just the envelope upside down), so one asset
// is reused and turned.
//
// SIZED DOWN from 627:4285: the face was 151.91 x 218.43 and is now 119.355 x
// 171.617 — a hair over three quarters — while the LABEL grew, 17 to 18.4. Small
// card, big name: what a card says matters more than how much room it takes, and
// five of them have to fit.
//
// GLYPHS ARE NOT SQUARE and are no longer drawn as though they were. Every corner
// used to be rendered into one 22x22 box, which stretched the envelope (22.25 x
// 17.8) and the table (21.3 x 10.2) to fill it. Each now carries its own box and
// its own inset, straight from the frame — which is also why they no longer sit
// on one grid: a wide, short glyph is optically centred lower and further left
// than a tall one.
//
// Geometry is in design units and scaled by the caller, like every other screen.

import { Pressable, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import {
  ICON_CARD_ENVELOPE,
  ICON_CARD_HISTORY,
  ICON_CARD_PLAY,
  ICON_CARD_PLUS,
  ICON_CARD_SPARKLE,
  ICON_CARD_TABLE,
} from "../constants/brand-vectors";
import { Brand, Fonts } from "../constants/theme";

export const ACTION_CARD = {
  width: 119.355,
  height: 171.617,
  radius: 9.887,
  /** How far the card behind is rotated, in degrees. */
  tilt: 5.62,
  /** Column pitch and row pitch, from the design's card origins (150.05 and
   *  193.6 between face left/top edges). */
  columnGap: 30.7,
  rowGap: 22,
  /** The label's own inset. Nearly the full width: "From Coach" sits on one line
   *  in the frame and only fits because the type runs close to the edges. */
  labelPadX: 8,
  labelSize: 18.4,
} as const;

/**
 * A corner glyph: the art, its natural box, and where it sits in the card.
 *
 * `left`/`top` are the top-left corner's insets; the bottom-right copy uses the
 * same pair mirrored, so a glyph's two corners are always the same distance from
 * their own edges.
 */
export type CardIcon = { xml: string; w: number; h: number; left: number; top: number };

export const CARD_ICONS = {
  plus: { xml: ICON_CARD_PLUS, w: 15.714, h: 15.714, left: 10.9, top: 11.07 },
  play: { xml: ICON_CARD_PLAY, w: 14.143, h: 16.5, left: 12.01, top: 10.93 },
  table: { xml: ICON_CARD_TABLE, w: 21.314, h: 10.214, left: 6.97, top: 15.79 },
  envelope: { xml: ICON_CARD_ENVELOPE, w: 17.482, h: 13.985, left: 12.8, top: 13.28 },
  sparkle: { xml: ICON_CARD_SPARKLE, w: 16.98, h: 16.946, left: 7.53, top: 11.57 },
  // No frame reference: 870:752 draws My Plays with From Coach's envelope, which
  // is the same card component pasted twice rather than a decision. History keeps
  // the two maroon cards apart, at the plus's box and inset since it is square too.
  history: { xml: ICON_CARD_HISTORY, w: 17.286, h: 17.286, left: 10.9, top: 11.07 },
} as const satisfies Record<string, CardIcon>;

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
  icon: CardIcon;
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

  const showBadge = badge != null && badge > 0;
  const glyph = (
    <SvgXml xml={icon.xml} width={icon.w * s} height={icon.h * s} />
  );

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
        <View style={{ position: "absolute", left: icon.left * s, top: icon.top * s }}>
          {glyph}
        </View>

        <Text
          style={[
            styles.label,
            {
              fontSize: ACTION_CARD.labelSize * s,
              lineHeight: ACTION_CARD.labelSize * 1.25 * s,
              paddingHorizontal: ACTION_CARD.labelPadX * s,
            },
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>

        <View
          style={{
            position: "absolute",
            right: icon.left * s,
            bottom: icon.top * s,
            transform: [{ rotate: "180deg" }],
          }}
        >
          {glyph}
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
            right: -7 * s,
            top: -7 * s,
            minWidth: 23 * s,
            height: 23 * s,
            borderRadius: 11.5 * s,
            paddingHorizontal: 6 * s,
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
              fontSize: 12.5 * s,
              lineHeight: 16 * s,
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
  },
  pressed: { opacity: 0.85 },
});
