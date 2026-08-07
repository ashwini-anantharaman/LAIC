// A destination the design reserves but hasn't specified yet.
// Deliberately plain and honest — no fake data, no dead controls.
//
// Its only use is a TAB (Analysis), so it takes no back arrow — a tab has nothing
// to go back to. It wears BrandChrome's empty bar, which keeps its layout on the
// same vertical rhythm as every other screen.

import { StyleSheet, Text, View } from "react-native";

import { BrandChrome } from "./brand-chrome";
import { Brand, Colors, Fonts, Spacing, TAB_BAR_CLEARANCE, Type } from "../constants/theme";

export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <BrandChrome>
      <View style={styles.body}>
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.blurb}>{blurb}</Text>
      </View>
    </BrandChrome>
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
    fontSize: Type.screenTitle,
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
