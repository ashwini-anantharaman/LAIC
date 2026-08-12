// Assigned to me — NATIVE (M3d; was a BridgeEmbed of /m/assigned). Boards
// the learner's coach delegated: To play / In progress / Done, the coach's
// instruction from the brief, and — once a board is finished — one feedback
// thread per reviewer, each opening the native review screen.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen, ScreenHeader } from "../components/ui";
import { Brand, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../constants/theme";
import {
  peekAssigned,
  refreshAssigned,
  startAssignment,
  subscribeToAssigned,
  type AssignedModel,
} from "../lib/assignments";
import { useAuth } from "../lib/auth-context";
import { BridgeApiError } from "../lib/bridge-api";
import { useSelectedClubId } from "../lib/club-context";
import { PROGRAM_ID } from "../lib/config";

const SECTIONS = [
  { status: "assigned", label: "TO PLAY", button: "Start" },
  { status: "started", label: "IN PROGRESS", button: "Continue" },
  { status: "completed", label: "DONE", button: null },
] as const;

export default function AssignedScreen() {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;

  const [model, setModel] = useState<AssignedModel | null>(() =>
    token ? peekAssigned(token, programId) : null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      setModel(peekAssigned(token, programId));
      refreshAssigned(token, programId)
        .then(() => setLoadError(null))
        .catch((e) => {
          if (!peekAssigned(token, programId)) {
            setLoadError(
              e instanceof BridgeApiError ? e.message : "Couldn't load your assignments.",
            );
          }
        });
      return subscribeToAssigned(setModel);
    }, [token, programId]),
  );

  const start = useCallback(
    async (assignmentId: string) => {
      if (!token || busy) return;
      setBusy(true);
      try {
        const { sessionId } = await startAssignment(token, programId, assignmentId);
        router.push(`/table/${sessionId}?from=assigned`);
      } catch (e) {
        setActionError(
          e instanceof BridgeApiError ? e.message : "Couldn't start that board — try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [token, programId, busy],
  );

  const assignments = model?.assignments ?? [];
  const threadsFor = (sessionId?: string) =>
    sessionId ? (model?.threads[sessionId] ?? []) : [];

  return (
    <Screen>
      <ScreenHeader title="Assignments" backTo="/play" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
      >
        <Text style={styles.title}>Assignments</Text>
        <Text style={styles.lede}>Boards your coach asked you to play.</Text>

        {actionError && (
          <Pressable onPress={() => setActionError(null)}>
            <Text style={styles.errorBanner}>{actionError}</Text>
          </Pressable>
        )}

        {model === null && (
          <Text style={styles.emptyBox}>{loadError ?? "Loading your assignments…"}</Text>
        )}
        {model !== null && assignments.length === 0 && (
          <Text style={styles.emptyBox}>
            Nothing assigned yet — when your coach delegates a board, it lands here.
          </Text>
        )}

        {SECTIONS.map((section) => {
          const items = assignments.filter((a) => a.status === section.status);
          if (items.length === 0) return null;
          return (
            <View key={section.status}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              {items.map((a, i) => {
                const suit = i % 2 === 0 ? Brand.maroon : Brand.green;
                const edge = i % 2 === 0 ? Brand.cardShadow : Brand.rowShadow;
                const threads = threadsFor(a.sessionId);
                const reviewerCount = a.reviewerCount ?? 1;
                return (
                  <View
                    key={a.assignmentId}
                    style={{ backgroundColor: edge, borderRadius: 16, paddingBottom: 3, marginTop: 13 }}
                  >
                    <View style={[styles.card, { backgroundColor: suit }]}>
                      <View style={styles.cardTop}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.cardTitle}>{a.entryName}</Text>
                          <Text style={styles.cardMeta}>
                            from {a.coachName ?? "your coach"} · {a.createdAt.slice(0, 10)}
                            {a.status === "completed" && " · completed ✓"}
                            {/* Only while unfinished and only when plural — once
                                done, the named thread rows below say who. */}
                            {a.status !== "completed" &&
                              reviewerCount > 1 &&
                              ` · ${reviewerCount} coaches will review`}
                          </Text>
                          {a.note ? <Text style={styles.cardNote}>“{a.note}”</Text> : null}
                        </View>
                        {/* A completion from before auto-submit: the finished
                            table itself, so a done board is never a dead end. */}
                        {a.status === "completed" && threads.length === 0 && a.sessionId && (
                          <Pressable
                            onPress={() =>
                              router.push(`/table/${a.sessionId}?view=hands&from=assigned`)
                            }
                            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                          >
                            <Text style={styles.chipText}>View</Text>
                          </Pressable>
                        )}
                        {section.button && (
                          <Pressable
                            onPress={() => start(a.assignmentId)}
                            disabled={busy}
                            style={({ pressed }) => [
                              styles.startButton,
                              (pressed || busy) && styles.pressed,
                            ]}
                          >
                            <Text style={styles.startButtonText}>{section.button}</Text>
                          </Pressable>
                        )}
                      </View>

                      {/* One review thread per coach, named. */}
                      {threads.map((sub) => (
                        <Pressable
                          key={sub.submissionId}
                          onPress={() => router.push(`/review/${sub.submissionId}`)}
                          style={({ pressed }) => [styles.threadRow, pressed && styles.pressed]}
                        >
                          <Text style={styles.threadName} numberOfLines={1}>
                            {sub.coachName ?? "Coach"}
                          </Text>
                          <Text style={styles.threadStatus}>
                            {sub.status === "reviewed" ? "Read feedback ›" : "Awaiting review ›"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
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
  errorBanner: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    backgroundColor: "#b91c1c",
    color: Brand.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
    overflow: "hidden",
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

  card: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitle: { fontFamily: Fonts.displayMedium, fontSize: 16, color: Brand.white },
  cardMeta: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: "rgba(255,244,215,0.72)",
    marginTop: 3,
  },
  cardNote: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 19,
    color: "rgba(255,244,215,0.85)",
    marginTop: 6,
  },

  chip: {
    borderWidth: 2,
    borderColor: "rgba(255,244,215,0.8)",
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  chipText: { fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: Brand.cream },
  startButton: {
    backgroundColor: Brand.cream,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  startButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: Brand.ink },

  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  threadName: { flex: 1, fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.white },
  threadStatus: { fontFamily: Fonts.body, fontSize: 12.5, color: Brand.cream },

  pressed: { opacity: 0.75 },
});
