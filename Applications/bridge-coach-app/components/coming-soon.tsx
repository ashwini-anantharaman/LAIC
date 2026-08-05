// A destination the design reserves but the product doesn't implement yet.
// Deliberately plain and honest — no fake data, no dead controls.

import { StyleSheet, Text, View } from "react-native";

import { Screen, ScreenHeader } from "./ui";
import { Brand, Colors, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../constants/theme";

export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <Screen>
      <ScreenHeader title={title} backTo="/home" />
      <View style={styles.body}>
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.blurb}>{blurb}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: Spacing.screen,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  heading: {
    fontFamily: Fonts.display,
    fontSize: 26,
    color: Brand.ink,
  },
  blurb: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
});
