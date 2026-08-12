// The tabs' loading veil (owner request 2026-08-12): every tab opens under a
// cream cover that fades away when the tab's own data is ready, so content
// arrives as one cross-fade instead of popping in piecewise. A tab whose data
// is already cached (or that has none) fades immediately — the veil then
// reads as a soft entrance rather than a wait.
//
// Self-managing: parents render it as the LAST child of the screen (or a
// fragment sibling — the pager's scene is the positioning parent) and flip
// `ready`; it fades, then removes itself. A fail-safe fades a veil that has
// waited too long, so a failed fetch can never strand a tab behind cream.

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, StyleSheet } from "react-native";

import { Brand } from "../constants/theme";

const FADE_MS = 300;
const FAILSAFE_MS = 10_000;

export function TabLoading({ ready }: { ready: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const fading = useRef(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const fadeOut = () => {
      if (fading.current) return;
      fading.current = true;
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => setGone(true));
    };
    if (ready) {
      fadeOut();
      return;
    }
    const failsafe = setTimeout(fadeOut, FAILSAFE_MS);
    return () => clearTimeout(failsafe);
  }, [ready, opacity]);

  if (gone) return null;
  return (
    <Animated.View style={[styles.veil, { opacity }]} pointerEvents={ready ? "none" : "auto"}>
      <ActivityIndicator size="large" color={Brand.green} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Brand.cream,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 40,
  },
});
