// The RESUME cover (boss direction 2026-08-14: "he doesn't want that reload
// screen — the board should still show up, with a loading arrow over it").
//
// Coming back to a board you were already sitting at must not mean the green
// dealing screen again. The host captured the felt's last frame as the app
// left the foreground; this shows that STILL IMAGE — so the screen never
// stops looking like your board — with a small reloading pill over it, while
// the real page rebuilds underneath. When the table reports back in
// (bridge:table), the still cross-fades into the live board.
//
// Same contract as BoardLoading: the parent keeps it mounted and flips
// `ready`; a failsafe fades it out if no signal ever comes, so nobody is
// stranded behind a screenshot.

import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Image, StyleSheet, Text, View } from "react-native";

import { Brand, Fonts } from "../../constants/theme";

const FADE_MS = 350;
/** Longer than BoardLoading's 12s: this path includes a full re-handshake
 *  plus a cold serverless boot, and fading early would flash a half-loaded
 *  page where the board just was. */
const FAILSAFE_MS = 20_000;

export function BoardReloading({
  uri,
  ready,
  onGone,
}: {
  /** The captured last frame of the board — the cover IS this image. */
  uri: string;
  /** The rebuilt board underneath reported in — start the cross-fade. */
  ready: boolean;
  /** The fade finished — the parent may unmount the cover. */
  onGone: () => void;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const goneRef = useRef(false);
  const onGoneRef = useRef(onGone);
  onGoneRef.current = onGone;

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
      <Image source={{ uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      <View style={styles.pill}>
        <ActivityIndicator color={Brand.cream} />
        <Text style={styles.label}>Reloading…</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    // The felt, for any edge the capture doesn't cover — never white.
    backgroundColor: "#1d5c46",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: "rgba(31,31,31,0.72)",
  },
  label: { fontFamily: Fonts.displayMedium, fontSize: 14, color: Brand.cream },
});
