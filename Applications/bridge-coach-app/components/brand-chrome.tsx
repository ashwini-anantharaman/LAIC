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
// A pushed screen (Chat, Challenges) passes `onBack`, which puts a back arrow in
// that space instead.

import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand } from "../constants/theme";

/** Status bar to first line — the design's y=84 minus the 56pt status bar. */
export const CONTENT_TOP_GAP = 28;
/** A back arrow needs more room than the bare gap, so pushed screens get a row. */
const BACK_ROW_HEIGHT = 36;

export function BrandChrome({
  /** Given on pushed screens: renders a back arrow above the content. */
  onBack,
  /** Rendered under the gap, inside the safe area. */
  children,
}: {
  onBack?: () => void;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.host}>
      {onBack ? (
        <View style={[styles.backRow, { marginTop: insets.top + 6 }]}>
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
  backRow: { height: BACK_ROW_HEIGHT, justifyContent: "center", paddingHorizontal: 18 },
  pressed: { opacity: 0.55 },
});
