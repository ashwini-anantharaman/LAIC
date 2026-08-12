// Learner profile (coach view) — NATIVE (M3b; this was a BridgeEmbed of
// /m/learner/[id]). Who they are to you, the instrument panel (assignments
// done, plays reviewed, awaiting), every feedback thread between you, and
// their assignment history. Roster membership is enforced server-side —
// a learner who isn't yours reads as not-found.

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen, ScreenHeader } from "../../components/ui";
import { Brand, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { BridgeApiError } from "../../lib/bridge-api";
import { useSelectedClubId } from "../../lib/club-context";
import {
  peekLearnerProgress,
  refreshLearnerProgress,
  type LearnerAssignment,
  type LearnerProgress,
} from "../../lib/coaching";
import { PROGRAM_ID } from "../../lib/config";

const CHIP: Record<LearnerAssignment["status"], { label: string; bg: string; fg: string }> = {
  assigned: { label: "not started", bg: "#f1ede3", fg: "#5e5749" },
  started: { label: "in progress", bg: "#fdf3df", fg: "#8a6116" },
  completed: { label: "completed ✓", bg: "#e8f4ec", fg: "#1c5c34" },
};

export default function LearnerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const learnerId = typeof id === "string" ? id : "";
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;

  const [data, setData] = useState<LearnerProgress | null>(() =>
    token && learnerId ? peekLearnerProgress(token, programId, learnerId) : null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token || !learnerId) return;
      setData(peekLearnerProgress(token, programId, learnerId));
      refreshLearnerProgress(token, programId, learnerId)
        .then((v) => {
          setData(v);
          setLoadError(null);
        })
        .catch((e) => {
          if (!peekLearnerProgress(token, programId, learnerId)) {
            setLoadError(
              e instanceof BridgeApiError && e.status === 404
                ? "This learner isn't on your roster."
                : "Couldn't load this learner.",
            );
          }
        });
    }, [token, programId, learnerId]),
  );

  const name = data?.learner.name ?? data?.learner.email ?? "Learner";
  const assignments = data?.assignments ?? [];
  const submissions = data?.submissions ?? [];
  const completedCount = assignments.filter((a) => a.status === "completed").length;
  const reviewed = submissions.filter((s) => s.status === "reviewed").length;
  const awaiting = submissions.filter((s) => s.status === "submitted").length;

  return (
    <Screen>
      <ScreenHeader title="Learner" backTo="/coach" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
      >
        {!data ? (
          <Text style={styles.emptyBox}>{loadError ?? "Loading…"}</Text>
        ) : (
          <>
            <Text style={styles.title}>{name}</Text>
            {data.learner.email ? (
              <Text style={styles.email}>{data.learner.email}</Text>
            ) : null}

            {/* The instrument panel */}
            <View style={styles.statsPanel}>
              <Stat value={`${completedCount}/${assignments.length}`} label="ASSIGNMENTS DONE" />
              <Stat value={String(reviewed)} label="PLAYS REVIEWED" />
              <Stat value={String(awaiting)} label="AWAITING REVIEW" />
            </View>

            {/* Feedback threads — every submission is its own pipeline */}
            <Text style={styles.sectionLabel}>FEEDBACK THREADS</Text>
            {submissions.length === 0 ? (
              <Text style={styles.emptyLine}>
                Nothing submitted yet — completed assignments arrive here automatically.
              </Text>
            ) : (
              submissions.map((s) => (
                <Pressable
                  key={s.submissionId}
                  onPress={() => router.push(`/review/${s.submissionId}`)}
                  style={({ pressed }) => [styles.itemRow, pressed && styles.pressed]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {s.board.name}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {s.createdAt.slice(0, 10)}
                      {s.board.contractLabel ? ` · ${s.board.contractLabel}` : ""}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.statusChip,
                      s.status === "reviewed"
                        ? { backgroundColor: "#e8f4ec", color: "#1c5c34" }
                        : { backgroundColor: "#fdf3df", color: "#8a6116" },
                    ]}
                  >
                    {s.status === "reviewed" ? "reviewed" : "awaiting review"}
                  </Text>
                </Pressable>
              ))
            )}

            {/* Assignment history */}
            <Text style={styles.sectionLabel}>ASSIGNMENT HISTORY</Text>
            {assignments.length === 0 ? (
              <Text style={styles.emptyLine}>
                Nothing assigned yet — use “Assign” on a board in your Library.
              </Text>
            ) : (
              assignments.map((a) => {
                const chip = CHIP[a.status];
                return (
                  <View key={a.assignmentId} style={styles.itemRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {a.entryName}
                      </Text>
                      <Text style={styles.itemMeta}>
                        assigned {a.createdAt.slice(0, 10)}
                        {a.completedAt ? ` · finished ${a.completedAt.slice(0, 10)}` : ""}
                      </Text>
                    </View>
                    <Text
                      style={[styles.statusChip, { backgroundColor: chip.bg, color: chip.fg }]}
                    >
                      {chip.label}
                    </Text>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: 90 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: Fonts.display, fontSize: 27, color: Brand.ink, marginTop: 6 },
  email: { fontFamily: Fonts.body, fontSize: 12, color: "#a49d8e", marginTop: 3 },

  statsPanel: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    backgroundColor: Brand.white,
    borderWidth: 1,
    borderColor: "#ece7db",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
  },
  statValue: { fontFamily: Fonts.display, fontSize: 22, color: Brand.ink },
  statLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: "#a49d8e",
    marginTop: 2,
  },

  sectionLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10.5,
    letterSpacing: 2,
    color: "#a49d8e",
    marginTop: 22,
    marginBottom: 4,
  },
  emptyLine: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 20, color: "#a49d8e" },
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

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Brand.white,
    borderWidth: 1,
    borderColor: "#ece7db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 9,
  },
  itemTitle: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.ink },
  itemMeta: { fontFamily: Fonts.body, fontSize: 11.5, color: "#a49d8e", marginTop: 3 },
  statusChip: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  pressed: { opacity: 0.75 },
});
