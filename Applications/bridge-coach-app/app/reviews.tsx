// Reviews — NATIVE (M3b; this was a BridgeEmbed of /m/reviews). The coach's
// queue of plays their learners sent for feedback: "Waiting for you" on top,
// "Reviewed" below, each row opening the native review thread. Painted
// stale-while-revalidate, refreshed on every focus — returning from a thread
// is exactly when a row's status changed.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen, ScreenHeader } from "../components/ui";
import { Brand, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { BridgeApiError } from "../lib/bridge-api";
import { useSelectedClubId } from "../lib/club-context";
import {
  peekReviewQueue,
  refreshReviewQueue,
  subscribeToReviewQueue,
} from "../lib/coaching";
import { PROGRAM_ID } from "../lib/config";
import type { PlaySubmission } from "../lib/plays";

export default function ReviewsScreen() {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;

  const [subs, setSubs] = useState<PlaySubmission[] | null>(() =>
    token ? peekReviewQueue(token, programId) : null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      setSubs(peekReviewQueue(token, programId));
      refreshReviewQueue(token, programId)
        .then(() => setLoadError(null))
        .catch((e) => {
          if (!peekReviewQueue(token, programId)) {
            setLoadError(
              e instanceof BridgeApiError ? e.message : "Couldn't load your reviews.",
            );
          }
        });
      return subscribeToReviewQueue(setSubs);
    }, [token, programId]),
  );

  const open = (subs ?? []).filter((s) => s.status === "submitted");
  const done = (subs ?? []).filter((s) => s.status !== "submitted");

  return (
    <Screen>
      <ScreenHeader title="Reviews" backTo="/coach" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
      >
        <Text style={styles.title}>Reviews</Text>
        <Text style={styles.lede}>Plays your learners sent you for feedback.</Text>

        {subs === null && (
          <Text style={styles.emptyBox}>{loadError ?? "Loading your queue…"}</Text>
        )}
        {subs !== null && subs.length === 0 && (
          <Text style={styles.emptyBox}>
            Nothing to review yet — when a learner sends you a play, it lands here.
          </Text>
        )}

        {(
          [
            { label: "WAITING FOR YOU", items: open },
            { label: "REVIEWED", items: done },
          ] as const
        ).map(
          (section) =>
            section.items.length > 0 && (
              <View key={section.label}>
                <Text style={styles.sectionLabel}>{section.label}</Text>
                {section.items.map((s, i) => {
                  // The app deals its list rows in alternating suits — maroon,
                  // green — each on its darker stacked edge.
                  const suit = i % 2 === 0 ? Brand.maroon : Brand.green;
                  const edge = i % 2 === 0 ? Brand.cardShadow : Brand.rowShadow;
                  return (
                    <Pressable
                      key={s.submissionId}
                      onPress={() => router.push(`/review/${s.submissionId}`)}
                      style={({ pressed }) => [
                        { backgroundColor: edge, borderRadius: 16, paddingBottom: 3, marginTop: 13 },
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={[styles.row, { backgroundColor: suit }]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {s.board.name}
                            {s.board.resultLabel ? (
                              <Text style={styles.rowResult}> · {s.board.resultLabel}</Text>
                            ) : null}
                          </Text>
                          <Text style={styles.rowMeta}>
                            from {s.learnerName ?? "a learner"} · {s.createdAt.slice(0, 10)}
                          </Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ),
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: Fonts.display, fontSize: 26, color: Brand.ink, marginTop: 6 },
  lede: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 20, color: "#5e5749", marginTop: 10 },
  sectionLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10.5,
    letterSpacing: 2,
    color: "#a49d8e",
    marginTop: 22,
  },
  emptyBox: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    color: "#a49d8e",
    textAlign: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d3ccbb",
    borderRadius: 12,
    padding: 16,
    marginTop: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowTitle: { fontFamily: Fonts.displayMedium, fontSize: 17, color: Brand.white },
  rowResult: { fontFamily: Fonts.body, fontSize: 13, color: "rgba(255,244,215,0.85)" },
  rowMeta: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: "rgba(255,244,215,0.72)",
    marginTop: 3,
  },
  chevron: { fontSize: 16, color: "rgba(255,244,215,0.75)" },
  pressed: { opacity: 0.8 },
});
