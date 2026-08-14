import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ContentWebView } from "../components/content-webview";
import { PrimaryButton, Screen, ScreenHeader } from "../components/ui";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { useSelectedClubId } from "../lib/club-context";
import { LEARNING_PLATFORM_URL, PROGRAM_ID } from "../lib/config";
import { takeLaunch } from "../lib/launch-cache";
import { clearLearningCache } from "../lib/learning";

/**
 * Add content to THIS CLUB — the Studio's club compose screen, and nothing else.
 *
 * This first opened the whole Content Studio with `ui=mobile`, on the reasoning that
 * authoring needs navigation. That was wrong twice: `ui=mobile` keeps every tab and
 * merely turns the sidebar into a drawer, so it arrived as a full desktop Studio with
 * thirteen object types and no obvious way forward — and authoring does not need that
 * navigation, because the club flow is one screen. `embed=1` renders that screen alone.
 *
 * WHICH CLUB is the whole point. The launch is minted for the selected club, so the
 * Studio signs in as that club and everything published lands stamped with it — which
 * is what keeps one club's material out of another's, and out of the shared curriculum.
 * Launching as the app-wide program instead would file the work under the parent, where
 * every club would see it.
 *
 * `screen=club-compose` is honoured only when the person's own access exposes that
 * screen, so it is a convenience, never a way in.
 */
export default function StudioScreen() {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    setUrl(null);
    try {
      const launch = await takeLaunch(token, "learning", clubId ?? undefined);
      const base = LEARNING_PLATFORM_URL || launch.launch_url;
      const params = new URLSearchParams({
        launch_token: launch.launch_token,
        program_id: clubId ?? PROGRAM_ID,
        // The club's own compose screen: four types, one Publish, nothing else.
        screen: "club-compose",
        // `embed=1`, NOT `ui=mobile`. Mobile keeps every tab and only turns the
        // sidebar into a drawer — which is what made this open as a full desktop
        // Studio with no obvious way forward. Embed renders the screen alone, and
        // applies the app's own cream-and-Neco skin while it is at it.
        embed: "1",
      });
      setUrl(`${base}?${params.toString()}`);
    } catch {
      setError("Couldn't open the Content Studio. Check that it's running.");
    }
  }, [token, clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Anything published in there changes what this club's screens should show, and
  // the app caches that list. Dropping it on the way out means the Activities row
  // and the Learn tab re-read rather than showing the list from before the visit.
  useEffect(() => {
    return () => clearLearningCache();
  }, []);

  /**
   * The Studio tells us when it has published, and then we are done here.
   *
   * Popping back is what makes the card appear: the club tab re-reads its content on
   * focus, so returning IS the refresh. Same bridge the reader uses to hand a board to
   * the app — one message type per thing the web side can ask for.
   */
  const onHostMessage = useCallback((data: unknown) => {
    const msg = data as { type?: string } | null;
    if (msg?.type === "lp:published") router.back();
  }, []);

  return (
    <Screen>
      <ScreenHeader title="Create" />

      {!url && !error && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.text} />
        </View>
      )}

      {error && (
        <View style={styles.center}>
          <Text style={styles.stateText}>{error}</Text>
          <PrimaryButton label="Try again" onPress={load} />
          <PrimaryButton label="Go back" onPress={() => router.back()} />
        </View>
      )}

      {/* No injectedCSS: `embed=1` already applies the Studio's own BirdBridge skin —
          the app's cream ground and its two faces — so injecting a second sheet on top
          would be two things fighting over the same colours. */}
      {url && <ContentWebView url={url} onHostMessage={onHostMessage} />}
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
    fontFamily: Fonts.body,
  },
});
