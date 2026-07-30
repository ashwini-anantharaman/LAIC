import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ContentWebView } from "./content-webview";
import { PrimaryButton, Screen, ScreenHeader } from "./ui";
import { Colors, Spacing } from "../constants/theme";
import { BRIDGE_LAUNCH_URL_OVERRIDE, PROGRAM_ID } from "../lib/config";
import { useAuth } from "../lib/auth-context";
import { takeLaunch } from "../lib/launch-cache";

/**
 * Opens one bridge-platform page inside the app: mint a single-use launch
 * token; the platform's /nexus/launch exchanges it, signs the user in
 * (cookie session) and deep-links to `next`. embedded=1 hides the platform's
 * own sign-out — the app owns the surrounding navigation.
 */
export function BridgeEmbed({
  title,
  next,
  resetOnFocus = false,
}: {
  title: string;
  next: string;
  /** Tab screens: every return to the tab restarts at `next`, so wandering
   *  into a sub-page (board editor, a table) never becomes the tab's state. */
  resetOnFocus?: boolean;
}) {
  const { token } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Where the user actually is inside the embed (native only) + the bridge
  // origin once a launch succeeded — both power cheap tab-switch resets.
  const currentUrl = useRef<string | null>(null);
  const originRef = useRef<string | null>(null);
  const lastRelaunch = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    setUrl(null);
    try {
      const launch = await takeLaunch(token, "bridge");
      const base = BRIDGE_LAUNCH_URL_OVERRIDE ?? launch.launch_url;
      if (!base) throw new Error("bridge platform URL not configured");
      originRef.current = new URL(base).origin;
      const params = new URLSearchParams({
        launch_token: launch.launch_token,
        program_id: PROGRAM_ID,
        next,
        embedded: "1",
      });
      setUrl(`${base}?${params.toString()}`);
    } catch {
      setError("Couldn't open the bridge platform. Check that it is running.");
    }
  }, [token, next]);

  useEffect(() => {
    load();
  }, [load]);

  // The embed session died (bounced to /welcome): re-launch once, guarded
  // against loops. Only observable on native.
  const handleUrlChange = useCallback(
    (u: string) => {
      currentUrl.current = u;
      if (u.includes("/welcome") && Date.now() - lastRelaunch.current > 5000) {
        lastRelaunch.current = Date.now();
        load();
      }
    },
    [load],
  );

  // Re-entering the tab resets the embed to its start page — CHEAPLY: the
  // cookie session from the first launch is reused (no token mint, no
  // handshake), and if the embed is already sitting on the start page
  // (knowable on native), nothing reloads at all.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!resetOnFocus) return;
      if (!focusedOnce.current) {
        focusedOnce.current = true; // mount already loaded
        return;
      }
      const origin = originRef.current;
      const cur = currentUrl.current;
      if (cur && origin) {
        try {
          const parsed = new URL(cur);
          const target = next.split("?")[0] ?? next;
          if (parsed.origin === origin && parsed.pathname === target) return;
        } catch {
          // Unparseable URL — fall through to a reset.
        }
      }
      if (origin) {
        const sep = next.includes("?") ? "&" : "?";
        setUrl(`${origin}${next}${sep}_r=${Date.now()}`);
      } else {
        load();
      }
    }, [resetOnFocus, next, load]),
  );

  return (
    <Screen>
      <ScreenHeader title={title} />

      {!url && !error && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.text} />
        </View>
      )}

      {error && (
        <View style={styles.center}>
          <Text style={styles.stateText}>{error}</Text>
          <PrimaryButton label="Try again" onPress={load} />
        </View>
      )}

      {url && <ContentWebView url={url} onUrlChange={handleUrlChange} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingHorizontal: Spacing.screen,
  },
  stateText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
});
