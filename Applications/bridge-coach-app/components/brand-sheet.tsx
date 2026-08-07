// The maroon panel that rises over the app when you tap the avatar (Profile)
// or the gear (Settings).
//
// In the designs the panel starts at y=104 — exactly the bottom of the top app
// bar — so the bar stays visible and the sheet owns everything below it. It
// springs up from the bottom edge, the screen behind dims, and it can be
// flicked back down.

import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useEffect } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const SCREEN_H = Dimensions.get("window").height;

/** Flick past this (or fast enough) and the sheet closes instead of settling. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

const SPRING = { damping: 22, stiffness: 220, mass: 0.9 } as const;

export function BrandSheet({
  visible,
  onClose,
  title,
  /** Distance from the top of the screen where the panel begins. */
  top,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  top: number;
  children: ReactNode;
}) {
  // How far the panel is pushed down from its resting place. SCREEN_H = fully
  // offscreen, 0 = open.
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(SCREEN_H);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      offset.value = withSpring(0, SPRING);
      backdrop.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    } else {
      offset.value = withTiming(SCREEN_H, { duration: 200, easing: Easing.in(Easing.quad) });
      backdrop.value = withTiming(0, { duration: 160 });
    }
  }, [visible, offset, backdrop]);

  const pan = Gesture.Pan()
    // A tap on ✕ must not be read as a drag.
    .activeOffsetY([-8, 8])
    .onChange((e) => {
      // Downward only — dragging up must not tear the panel off its anchor.
      offset.value = Math.max(0, offset.value + e.changeY);
    })
    .onEnd((e) => {
      const shouldClose = offset.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (shouldClose) {
        offset.value = withTiming(SCREEN_H, { duration: 180 }, (done) => {
          if (done) runOnJS(onClose)();
        });
        backdrop.value = withTiming(0, { duration: 160 });
      } else {
        offset.value = withSpring(0, SPRING);
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * 0.45,
  }));

  // Unmounted when closed so it never swallows touches on the screen behind.
  if (!visible) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View style={[styles.panel, { top }, panelStyle]}>
        {/* Drag-to-dismiss lives on the HEADER alone. While it wrapped the whole
            panel it swallowed every vertical drag, so scrollable content could
            not scroll: each attempt dragged the sheet, which then sprang back —
            making anything below the fold (Sign out) unreachable. */}
        <GestureDetector gesture={pan}>
          <View style={styles.header}>
            <View style={styles.grabber} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>{title}</Text>
              <Pressable
                onPress={onClose}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel={`Close ${title}`}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Ionicons name="close" size={26} color={SHEET_TEXT} />
              </Pressable>
            </View>
          </View>
        </GestureDetector>

        {/* flex:1 bounds the content so a ScrollView inside actually scrolls
            instead of overflowing the panel. */}
        <View style={[styles.content, { paddingBottom: insets.bottom }]}>{children}</View>
      </Animated.View>
    </View>
  );
}

const SHEET_BG = "#541015";
const SHEET_TEXT = "#fff4d7";

const styles = StyleSheet.create({
  host: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SHEET_BG,
    borderRadius: 44,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 31,
    paddingTop: 10,
    paddingBottom: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  /** Signals that the header is the drag handle. */
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,244,215,0.35)",
    marginBottom: 12,
  },
  content: { flex: 1 },
  title: {
    fontFamily: "Neco-Bold",
    fontSize: 25.9,
    color: SHEET_TEXT,
  },
  pressed: { opacity: 0.6 },
});
