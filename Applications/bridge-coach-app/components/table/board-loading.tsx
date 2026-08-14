// The board's loading screen — a felt-green beat with three card backs being
// dealt in a gentle loop, instead of a white webview booting a web app (or a
// bare spinner). One component for every door to a board: the webview table
// and the "dealing your board…" starts.
//
// The parent keeps this mounted and flips `ready`; the cover then fades out
// over ~350ms and calls `onGone`, so the board underneath appears as a
// cross-fade rather than a pop. A fail-safe treats a cover that has waited
// too long as ready — nobody gets stranded behind a loading screen.

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { Brand, Fonts } from "../../constants/theme";

/** One face-down card — the deck's maroon back (formerly table/cards.tsx,
 *  inlined when the native table's card primitives were removed). */
function CardBack({ w }: { w: number }) {
  const h = w * 1.45;
  return (
    <View style={[styles.back, { width: w, height: h, borderRadius: w * 0.14 }]}>
      <View style={[styles.backInner, { borderRadius: w * 0.08 }]} />
    </View>
  );
}

const FADE_MS = 350;
/** No signal after this long → fade out anyway and let the screen speak. */
const FAILSAFE_MS = 12_000;

export function BoardLoading({
  ready,
  held = false,
  onGone,
  label = "Taking your seat…",
}: {
  /** The board underneath is drawn — start the fade. */
  ready: boolean;
  /**
   * A curtain, not a loading screen: the parked table host keeps this over
   * the old page so unparking never flashes it. While held the failsafe is
   * suspended (a park has no 12-second budget) and the deal animation rests.
   */
  held?: boolean;
  /** The fade finished — the parent may unmount the cover. */
  onGone: () => void;
  label?: string;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const bobs = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const goneRef = useRef(false);
  const onGoneRef = useRef(onGone);
  onGoneRef.current = onGone;

  // Three card backs bobbing in a staggered deal rhythm — resting while held
  // (an invisible parked curtain should not animate for the whole park).
  useEffect(() => {
    if (held) return;
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
  }, [bobs, held]);

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
    // Held: no failsafe. The curtain must outlast an arbitrarily long park;
    // the clock starts (or restarts) when the hold lifts and a load begins.
    if (held) return;
    const failsafe = setTimeout(fadeOut, FAILSAFE_MS);
    return () => clearTimeout(failsafe);
  }, [ready, held, opacity]);

  return (
    // Held, the curtain must be touch-INERT as well as invisible: the parked
    // host is pointerEvents:none, but on react-native-web a child's "auto"
    // re-enables itself THROUGH that (CSS pointer-events semantics), and an
    // invisible full-screen shield over the app froze every tap after the
    // first quit. It only blocks touches while a real board load is underway.
    <Animated.View style={[styles.cover, { opacity }]} pointerEvents={ready || held ? "none" : "auto"}>
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
  back: {
    backgroundColor: Brand.maroon,
    borderWidth: 1,
    borderColor: Brand.cardShadow,
    padding: 3,
  },
  backInner: { flex: 1, borderWidth: 1, borderColor: "rgba(255,244,215,0.35)" },
});
