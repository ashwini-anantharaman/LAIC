// My Clubs — the picker shown when someone belongs to more than one (Figma
// 750:5592).
//
// It replaces the Club tab's contents rather than being a screen of its own: the
// tab bar stays, so a person can go and play a board without choosing a club.
// One club is not a choice, so the picker never appears for them.
//
// Same stacked-button idiom as the club's own actions — a green face on a darker
// one, offset — at the design's 172x48 with a 65pt pitch.

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Brand, Fonts, TAB_BAR_CLEARANCE, Type } from "../constants/theme";
import type { Club } from "../lib/club-context";

/** Buttons at x99 (centred), first at y303, one every 65. */
const BTN = { width: 172, height: 48, radius: 12, offset: { x: 3, y: 5 }, pitch: 65, top: 199 };

export function MyClubs({
  clubs,
  onPick,
  scale: s,
}: {
  clubs: Club[];
  onPick: (programId: string) => void;
  scale: number;
}) {
  return (
    <View style={styles.page}>
      <Text style={styles.title}>My Clubs</Text>

      {/* Scrolls: the design shows three, and a person could be in more. */}
      <ScrollView
        contentContainerStyle={{ paddingTop: BTN.top * s, alignItems: "center" }}
        showsVerticalScrollIndicator={false}
      >
        {clubs.map((club) => (
          <Pressable
            key={club.programId}
            onPress={() => onPick(club.programId)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${club.name}`}
            style={({ pressed }) => [
              {
                width: (BTN.width + BTN.offset.x) * s,
                height: (BTN.height + BTN.offset.y) * s,
                marginBottom: (BTN.pitch - BTN.height) * s,
              },
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.shadow,
                {
                  left: BTN.offset.x * s,
                  top: BTN.offset.y * s,
                  width: BTN.width * s,
                  height: BTN.height * s,
                  borderRadius: BTN.radius * s,
                },
              ]}
            />
            <View
              style={[
                styles.face,
                { width: BTN.width * s, height: BTN.height * s, borderRadius: BTN.radius * s },
              ]}
            >
              <Text
                style={[styles.label, { fontSize: Type.sectionHeading * s }]}
                numberOfLines={1}
              >
                {club.name}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingBottom: TAB_BAR_CLEARANCE },
  title: {
    fontFamily: Fonts.display,
    fontSize: Type.screenTitle,
    color: Brand.ink,
    paddingHorizontal: 25,
  },
  shadow: { position: "absolute", backgroundColor: Brand.rowShadow },
  face: {
    position: "absolute",
    left: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.green,
  },
  label: { fontFamily: Fonts.displayMedium, color: Brand.white, paddingHorizontal: 12 },
  pressed: { opacity: 0.85 },
});
