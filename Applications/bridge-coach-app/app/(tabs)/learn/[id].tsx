import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ContentWebView } from "../../../components/content-webview";
import { PrimaryButton, Screen, ScreenHeader } from "../../../components/ui";
import { Colors, Spacing } from "../../../constants/theme";
import { LEARNING_PLATFORM_URL, PROGRAM_ID } from "../../../lib/config";
import { useAuth } from "../../../lib/auth-context";
import { takeLaunch } from "../../../lib/launch-cache";
import { getCachedObject } from "../../../lib/learning";

/**
 * Opens one learning object in the learning platform's own student view:
 * mint a single-use launch token, then load the platform with
 * ?launch_token=…&object=<id> — the platform signs itself in and opens its
 * reader on that object.
 */
export default function LearnContentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const title = (id && getCachedObject(id)?.title) || "Learn";

  const load = useCallback(async () => {
    if (!token || !id) return;
    setError(null);
    setUrl(null);
    try {
      const launch = await takeLaunch(token, "learning");
      // Dev override: launch_url points at the team's default port, which is
      // contested locally — use our known-good instance. When the platform is
      // deployed, switch back to preferring launch.launch_url.
      const base = LEARNING_PLATFORM_URL || launch.launch_url;
      const params = new URLSearchParams({
        launch_token: launch.launch_token,
        program_id: PROGRAM_ID,
        object: id,
        embed: "1", // content only — the app owns the surrounding navigation
      });
      setUrl(`${base}?${params.toString()}`);
    } catch {
      setError("Couldn't open this content. Check that the learning platform is running.");
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  // Learn↔Play: a lesson's embedded board asks the app to open it on a live
  // bridge table (the LP posts {type:'lp:play-entry', entryId}).
  const handleHostMessage = useCallback((data: unknown) => {
    const msg = data as { type?: string; entryId?: string } | null;
    if (msg?.type === "lp:play-entry" && typeof msg.entryId === "string") {
      router.push({ pathname: "/play-board/[entryId]", params: { entryId: msg.entryId } });
    }
  }, []);

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

      {url && <ContentWebView url={url} onHostMessage={handleHostMessage} />}
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
