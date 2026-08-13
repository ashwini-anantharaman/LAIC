// The exits' veil — the entrances' cream fade, played leaving.
//
// Screens ARRIVE under a fading cover (TabLoading, BoardLoading), but leaving
// one still cut hard: the stack's own fade can't blend a WebView's surface,
// and quitting a board dropped the felt for home in a single frame. So every
// exit door now goes through here: cream fades in over the outgoing screen,
// the navigation happens underneath, and the veil lifts off the destination —
// leaving reads as the same motion as arriving, everywhere.
//
// One host, mounted once at the root, above the whole stack. Callers never
// render anything — they wrap their navigation in `leaveWithFade`.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { Brand } from "../constants/theme";
import { boardDebug } from "./board-debug";

const COVER_MS = 160;
const REVEAL_MS = 280;
/** One breath after the navigation lands before the veil lifts, so the
 *  destination has painted under it rather than mid-fade. */
const SETTLE_MS = 60;

let host: ((navigate: () => void) => void) | null = null;

/** Run a navigation under the veil. With no host mounted (never in the app
 *  proper, but tests render components bare) it simply navigates. */
export function leaveWithFade(navigate: () => void) {
  if (host) host(navigate);
  else navigate();
}

export function LeaveVeilHost() {
  const opacity = useRef(new Animated.Value(0)).current;
  const [active, setActive] = useState(false);

  useEffect(() => {
    host = (navigate: () => void) => {
      boardDebug("veil: cover starting");
      setActive(true);
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: COVER_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        // Navigate only once fully covered — the outgoing screen never
        // half-vanishes, and whatever the router does happens out of sight.
        boardDebug("veil: covered, navigating");
        navigate();
        setTimeout(() => {
          Animated.timing(opacity, {
            toValue: 0,
            duration: REVEAL_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start(({ finished }) => {
            boardDebug("veil: reveal done", { finished });
            if (finished) setActive(false);
          });
        }, SETTLE_MS);
      });
    };
    return () => {
      host = null;
    };
  }, [opacity]);

  if (!active) return null;
  // pointerEvents="auto" while up: a transition is not a moment for taps —
  // it also swallows the double-tap that would navigate twice.
  return <Animated.View style={[styles.veil, { opacity }]} pointerEvents="auto" />;
}

const styles = StyleSheet.create({
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Brand.cream,
    zIndex: 100,
    elevation: 100,
  },
});
