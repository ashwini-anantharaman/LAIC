// Assign — NATIVE (M3d; this picker lived inside the /m/assign WebView).
// The coach picks who PLAYS one library entry and who REVIEWS it, both on
// one screen: reviewers are optional and fold away so the common path stays
// a single tap. The creator is a FIXED reviewer row, not a checkbox — an
// unchecked creator with no named reviewer would produce an assignment
// nobody reviews (see the /m page's comment; same rule here).

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Screen, ScreenHeader } from "../components/ui";
import { TabLoading } from "../components/tab-loading";
import { Brand, Fonts, Spacing } from "../constants/theme";
import {
  createAssignment,
  fetchAssignEntry,
  peekCoachAssignments,
  refreshCoachAssignments,
  type CoachAssignments,
} from "../lib/assignments";
import { useAuth } from "../lib/auth-context";
import { BridgeApiError } from "../lib/bridge-api";
import { useSelectedClubId } from "../lib/club-context";
import { PROGRAM_ID } from "../lib/config";

export default function AssignScreen() {
  const { entry: entryParam } = useLocalSearchParams<{ entry?: string }>();
  const entryId = typeof entryParam === "string" ? entryParam : "";
  const { token, user } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;

  const [entry, setEntry] = useState<{ kind: string; name: string } | null>(null);
  const [pickers, setPickers] = useState<CoachAssignments | null>(() =>
    token ? peekCoachAssignments(token, programId) : null,
  );
  const [learners, setLearners] = useState<Set<string>>(new Set());
  const [reviewers, setReviewers] = useState<Set<string>>(new Set());
  const [showReviewers, setShowReviewers] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !entryId) return;
    let cancelled = false;
    fetchAssignEntry(token, programId, entryId)
      .then(({ item }) => !cancelled && setEntry(item))
      .catch(() => !cancelled && setError("That library entry no longer exists."));
    // The manager read model carries both pickers (roster + candidates).
    refreshCoachAssignments(token, programId)
      .then((v) => !cancelled && setPickers(v))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, programId, entryId]);

  const toggle = (set: Set<string>, id: string, apply: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const assign = useCallback(async () => {
    if (!token || busy) return;
    if (learners.size === 0) {
      setError("Pick at least one learner.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAssignment(token, programId, {
        entryId,
        learnerIds: [...learners],
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(reviewers.size ? { reviewerIds: [...reviewers] } : {}),
      });
      void refreshCoachAssignments(token, programId).catch(() => {});
      router.replace("/assignments");
    } catch (e) {
      setError(e instanceof BridgeApiError ? e.message : "Couldn't assign — try again.");
      setBusy(false);
    }
  }, [token, programId, entryId, learners, reviewers, note, busy]);

  const roster = pickers?.roster ?? [];
  const candidates = pickers?.candidates ?? [];
  const myName = user?.display_name?.trim() || user?.email || "You";

  return (
    <Screen>
      <ScreenHeader title="Assign" backTo="/library" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>ASSIGN{entry ? ` · ${entry.kind.toUpperCase()}` : ""}</Text>
        <Text style={styles.title}>{entry?.name ?? "…"}</Text>
        <Text style={styles.lede}>
          Pick who plays this board, and who gives feedback on it. Each learner gets their
          own copy; each reviewer gets their own feedback thread with them.
        </Text>

        {error && (
          <Pressable onPress={() => setError(null)}>
            <Text style={styles.errorBanner}>{error}</Text>
          </Pressable>
        )}

        <Text style={styles.sectionLabel}>WHO PLAYS IT</Text>
        {roster.length === 0 && (
          <Text style={styles.emptyBox}>
            Nobody has hired you yet — learners appear here once they pick you as their
            coach.
          </Text>
        )}
        {roster.map((l) => {
          const on = learners.has(l.user_id);
          return (
            <Pressable
              key={l.user_id}
              onPress={() => toggle(learners, l.user_id, setLearners)}
              style={({ pressed }) => [styles.pickCard, pressed && styles.pressed]}
            >
              <View style={[styles.checkbox, on && styles.checkboxOn]}>
                {on ? <Text style={styles.checkboxTick}>✓</Text> : null}
              </View>
              <Text style={styles.pickName}>{l.name ?? l.email ?? "Learner"}</Text>
            </Pressable>
          );
        })}

        <Text style={styles.sectionLabel}>WHO REVIEWS IT</Text>
        {/* The creator is a FIXED row — always a reviewer at create time. */}
        <View style={[styles.pickCard, { backgroundColor: Brand.maroon }]}>
          <Text style={[styles.pickName, { flex: 1 }]}>{myName}</Text>
          <Text style={styles.creatorBadge}>you · creator</Text>
        </View>
        <Text style={styles.hint}>You&apos;ll always get a feedback thread with each learner.</Text>

        {candidates.length === 0 ? (
          <Text style={styles.emptyBox}>
            No other coaches in this program yet — you&apos;re the only reviewer.
          </Text>
        ) : !showReviewers ? (
          <Pressable
            onPress={() => setShowReviewers(true)}
            style={({ pressed }) => [styles.foldButton, pressed && styles.pressed]}
          >
            <Text style={styles.foldButtonText}>+ Add another reviewer ▾</Text>
          </Pressable>
        ) : (
          <>
            <Text style={styles.hint}>
              Each reviewer you add gets their own feedback thread with every learner on
              this assignment.
            </Text>
            {candidates.map((c) => {
              const on = reviewers.has(c.reviewerId);
              return (
                <Pressable
                  key={c.reviewerId}
                  onPress={() => toggle(reviewers, c.reviewerId, setReviewers)}
                  style={({ pressed }) => [styles.pickCard, pressed && styles.pressed]}
                >
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on ? <Text style={styles.checkboxTick}>✓</Text> : null}
                  </View>
                  <Text style={[styles.pickName, { flex: 1 }]}>{c.name}</Text>
                  {c.detail ? <Text style={styles.pickDetail}>{c.detail}</Text> : null}
                </Pressable>
              );
            })}
          </>
        )}

        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Optional instruction — e.g. focus on your opening lead"
          placeholderTextColor="rgba(31,31,31,0.35)"
          multiline
        />

        <Pressable
          onPress={assign}
          disabled={busy}
          style={({ pressed }) => [
            styles.assignButton,
            busy && { opacity: 0.4 },
            pressed && { opacity: 0.75 },
          ]}
        >
          {/* One label, true on both paths — the intro carries the nuance. */}
          <Text style={styles.assignButtonText}>{busy ? "Assigning…" : "Assign board"}</Text>
        </Pressable>
      </ScrollView>

      <TabLoading ready={(entry !== null && pickers !== null) || error !== null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 2.6,
    color: "#a49d8e",
    marginTop: 4,
  },
  title: { fontFamily: Fonts.display, fontSize: 24, color: Brand.ink, marginTop: 6 },
  lede: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 20, color: "#5e5749", marginTop: 8 },
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
  sectionLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 2.2,
    color: "#a49d8e",
    marginTop: 22,
    marginBottom: 4,
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
    marginTop: 8,
  },
  hint: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18, color: "#7b7466", marginTop: 6 },

  pickCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Brand.green,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 10,
  },
  pickName: { fontFamily: Fonts.bodySemibold, fontSize: 15, color: Brand.white },
  pickDetail: { fontFamily: Fonts.body, fontSize: 11.5, color: "rgba(255,244,215,0.72)" },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Brand.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: Brand.cream },
  checkboxTick: { fontSize: 13, lineHeight: 15, color: Brand.green, fontFamily: Fonts.bodySemibold },
  creatorBadge: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    color: Brand.maroon,
    backgroundColor: Brand.cream,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: "hidden",
  },

  foldButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#d3ccbb",
    backgroundColor: Brand.white,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 10,
  },
  foldButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: Brand.ink },

  noteInput: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: Brand.ink,
    backgroundColor: Brand.white,
    borderWidth: 1,
    borderColor: "#d3ccbb",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    minHeight: 56,
    marginTop: 14,
  },
  assignButton: {
    alignSelf: "flex-start",
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 14,
  },
  assignButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.white },

  pressed: { opacity: 0.8 },
});
