// One person in a club roster: avatar, name, and their standing on the right.
//
// Rows are CONTIGUOUS inside a single green card, divided by a hairline — the same
// shape the Friends list uses. They used to be individually stacked cards (a green
// row offset over a darker one, borrowed from the leaderboard), which reads well for
// a handful of ranked entries but not for a roster: at 70pt of pitch for 48pt of
// content, nearly a third of the screen was the gaps between people, and a club of
// twenty was mostly scrolling. The stacked idiom stays where it belongs, on the
// leaderboard, where the offset means something.

import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "./avatar";
import { Brand, Fonts } from "../constants/theme";

/** `pitch` is what a row COSTS vertically. Contiguous rows make it the height
 *  itself, which keeps the index strip's jump arithmetic exact. */
export const PERSON_ROW = { height: 48, radius: 12, pitch: 48 } as const;

export function PersonRow({
  name,
  standing,
  avatar,
  first,
  scale: s,
}: {
  name: string;
  /** The role this person holds ("Club Mentor"), shown right-aligned. */
  standing: string;
  /** This person's picture, if they have set one. */
  avatar?: string | null;
  /** The first row has no divider above it — the card's own edge is the boundary. */
  first?: boolean;
  scale: number;
}) {
  return (
    <View
      style={[
        styles.row,
        {
          height: PERSON_ROW.height * s,
          paddingHorizontal: 15 * s,
          gap: 22 * s,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      {/* On a green row the fallback glyph has to be light, not dark. */}
      <Avatar uri={avatar} width={29 * s} height={28.12 * s} tint={Brand.cream} />
      <Text style={[styles.name, { fontSize: 14.4 * s }]} numberOfLines={1}>
        {name}
      </Text>
      {/* A role name can be long; it takes what the name leaves rather than
          pushing it off the row. */}
      <Text
        style={[styles.standing, { fontSize: 14.4 * s, maxWidth: 130 * s }]}
        numberOfLines={1}
      >
        {standing}
      </Text>
    </View>
  );
}

/** The card the rows sit in. Clips them, so the first and last take its corners. */
export function PersonList({
  children,
  scale: s,
}: {
  children: React.ReactNode;
  scale: number;
}) {
  return (
    <View style={[styles.card, { borderRadius: PERSON_ROW.radius * s }]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Brand.green, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Brand.green,
    // Cream at low opacity rather than a grey: the divider has to read on green
    // without becoming a line of its own.
    borderTopColor: "rgba(255,244,215,0.22)",
  },
  name: { flex: 1, fontFamily: Fonts.display, color: Brand.white, marginRight: 8 },
  standing: { fontFamily: Fonts.body, color: Brand.white },
});
