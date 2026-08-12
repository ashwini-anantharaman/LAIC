// The board's loading screen — a felt-green beat with three card backs being
// dealt in a gentle loop, instead of a white webview booting a web app (or a
// bare spinner). One component for every door to a board: the webview table,
// the native table, and the "dealing your board…" starts.
//
// The parent keeps this mounted and flips `ready`; the cover then fades out
// over ~350ms and calls `onGone`, so the board underneath appears as a
// cross-fade rather than a pop. A fail-safe treats a cover that has waited
// too long as ready — nobody gets stranded behind a loading screen.

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text } from "react-native";

import { Brand, Fonts } from "../../constants/theme";
import { CardBack } from "./cards";

const FADE_MS = 350;
/** No signal after this long → fade out anyway and let the screen speak. */
const FAILSAFE_MS = 12_000;

export function BoardLoading({
  ready,
  onGone,
  label = "Taking your seat…",
}: {
  /** The board underneath is drawn — start the fade. */
  ready: boolean;
  /** The fade finished — the parent may unmount the cover. */
  onGone: () => void;
  label?: string;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const bobs = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const goneRef = useRef(false);
  const onGoneRef = useRef(onGone);
  onGoneRef.current = onGone;

  // Three card backs bobbing in a staggered deal rhythm.
  useEffect(() => {
    const loops = bobs.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(v, {
            toValue: 1,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 140),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [bobs]);

  useEffect(() => {
    const fadeOut = () => {
      if (goneRef.current) return;
      goneRef.current = true;
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => onGoneRef.current());
    };
    if (ready) {
      fadeOut();
      return;
    }
    const failsafe = setTimeout(fadeOut, FAILSAFE_MS);
    return () => clearTimeout(failsafe);
  }, [ready, opacity]);

  return (
    <Animated.View style={[styles.cover, { opacity }]} pointerEvents={ready ? "none" : "auto"}>
      <Animated.View style={styles.fan}>
        {bobs.map((v, i) => (
          <Animated.View
            key={i}
            style={{
              transform: [
                { rotate: `${(i - 1) * 14}deg` },
                {
                  translateY: v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -10],
                  }),
                },
              ],
              marginHorizontal: -7,
            }}
          >
            <CardBack w={44} />
          </Animated.View>
        ))}
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1d5c46",
    alignItems: "center",
    justifyContent: "center",
    gap: 22,
    zIndex: 10,
  },
  fan: { flexDirection: "row", alignItems: "flex-end" },
  label: { fontFamily: Fonts.displayMedium, fontSize: 15, color: Brand.cream },
});
