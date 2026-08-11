// A tutorial from the Content Studio, embedded in the app.
//
// The Activities carousel's second card opens this. Unlike the Learn tab's
// reader (app/(tabs)/learn/[id].tsx), there is NO launch token here: the page is
// public, so it needs no sign-in handshake and none is minted. That also means
// nothing to fail — the embed either loads or the page is down.
//
// `embed=1` is the learning platform's own convention for "content only, the app
// owns the surrounding navigation", the same flag the Learn reader passes. The
// page already declares width=device-width, so it lays itself out for the phone;
// the app supplies only the header and the back arrow.
//
// The URL is a constant on purpose. This card is the design's placeholder for the
// activity types a club home will carry later, and pointing it at one known
// tutorial is what makes it demonstrable now. When activities become real data,
// the id comes from the activity and this screen takes it as a param.

import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ContentWebView } from "../components/content-webview";
import { PrimaryButton, Screen, ScreenHeader } from "../components/ui";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { LEARNING_PLATFORM_URL } from "../lib/config";
import { useState } from "react";

/**
 * The one tutorial this card opens, until activities carry their own ids.
 *
 * The HOST comes from config rather than being written out again: it is the same
 * learning platform the Learn tab uses (EXPO_PUBLIC_LEARNING_URL), so pointing the
 * app at a different deployment moves this with it. The first version of this
 * screen hardcoded a different origin, and the object simply did not exist there.
 */
const TUTORIAL_OBJECT_ID = "tv2-msj04a0i";
const TUTORIAL_URL = `${(LEARNING_PLATFORM_URL ?? "").replace(/\/+$/, "")}/o/${TUTORIAL_OBJECT_ID}?embed=1`;

export default function TutorialScreen() {
  // A WebView that cannot reach the page fires onError; without this the screen
  // would sit on a spinner forever and read as a hang rather than a failure.
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <Screen>
      <ScreenHeader title="Tutorial 1" backTo="/club" />

      {!loaded && !failed && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.text} />
        </View>
      )}

      {failed ? (
        <View style={styles.center}>
          <Text style={styles.stateText}>Couldn&apos;t open this tutorial.</Text>
          <PrimaryButton
            label="Try again"
            onPress={() => {
              setFailed(false);
              setLoaded(false);
            }}
          />
        </View>
      ) : (
        <ContentWebView
          url={TUTORIAL_URL}
          onLoadEnd={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </Screen>
  );
}

// Matched to the Learn reader's states, so a failure here looks like a failure
// anywhere else in the app.
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
