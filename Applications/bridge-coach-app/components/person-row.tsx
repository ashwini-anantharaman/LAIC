// One person in a club roster — a green row on a darker green one, offset so the
// pair reads as a stacked card, the same idiom as the leaderboard (Figma
// 630:4982). Avatar, name, and the person's standing on the right.

import { StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { tintSvg } from "./svg-tint";
import { ICON_AVATAR } from "../constants/brand-vectors";
import { Brand, Fonts } from "../constants/theme";

export const PERSON_ROW = { height: 48, radius: 12, offset: 5, pitch: 70 } as const;

/** The avatar ships dark for the cream app bar; on a green row it must be light. */
const AVATAR_CREAM = tintSvg(ICON_AVATAR, Brand.cream);

export function PersonRow({
  name,
  standing,
  scale: s,
}: {
  name: string;
  /** "Learner" / "Coach" — shown right-aligned. */
  standing: string;
  scale: number;
}) {
  return (
    <View
      style={{
        height: (PERSON_ROW.height + PERSON_ROW.offset) * s,
        marginBottom: (PERSON_ROW.pitch - PERSON_ROW.height - PERSON_ROW.offset) * s,
      }}
    >
      <View
        style={[
          styles.shadow,
          {
            left: PERSON_ROW.offset * s,
            top: PERSON_ROW.offset * s,
            height: PERSON_ROW.height * s,
            borderRadius: PERSON_ROW.radius * s,
          },
        ]}
      />
      <View
        style={[
          styles.row,
          {
            right: PERSON_ROW.offset * s,
            height: PERSON_ROW.height * s,
            borderRadius: PERSON_ROW.radius * s,
            paddingHorizontal: 15 * s,
            gap: 22 * s,
          },
        ]}
      >
        <SvgXml xml={AVATAR_CREAM} width={29 * s} height={28.12 * s} />
        <Text style={[styles.name, { fontSize: 14.4 * s }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.standing, { fontSize: 14.4 * s }]} numberOfLines={1}>
          {standing}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { position: "absolute", left: 0, right: 0, backgroundColor: Brand.rowShadow },
  row: {
    position: "absolute",
    left: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Brand.green,
  },
  name: { flex: 1, fontFamily: Fonts.display, color: Brand.white },
  standing: { fontFamily: Fonts.body, color: Brand.white },
});
