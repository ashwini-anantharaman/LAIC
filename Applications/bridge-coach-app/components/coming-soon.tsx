// A destination the design reserves but hasn't specified yet.
// Deliberately plain and honest — no fake data, no dead controls.
//
// Analysis uses it as a PUSHED screen, so it takes a back arrow; a caller that is
// a tab passes `pushed={false}` and gets BrandChrome's plain gap instead.

import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { BrandChrome } from "./brand-chrome";
import { leaveWithFade } from "./leave-veil";
import { Brand, Colors, Fonts, Spacing, TAB_BAR_CLEARANCE, Type } from "../constants/theme";

export function ComingSoon({
  title,
  blurb,
  /** False for a tab, which has nothing to go back to. */
  pushed = true,
}: {
  title: string;
  blurb: string;
  pushed?: boolean;
}) {
  return (
    <BrandChrome
      onBack={
        pushed
          ? () => leaveWithFade(() => (router.canGoBack() ? router.back() : router.replace("/home")))
          : undefined
      }
    >
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
