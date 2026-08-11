// The challenge tile — a maroon card with a green face and two card glyphs.
//
// One component for both sizes. The Club home's "Latest Challenge" tile
// (155.47) is the Challenges page tile (185.47) scaled by 0.838: every inner
// measurement — face inset, border, glyph size and position, corner radius —
// matches that ratio in the design, so they are all expressed as fractions of
// the tile rather than duplicated per size.

import { Pressable, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { ICON_ACTIVITY_DOC, ICON_CHALLENGE_CARD } from "../constants/brand-vectors";
import { Brand, Fonts } from "../constants/theme";

/** The reference tile the design was measured at. */
export const TILE_REF = 185.469;

/** Every proportion, as a fraction of the tile's side. */
const R = {
  radius: 10.598 / TILE_REF,
  faceInset: 13.523 / TILE_REF,
  faceSize: 158.422 / TILE_REF,
  faceBorder: 1.932 / TILE_REF,
  glyphW: 39.605 / TILE_REF,
  glyphH: 52.807 / TILE_REF,
  glyphA: { x: 45.4 / TILE_REF, y: 36.7 / TILE_REF },
  glyphB: { x: 102.4 / TILE_REF, y: 89.8 / TILE_REF },
  /** The document glyph is ONE centred mark, at its own aspect (42.4 x 53). */
  docW: 50.6 / TILE_REF,
  docH: 63.25 / TILE_REF,
} as const;

export type Challenge = {
  name: string;
  boards: number;
  scoring: string;
  standings: { name: string; mp: number; pct: number }[];
};

/** Placeholder content — the Nexus API has no clubs or challenges yet. */
export const SEED_CHALLENGES: Challenge[] = [
  {
    name: "Challenge 1",
    boards: 8,
    scoring: "MP score",
    standings: [
      { name: "Keith", mp: 41, pct: 74 },
      { name: "Ralph", mp: 37, pct: 66 },
      { name: "Quan", mp: 31, pct: 56 },
      { name: "Ashwini", mp: 30, pct: 55 },
      { name: "Miland", mp: 24, pct: 44 },
      { name: "David", mp: 19, pct: 35 },
    ],
  },
  {
    name: "Challenge 2",
    boards: 12,
    scoring: "IMP score",
    standings: [
      { name: "Ralph", mp: 52, pct: 81 },
      { name: "David", mp: 47, pct: 73 },
      { name: "Keith", mp: 39, pct: 61 },
      { name: "Miland", mp: 33, pct: 52 },
      { name: "Quan", mp: 26, pct: 41 },
    ],
  },
  {
    name: "Challenge 3",
    boards: 6,
    scoring: "MP score",
    standings: [
      { name: "Ashwini", mp: 36, pct: 69 },
      { name: "Quan", mp: 30, pct: 58 },
      { name: "Keith", mp: 22, pct: 42 },
    ],
  },
];

export function ChallengeTile({
  /** The tile's side, already scaled to the screen. */
  size,
  onPress,
  /**
   * Which mark the face carries. "challenge" (the default, so every existing
   * caller is unchanged) is the two offset cards; "document" is the single
   * centred page the Activities carousel uses for non-challenge activities.
   */
  variant = "challenge",
}: {
  size: number;
  onPress?: () => void;
  variant?: "challenge" | "document";
}) {
  const faceInset = size * R.faceInset;
  const faceSize = size * R.faceSize;
  const gw = size * R.glyphW;
  const gh = size * R.glyphH;

  const tile = (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size * R.radius }]}>
      <View
        style={[
          styles.face,
          {
            left: faceInset,
            top: faceInset,
            width: faceSize,
            height: faceSize,
            borderWidth: Math.max(1, size * R.faceBorder),
          },
        ]}
      />
      {variant === "document" ? (
        // One mark, centred on the face rather than offset diagonally.
        <View
          style={{
            position: "absolute",
            left: (size - size * R.docW) / 2,
            top: (size - size * R.docH) / 2,
          }}
        >
          <SvgXml xml={ICON_ACTIVITY_DOC} width={size * R.docW} height={size * R.docH} />
        </View>
      ) : (
        <>
          {/* The two glyphs sit on the TILE, offset diagonally as drawn. */}
          <View style={{ position: "absolute", left: size * R.glyphA.x, top: size * R.glyphA.y }}>
            <SvgXml xml={ICON_CHALLENGE_CARD} width={gw} height={gh} />
          </View>
          <View style={{ position: "absolute", left: size * R.glyphB.x, top: size * R.glyphB.y }}>
            <SvgXml xml={ICON_CHALLENGE_CARD} width={gw} height={gh} />
          </View>
        </>
      )}
    </View>
  );

  if (!onPress) return tile;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => pressed && styles.pressed}
    >
      {tile}
    </Pressable>
  );
}

/** "Challenge 1 • 8 Boards", centred under a tile. */
export function ChallengeCaption({
  challenge,
  width,
  fontSize,
  dot,
  gap,
  paddingTop = 8,
}: {
  challenge: Challenge;
  width: number;
  fontSize: number;
  dot: number;
  gap: number;
  /** Distance from the tile's bottom edge to the caption. */
  paddingTop?: number;
}) {
  return (
    <View style={[styles.caption, { width, gap, paddingTop }]}>
      <Text style={[styles.detail, { fontSize }]} numberOfLines={1}>
        {challenge.name}
      </Text>
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: Brand.ink }} />
      <Text style={[styles.detail, { fontSize }]} numberOfLines={1}>
        {challenge.boards} Boards
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: Brand.maroon, position: "relative" },
  /** The green face is a square inside the maroon tile — no radius, as drawn. */
  face: {
    position: "absolute",
    backgroundColor: Brand.green,
    borderColor: Brand.cream,
  },
  caption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  detail: { fontFamily: Fonts.body, color: Brand.ink },
  pressed: { opacity: 0.85 },
});
