// The board's exit — the pull-out idea from FunBridge, wearing Bridge Bird's
// clothes (owner request 2026-08-12): a cream tab on its maroon stacked edge,
// riding the BOTTOM-right of the screen so it never sits over the coach
// panel. Tapping it slides out a cream card with one maroon Quit pill — the
// same destructive color the leave-board dialog uses — and the chevron flips
// to tuck it away. Replaces the floating back arrow: leaving a board is a
// deliberate two-tap gesture instead of a corner tap a mis-aim can hit.
//
// Pure app chrome layered over the table (webview or native) — the board
// implementation underneath is untouched.

import { useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text } from "react-native";

import { Brand, Fonts, Radius } from "../../constants/theme";

const PANEL_W = 250;
const TAB_W = 42;

export function QuitPullout({
  onQuit,
  bottom = 26,
}: {
  onQuit: () => void;
  /** Distance from the screen's bottom — below the felt, clear of the coach. */
  bottom?: number;
}) {
  const [open, setOpen] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.timing(slide, {
      toValue: next ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  // Closed: the panel hangs off-screen right, only the tab shows at the edge.
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [PANEL_W, 0] });

  return (
    <Animated.View style={[styles.host, { bottom, transform: [{ translateX }] }]}>
      <Pressable
        onPress={toggle}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={open ? "Close menu" : "Open menu"}
        style={({ pressed }) => [styles.tab, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.tabGlyph}>{open ? "›" : "‹"}</Text>
      </Pressable>
      <Animated.View style={styles.panel}>
        <Pressable
          onPress={() => {
            toggle();
            onQuit();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.quit, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.quitText}>Quit board</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    right: 0,
    width: PANEL_W + TAB_W,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 30,
  },
  // A clean cream tab — no stacked-edge shadow (owner request 2026-08-12:
  // the dark edge it drew read as a stray line on the felt).
  tab: {
    width: TAB_W,
    height: 54,
    backgroundColor: Brand.cream,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tabGlyph: {
    fontSize: 24,
    lineHeight: 28,
    color: Brand.maroon,
    fontFamily: Fonts.displayMedium,
    marginTop: -2,
  },
  panel: {
    width: PANEL_W,
    backgroundColor: Brand.cream,
    borderTopLeftRadius: Radius.card,
    borderBottomLeftRadius: Radius.card,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  // The leave-board dialog's own destructive pill — one voice for "this
  // ends the sitting".
  quit: {
    backgroundColor: Brand.maroon,
    borderRadius: Radius.button,
    paddingVertical: 14,
    alignItems: "center",
  },
  quitText: { fontFamily: Fonts.displayMedium, fontSize: 15, color: Brand.white },
});
