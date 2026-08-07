// The bridge launch handshake, performed INVISIBLY right after sign-in.
//
// The first bridge embed a user opens used to pay the whole bill at the tap:
// mint a launch token, exchange it on the platform, follow the redirect,
// render the page — felt as a long first-click delay (reported 2026-08-07 on
// Create Assignment, but true of every first embed). This component pays
// that bill in the background while the user is still looking at their first
// screen: a 1×1 hidden WebView runs the handshake, and only once it LANDS
// signed-in is the origin recorded for launch-cache — from then on every
// BridgeEmbed skips the handshake and loads its destination directly.
//
// Deliberately NOT remembering the origin up front (as BridgeEmbed's own
// load() does): a real embed opened during the warm-up would then try a
// direct load against a cookie that doesn't exist yet and bounce. Until the
// warmer finishes, a racing embed simply does its own handshake — no worse
// than today.

import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ContentWebView } from "./content-webview";
import { BRIDGE_LAUNCH_URL_OVERRIDE, PROGRAM_ID } from "../lib/config";
import { useAuth } from "../lib/auth-context";
import { peekBridgeOrigin, rememberBridgeOrigin, takeLaunch } from "../lib/launch-cache";

/** Give up quietly if the handshake hasn't landed by then — the next real
 *  embed will just do its own, exactly as before. */
const WARM_TIMEOUT_MS = 20_000;

export function BridgeSessionWarmer() {
  const { status, token } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const originRef = useRef<string | null>(null);
  const warmedFor = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "signedIn" || !token) return;
    if (warmedFor.current === token) return;
    if (peekBridgeOrigin(token)) {
      // A real embed beat us to it — nothing left to warm.
      warmedFor.current = token;
      return;
    }
    warmedFor.current = token;
    let cancelled = false;
    (async () => {
      try {
        const launch = await takeLaunch(token, "bridge");
        const base = BRIDGE_LAUNCH_URL_OVERRIDE ?? launch.launch_url;
        if (!base || cancelled) return;
        originRef.current = new URL(base).origin;
        const params = new URLSearchParams({
          launch_token: launch.launch_token,
          program_id: PROGRAM_ID,
          next: "/m/home",
          embedded: "1",
        });
        setUrl(`${base}?${params.toString()}`);
      } catch {
        // Warming is best-effort; the first real embed handshakes as before.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, token]);

  // Whatever happens, the warmer never outstays its welcome.
  useEffect(() => {
    if (!url) return;
    const t = setTimeout(() => setUrl(null), WARM_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [url]);

  if (!url) return null;
  return (
    <View style={styles.hidden} pointerEvents="none" accessibilityElementsHidden>
      <ContentWebView
        url={url}
        onUrlChange={(u) => {
          // Landed on a signed-in /m page: the cookie session is live. Record
          // the origin so every embed from now on loads directly, and vanish.
          if (u.includes("/m/") && token && originRef.current) {
            rememberBridgeOrigin(token, originRef.current);
            setUrl(null);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
});
