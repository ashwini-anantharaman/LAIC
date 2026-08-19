// Assignments (coach) — NATIVE (M3d; was a BridgeEmbed of /m/assignments).
// Everything the coach assigned, plus anything they were named a reviewer
// on. Rendering follows the package's AssignmentView — THE one shared view
// model — served whole by GET /api/bridge/assignments; the app re-derives
// nothing (canEdit came from the server, and the edit routes re-check it).
//
// The ✎ editor is an in-card fold: instruction, learners (detach never
// destroys — their games and feedback stand), reviewers (the creator can
// never be removed; adding one backfills finished plays so their queue is
// never a silent nothing). A pre-brief group offers adoption first.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Screen, ScreenHeader } from "../components/ui";
import { TabLoading } from "../components/tab-loading";
import { Brand, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../constants/theme";
import {
  addAssignmentLearner,
  addAssignmentReviewer,
  adoptAssignment,
  peekCoachAssignments,
  refreshCoachAssignments,
  deleteAssignment,
  removeAssignmentLearner,
  removeAssignmentReviewer,
  subscribeToCoachAssignments,
  updateAssignmentNote,
  type AssignmentView,
  type CoachAssignments,
} from "../lib/assignments";
import { useAuth } from "../lib/auth-context";
import { BridgeApiError } from "../lib/bridge-api";
import { useSelectedClubId } from "../lib/club-context";
import { PROGRAM_ID } from "../lib/config";

const STATUS_CHIP = {
  assigned: { label: "not started", bg: "rgba(0,0,0,0.25)", fg: "rgba(255,244,215,0.8)" },
  started: { label: "in progress", bg: "#fdf3df", fg: "#8a6116" },
  completed: { label: "completed ✓", bg: "#e8f4ec", fg: "#1c5c34" },
} as const;

export default function AssignmentsScreen() {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;

  const [model, setModel] = useState<CoachAssignments | null>(() =>
    token ? peekCoachAssignments(token, programId) : null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  // Which card's delete is armed — a second tap commits it. Null = none.
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      setModel(peekCoachAssignments(token, programId));
      refreshCoachAssignments(token, programId)
        .then(() => setLoadError(null))
        .catch((e) => {
          if (!peekCoachAssignments(token, programId)) {
            setLoadError(
              e instanceof BridgeApiError ? e.message : "Couldn't load your assignments.",
            );
          }
        });
      return subscribeToCoachAssignments(setModel);
    }, [token, programId]),
  );

  /** Run one edit, then refresh the read model so the card redraws true. */
  const run = useCallback(
    async (work: () => Promise<unknown>, doneText?: string) => {
      if (!token || busy) return;
      setBusy(true);
      try {
        await work();
        if (doneText) setBanner(doneText);
        await refreshCoachAssignments(token, programId);
      } catch (e) {
        setBanner(e instanceof BridgeApiError ? e.message : "That didn't work — try again.");
      } finally {
        setBusy(false);
      }
    },
    [token, programId, busy],
  );

  const views = model?.views ?? [];
  const reviewing = model?.reviewing ?? [];

  const card = (view: AssignmentView, editable: boolean) => {
    const open = editing === view.key;
    const onRoster = new Set(view.learners.map((l) => l.learnerId));
    const named = new Set(view.reviewers.map((r) => r.reviewerId));
    const addableLearners = (model?.roster ?? []).filter((l) => !onRoster.has(l.user_id));
    const addableReviewers = (model?.candidates ?? []).filter((c) => !named.has(c.reviewerId));

    return (
      <View key={view.key} style={styles.cardEdge}>
        <View style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardTitle}>{view.title}</Text>
              <Text style={styles.cardMeta}>
                {view.creatorIsViewer ? "you assigned" : `by ${view.creatorName}`} ·{" "}
                {view.createdAt.slice(0, 10)} · {view.learners.length} learner
                {view.learners.length === 1 ? "" : "s"}
              </Text>
              {view.note ? <Text style={styles.cardNote}>“{view.note}”</Text> : null}
            </View>
            {editable && view.canEdit && (
              <Pressable
                onPress={() => {
                  setEditing(open ? null : view.key);
                  setNoteDraft(view.note ?? "");
                }}
                hitSlop={8}
                style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
              >
                <Text style={styles.editButtonText}>{open ? "Done" : "✎ Edit"}</Text>
              </Pressable>
            )}
          </View>

          {/* Learners, with their status and (for the viewer) their threads. */}
          {view.learners.map((l) => {
            const chip = STATUS_CHIP[l.status];
            return (
              <View key={l.assignmentId}>
                <View style={styles.learnerRow}>
                  <Text style={styles.learnerName} numberOfLines={1}>
                    {l.name}
                  </Text>
                  <Text style={[styles.statusChip, { backgroundColor: chip.bg, color: chip.fg }]}>
                    {chip.label}
                  </Text>
                  {open && (
                    <Pressable
                      onPress={() =>
                        run(
                          () => removeAssignmentLearner(token!, programId, view.key, l.assignmentId),
                          "Learner removed — their game and feedback stand.",
                        )
                      }
                      disabled={busy}
                      hitSlop={8}
                    >
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  )}
                </View>
                {l.mine.map((t) => (
                  <Pressable
                    key={t.submissionId}
                    onPress={() => router.push(`/review/${t.submissionId}`)}
                    style={({ pressed }) => [styles.threadRow, pressed && styles.pressed]}
                  >
                    <Text style={styles.threadText}>
                      {t.status === "reviewed" ? "Read your feedback ›" : "Review their play ›"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            );
          })}

          {/* Reviewers, with how much has reached them. */}
          <Text style={styles.reviewersLine} numberOfLines={2}>
            Reviewers:{" "}
            {view.reviewers.length === 0
              ? "—"
              : view.reviewers
                  .map(
                    (r) =>
                      `${r.isViewer ? "you" : r.name}${r.isCreator ? " (creator)" : ""} ${r.reviewed}/${r.sent}`,
                  )
                  .join(" · ")}
          </Text>

          {/* ── The fold-out editor ── */}
          {open && view.canEdit && (
            <View style={styles.editor}>
              {!view.brief ? (
                <>
                  <Text style={styles.editorHint}>
                    This assignment predates editing — adopt it to change its instruction,
                    learners or reviewers. Nothing about who reviews what changes.
                  </Text>
                  <Pressable
                    onPress={() =>
                      run(() => adoptAssignment(token!, programId, view.key), "Ready to edit.")
                    }
                    disabled={busy}
                    style={({ pressed }) => [styles.editorButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.editorButtonText}>Enable editing</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.editorLabel}>INSTRUCTION</Text>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                    <TextInput
                      style={styles.noteInput}
                      value={noteDraft}
                      onChangeText={setNoteDraft}
                      placeholder="e.g. focus on your opening lead"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      multiline
                    />
                    <Pressable
                      onPress={() =>
                        run(
                          () => updateAssignmentNote(token!, programId, view.key, noteDraft),
                          "Saved.",
                        )
                      }
                      disabled={busy}
                      style={({ pressed }) => [styles.editorButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.editorButtonText}>Save</Text>
                    </Pressable>
                  </View>

                  {addableLearners.length > 0 && (
                    <>
                      <Text style={styles.editorLabel}>ADD A LEARNER</Text>
                      {addableLearners.map((l) => (
                        <Pressable
                          key={l.user_id}
                          onPress={() =>
                            run(
                              () => addAssignmentLearner(token!, programId, view.key, l.user_id),
                              "Learner added — they get their own copy.",
                            )
                          }
                          disabled={busy}
                          style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
                        >
                          <Text style={styles.addRowName}>{l.name ?? l.email ?? "Learner"}</Text>
                          <Text style={styles.addRowChip}>Add</Text>
                        </Pressable>
                      ))}
                    </>
                  )}

                  <Text style={styles.editorLabel}>REVIEWERS</Text>
                  {view.reviewers.map((r) => (
                    <View key={r.reviewerId} style={styles.addRow}>
                      <Text style={styles.addRowName}>
                        {r.isViewer ? "You" : r.name}
                        {r.isCreator ? " · creator" : ""}
                      </Text>
                      {!r.isCreator && (
                        <Pressable
                          onPress={() =>
                            run(
                              () =>
                                removeAssignmentReviewer(token!, programId, view.key, r.reviewerId),
                              "Reviewer removed — everything they wrote stands.",
                            )
                          }
                          disabled={busy}
                          hitSlop={8}
                        >
                          <Text style={styles.removeText}>Remove</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                  {addableReviewers.map((c) => (
                    <Pressable
                      key={c.reviewerId}
                      onPress={() =>
                        run(
                          () => addAssignmentReviewer(token!, programId, view.key, c.reviewerId),
                          "Reviewer added — finished plays are on their way to them.",
                        )
                      }
                      disabled={busy}
                      style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
                    >
                      <Text style={styles.addRowName}>
                        {c.name}
                        {c.detail ? `  ·  ${c.detail}` : ""}
                      </Text>
                      <Text style={styles.addRowChip}>Add</Text>
                    </Pressable>
                  ))}
                </>
              )}

              {/* RETIRING THE WHOLE THING (owner request 2026-08-17). Learners
                  could be taken off one at a time but the assignment itself
                  could not be put away, so a board asked for by mistake stayed
                  on every learner's list for good.

                  Two taps, not a dialog: the first arms it and states plainly
                  what survives, the second does it. A destructive action needs
                  a beat to think in, and the app has no confirm sheet — an RN
                  Modal is the one thing this codebase has learned not to put
                  over a table. */}
              {editable && (
                <View style={styles.deleteBox}>
                  {armedDelete === view.key ? (
                    <>
                      <Text style={styles.deleteWarn}>
                        Delete this assignment? It disappears from every learner&apos;s list.
                        Boards they already played stay in their My Plays, with any feedback.
                      </Text>
                      <View style={styles.deleteRow}>
                        <Pressable
                          onPress={() => {
                            setArmedDelete(null);
                            void run(
                              () => deleteAssignment(token!, programId, view.key),
                              "Assignment deleted — played boards stay with your learners.",
                            );
                          }}
                          disabled={busy}
                          style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.deleteBtnText}>Yes, delete it</Text>
                        </Pressable>
                        <Pressable onPress={() => setArmedDelete(null)} hitSlop={8}>
                          <Text style={styles.removeText}>Keep it</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <Pressable onPress={() => setArmedDelete(view.key)} hitSlop={8}>
                      <Text style={styles.removeText}>Delete this assignment</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <ScreenHeader title="Assignments" backTo="/coach" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
      >
        <Text style={styles.title}>Assignments</Text>
        <Text style={styles.lede}>
          Boards you&apos;ve delegated, and assignments you review for other coaches.
        </Text>

        {banner && (
          <Pressable onPress={() => setBanner(null)}>
            <Text style={styles.banner}>{banner}</Text>
          </Pressable>
        )}

        {model === null && (
          <Text style={styles.emptyBox}>{loadError ?? "Loading your assignments…"}</Text>
        )}
        {model !== null && views.length === 0 && reviewing.length === 0 && (
          <Text style={styles.emptyBox}>
            Nothing assigned yet — use “Assign” on a board in your Library.
          </Text>
        )}

        {views.map((v) => card(v, true))}

        {reviewing.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>YOU REVIEW</Text>
            {reviewing.map((v) => card(v, false))}
          </>
        )}
      </ScrollView>

      <TabLoading ready={model !== null || loadError !== null} />
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
    marginTop: 24,
  },
  banner: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    backgroundColor: Brand.green,
    color: Brand.cream,
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

  cardEdge: { backgroundColor: Brand.cardShadow, borderRadius: 16, paddingBottom: 3, marginTop: 13 },
  card: { backgroundColor: Brand.maroon, borderRadius: 16, padding: 16 },
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
  editButton: {
    borderWidth: 1,
    borderColor: "rgba(255,244,215,0.5)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  editButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 12, color: Brand.cream },

  learnerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  learnerName: { flex: 1, fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.white },
  statusChip: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  deleteBox: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,244,215,0.22)",
  },
  deleteWarn: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: "rgba(255,244,215,0.85)",
  },
  deleteRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 },
  deleteBtn: {
    backgroundColor: "#b91c1c",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  deleteBtnText: { fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: "#fff" },
  removeText: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 12,
    color: "rgba(255,244,215,0.75)",
    textDecorationLine: "underline",
  },
  threadRow: {
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 7,
  },
  threadText: { fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: Brand.cream },
  reviewersLine: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    color: "rgba(255,244,215,0.72)",
    marginTop: 12,
  },

  editor: {
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  editorHint: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 19,
    color: Brand.white,
  },
  editorLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 1.8,
    color: "rgba(255,244,215,0.6)",
    marginTop: 12,
    marginBottom: 6,
  },
  editorButton: {
    alignSelf: "flex-start",
    backgroundColor: Brand.cream,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginTop: 8,
  },
  editorButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: Brand.ink },
  noteInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Brand.white,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,244,215,0.3)",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    minHeight: 40,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  addRowName: { flex: 1, fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.white },
  addRowChip: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 11.5,
    color: Brand.ink,
    backgroundColor: Brand.cream,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
    overflow: "hidden",
  },

  pressed: { opacity: 0.8 },
});
