// The chrome every branded screen OTHER THAN HOME wears.
//
// Menu, Profile and Settings are reached from Home alone — Home renders the app
// bar itself (it has to position its chrome over the tree artwork) and owns the
// three sheets. Repeating those actions on every screen was noise: the same three
// icons on six tabs, one tap from each other anyway.
//
// With the bar gone, its 54pt went with it: the designs now start their titles at
// y=84 rather than y=109, i.e. everything moved up by ~25. What remains is
// CONTENT_TOP_GAP — the breathing room between the status bar and the first line
// of a screen. Screens add nothing of their own on top of it, so they all agree.
//
// A screen passes `onBack` to put a back arrow in that space instead — the pushed
// screens (Chat, Challenges) always do, and the Club tab does while its Members
// view is showing. The arrow row is exactly CONTENT_TOP_GAP tall so switching it
// on and off moves nothing below it.

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand } from "../constants/theme";

/** Status bar to first line — the design's y=84 minus the 56pt status bar. */
export const CONTENT_TOP_GAP = 28;

export function BrandChrome({
  /** Given on pushed screens: renders a back arrow above the content. */
  onBack,
  /**
   * A full-bleed image behind the top of the screen — the Club tab's header.
   * It runs UNDER the status bar, so the height given is the part below the safe
   * area and the inset is added here.
   */
  banner,
  children,
}: {
  onBack?: () => void;
  banner?: { uri: string; height: number } | null;
  /** Rendered under the gap, inside the safe area. */
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.host}>
      {banner ? (
        <Image
          source={{ uri: banner.uri }}
          style={[styles.banner, { height: insets.top + banner.height }]}
          contentFit="cover"
          transition={160}
        />
      ) : null}
      {onBack ? (
        <View style={[styles.backRow, { marginTop: insets.top, height: CONTENT_TOP_GAP }]}>
          <Pressable
            onPress={onBack}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Ionicons name="chevron-back" size={24} color={Brand.ink} />
          </Pressable>
        </View>
      ) : (
        <View style={{ height: insets.top + CONTENT_TOP_GAP }} />
      )}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: Brand.cream },
  /** Behind the gap and the first block of content, and under the status bar. */
  banner: { position: "absolute", left: 0, right: 0, top: 0 },
  /** Exactly CONTENT_TOP_GAP tall, so a screen that gains or loses the arrow
   *  keeps every line below it in the same place. */
  backRow: { justifyContent: "center", paddingHorizontal: 18 },
  pressed: { opacity: 0.55 },
});
