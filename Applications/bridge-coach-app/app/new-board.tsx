// "New" from Play — NATIVE (M3e; was a BridgeEmbed of /m/quick-play). One
// POST deals a fresh board against the house lineup and this screen replaces
// itself with the table, so it exists only for the moment the deal takes —
// a felt-green beat instead of a webview booting a web app.

import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BoardLoading } from "../components/table/board-loading";
import { Screen, ScreenHeader } from "../components/ui";
import { Brand, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { BridgeApiError } from "../lib/bridge-api";
import { useSelectedClubId } from "../lib/club-context";
import { PROGRAM_ID } from "../lib/config";
import { quickPlay } from "../lib/library";

export default function NewBoardScreen() {
  const { token } = useAuth();
  // curate=1 (coaches, owner design 2026-08-15): the dealt board opens in
  // curate mode — the platform table shows the annotation rail instead of
  // the coach dock, and publishing saves the curated deal to the library.
  const { curate } = useLocalSearchParams<{ curate?: string }>();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;
  const started = useRef(false);
  const [error, setError] = useState<{ text: string; noLineup: boolean } | null>(null);

  const deal = useCallback(async () => {
    if (!token) return;
    try {
      const { sessionId } = await quickPlay(token, programId);
      // fresh=1: the session was created THIS moment and nobody has played
      // it. If its open bounces (board gone), the table screen discards it on
      // the way out instead of stranding a ghost board in Resume.
      router.replace(`/table/${sessionId}?fresh=1${curate === "1" ? "&curate=1" : ""}`);
    } catch (e) {
      const noLineup = e instanceof BridgeApiError && e.message === "no_lineup";
      setError({
        text: noLineup
          ? "There's nothing to play against yet — no knowledge base compiles. Pick a board from the Library instead."
          : e instanceof BridgeApiError
            ? e.message
            : "Couldn't deal a board — try again.",
        noLineup,
      });
      started.current = false;
    }
  }, [token, programId, curate]);

  useFocusEffect(
    useCallback(() => {
      // Once per entry — a re-render must not deal a second board.
      if (started.current) return;
      started.current = true;
      void deal();
    }, [deal]),
  );

  return (
    <Screen style={!error ? styles.feltScreen : undefined}>
      {/* A board door fades in — the felt cover then cross-fades into the
          table, so the whole journey reads as one motion. */}
      <Stack.Screen options={{ animation: "fade" }} />
      {/* NO header while dealing (owner request 2026-08-12: not even a
          flash of it) — the felt cover is the whole screen. The header,
          with its back arrow, exists only in the error state. */}
      {error ? <ScreenHeader title="New board" backTo="/play" /> : null}
      <View style={styles.body}>
        {!error ? (
          <BoardLoading ready={false} onGone={() => {}} label="Dealing your board…" />
        ) : (
          <>
            <Text style={styles.errorText}>{error.text}</Text>
            <Pressable
              onPress={() => {
                if (error.noLineup) {
                  router.replace("/library");
                } else {
                  setError(null);
                  started.current = true;
                  void deal();
                }
              }}
              style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.buttonText}>
                {error.noLineup ? "Open the Library" : "Try again"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** While dealing, the SAFE AREAS wear the felt too — no cream bars. */
  feltScreen: { backgroundColor: "#1d5c46" },
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
