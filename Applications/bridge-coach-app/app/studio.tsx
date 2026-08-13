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
 * Author content for THIS CLUB, in the Content Studio's own creator.
 *
 * The sibling route (learn-object/[id]) opens the Studio's READER on one object,
 * embedded and skinned so it does not read as a browser. This one is the opposite
 * case and is deliberately NOT embedded: authoring needs the Studio's own
 * navigation, its sidebar and its wizard, and stripping that chrome would leave a
 * creator with no way to move between steps.
 *
 * WHICH CLUB is the whole point. The launch is minted for the selected club, so
 * the Studio signs in as that club and everything published lands stamped with it
 * — which is what keeps one club's material out of another's, and out of the
 * shared curriculum. Launching as the app-wide program instead would file the work
 * under the parent, where every club would see it.
 *
 * `screen=cd-creator` asks the Studio to open its creator rather than its
 * overview. The Studio honours that only when the person's own access exposes that
 * screen, so this is a convenience, never a way in.
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
        screen: "cd-creator",
        // The Studio's mobile shell: its own layout adapted for a phone. Not the
        // `embed` flag, which strips the navigation authoring depends on.
        ui: "mobile",
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

      {/* No injectedCSS here, unlike the reader. The reader is skinned to the app's
          own faces because a learner should not feel they left it; the Studio is a
          tool its authors already know, and restyling it would make its controls
          harder to recognise, not easier. */}
      {url && <ContentWebView url={url} />}
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
