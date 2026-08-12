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
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

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
  // The panel MOUNTS only while open (or sliding shut). A closed panel used
  // to hang 250px off-screen right behind a transform — on web, closing the
  // leave-board dialog handed FOCUS back to the off-screen Quit button, and
  // the browser scrolled the whole app sideways to reach it (the "shifted
  // right by exactly a panel's width" bug). Nothing focusable may ever live
  // beyond the screen edge, so the closed panel is unmounted, not parked.
  const [panelMounted, setPanelMounted] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) setPanelMounted(true);
    Animated.timing(slide, {
      toValue: next ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !next) setPanelMounted(false);
    });
  };

  // Closed: only the tab shows at the edge; the panel slides in from it.
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [PANEL_W, 0] });

  return (
    // The host CLIPS: while the panel slides, whatever pokes past the screen
    // edge is cut off rather than widening the page.
    <View style={[styles.host, { bottom }]} pointerEvents="box-none">
      <Animated.View style={[styles.slider, { transform: [{ translateX }] }]}>
        <Pressable
          onPress={toggle}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={open ? "Close menu" : "Open menu"}
          style={({ pressed }) => [styles.tab, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.tabGlyph}>{open ? "›" : "‹"}</Text>
        </Pressable>
        {panelMounted ? (
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
        ) : (
          // Keep the slider's width while closed so the tab stays put.
          <View style={{ width: PANEL_W }} />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    right: 0,
    width: PANEL_W + TAB_W,
    overflow: "hidden",
    zIndex: 30,
  },
  slider: { flexDirection: "row", alignItems: "center" },
  // The dark edge is a BORDER on the visible sides only (owner request
  // 2026-08-12): a shadow bled a dark line along the application's edge,
  // a border hugs the shape and stops where the screen begins. No right
  // border — that side meets the panel or the screen edge.
  tab: {
    width: TAB_W,
    height: 54,
    backgroundColor: Brand.cream,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    borderColor: Brand.cardShadow,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    // Ride over the panel's left border where the two meet, so the pair
    // reads as one outlined shape rather than two with a seam.
    marginRight: -2,
    zIndex: 1,
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
    borderColor: Brand.cardShadow,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderBottomWidth: 2,
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
