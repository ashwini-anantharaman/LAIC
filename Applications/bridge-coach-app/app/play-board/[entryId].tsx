// Learn↔Play landing — NATIVE (M3e; was a BridgeEmbed of /m/play-entry).
// Deals a lesson's embedded board onto a live table: one POST creates the
// session and this screen replaces itself with the table.

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Screen, ScreenHeader } from "../../components/ui";
import { Brand, Fonts, Spacing } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { BridgeApiError } from "../../lib/bridge-api";
import { useSelectedClubId } from "../../lib/club-context";
import { PROGRAM_ID } from "../../lib/config";
import { playLibraryEntry } from "../../lib/library";

export default function PlayBoardScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const id = typeof entryId === "string" ? entryId : "";
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const deal = useCallback(async () => {
    if (!token || !id) return;
    try {
      const { sessionId } = await playLibraryEntry(token, programId, id, "play");
      router.replace(`/table/${sessionId}`);
    } catch (e) {
      setError(
        e instanceof BridgeApiError ? e.message : "Couldn't open this board — try again.",
      );
      started.current = false;
    }
  }, [token, programId, id]);

  useFocusEffect(
    useCallback(() => {
      // Once per entry — a re-render must not deal a second board.
      if (started.current) return;
      started.current = true;
      void deal();
    }, [deal]),
  );

  return (
    <Screen>
      <ScreenHeader title="Play" backTo="/play" />
      <View style={styles.body}>
        {!error ? (
          <>
            <ActivityIndicator size="large" color={Brand.green} />
            <Text style={styles.dealing}>Setting up the board…</Text>
          </>
        ) : (
          <>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => {
                setError(null);
                started.current = true;
                void deal();
              }}
              style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.screen,
    gap: 16,
  },
  dealing: { fontFamily: Fonts.body, fontSize: 14, color: "#5e5749" },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: Brand.ink,
    textAlign: "center",
  },
  button: {
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonText: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.white },
});
