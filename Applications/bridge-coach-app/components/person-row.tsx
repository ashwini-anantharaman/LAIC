// One person in a club roster — a green row on a darker green one, offset so the
// pair reads as a stacked card, the same idiom as the leaderboard (Figma
// 630:4982). Avatar, name, and the person's standing on the right.

import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "./avatar";
import { Brand, Fonts } from "../constants/theme";

export const PERSON_ROW = { height: 48, radius: 12, offset: 5, pitch: 70 } as const;

export function PersonRow({
  name,
  standing,
  avatar,
  scale: s,
}: {
  name: string;
  /** "Member" / "Mentor" — shown right-aligned. */
  standing: string;
  /** This person's picture, if they have set one. */
  avatar?: string | null;
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
        {/* On a green row the fallback glyph has to be light, not dark. */}
        <Avatar uri={avatar} width={29 * s} height={28.12 * s} tint={Brand.cream} />
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
