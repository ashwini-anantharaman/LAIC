// The board's exit, FunBridge-style (owner request 2026-08-12): a small tab
// riding the RIGHT edge of the felt. Tapping it slides out a light panel with
// one red Quit button; the chevron flips and closes it again. Replaces the
// floating back arrow — leaving a board becomes a deliberate two-tap gesture
// instead of a corner tap a mis-aim can hit mid-play.
//
// Pure app chrome layered over the table (webview or native) — the board
// implementation underneath is untouched.

import { useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text } from "react-native";

import { Fonts } from "../../constants/theme";

const PANEL_W = 280;
const TAB_W = 44;

export function QuitPullout({
  onQuit,
  top = "58%",
}: {
  onQuit: () => void;
  /** Vertical anchor of the tab — FunBridge parks it near the hand. */
  top?: number | `${number}%`;
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
    <Animated.View style={[styles.host, { top, transform: [{ translateX }] }]}>
      <Pressable
        onPress={toggle}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={open ? "Close menu" : "Open menu"}
        style={({ pressed }) => [styles.tab, pressed && { opacity: 0.8 }]}
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
          <Text style={styles.quitText}>Quit</Text>
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
  tab: {
    width: TAB_W,
    height: 56,
    backgroundColor: "#f2f2f4",
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    // A soft lift off the felt, like the reference.
    shadowColor: "#000",
    shadowOffset: { width: -1, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  tabGlyph: { fontSize: 26, lineHeight: 30, color: "#17211d", marginTop: -2 },
  panel: {
    width: PANEL_W,
    backgroundColor: "#f2f2f4",
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 34,
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  quit: {
    backgroundColor: "#e02b20",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  quitText: { fontFamily: Fonts.bodySemibold, fontSize: 16, color: "#ffffff" },
});
