// Coach — the relationship tab, role-aware like Home. A learner sees who
// coaches them and the state of their feedback; a coach sees who needs them.
// Both are launchers into the platform surfaces that already exist.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { OptionCard, Screen } from "../../components/ui";
import { Brand, Colors, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { getBridgeContextCached, isCoach, peekRoleContext } from "../../lib/bridge-role";
import { type BridgeSummary } from "../../lib/nexus";
import { prewarmBridgePages } from "../../lib/prewarm";
import { peekSummary, refreshSummary } from "../../lib/summary-cache";

export default function CoachScreen() {
  const { token } = useAuth();
  // Both caches are primed at sign-in — seed from them so the first focus
  // shows the real view (and the coach's name below) with no fetch in front.
  const [coach, setCoach] = useState(() => isCoach(token ? peekRoleContext(token) : null));
  // Last known summary renders immediately; the focus effect refreshes it.
  const [summary, setSummary] = useState<BridgeSummary | null>(() =>
    token ? peekSummary(token) : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    getBridgeContextCached(token).then((ctx) => {
      if (!cancelled) setCoach(isCoach(ctx));
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      // Warm the screens this tab's cards open (role decides which are shown,
      // but warming both costs one idempotent GET each).
      prewarmBridgePages(["/m/reviews", "/m/plays", "/m/library/new"]);
      let cancelled = false;
      refreshSummary(token)
        .then((s) => !cancelled && setSummary(s))
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [token]),
  );

  const s = summary;

  // A null summary is UNKNOWN, not "no coach": the first resolve may still be
  // on the wire (sign-in primes it, but a fast tap can beat the round-trip).
  // Asserting "No coach yet" during that window shows a wrong fact that then
  // corrects itself in front of the learner — say nothing until we know.
  return (
    <Screen style={styles.screen}>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>{coach ? "Coaching" : "Your coach"}</Text>
        <Text style={styles.title}>
          {s === null
            ? "…"
            : coach
              ? `${s.roster_count} learner${s.roster_count === 1 ? "" : "s"}`
              : (s.coach?.name ?? "No coach yet")}
        </Text>
        <Text style={styles.subtitle}>
          {s === null
            ? "Loading…"
            : coach
              ? "Review their plays, delegate boards, and follow each learner."
              : s.coach
                ? "They review the boards you send and leave feedback."
                : "Hire a coach to get feedback on the boards you play."}
        </Text>
        {/* Coach-only quick action, riding the header's top-right corner —
            the full flow (deal a board → pick learners) lives one tap in.
            LAST child + zIndex ON PURPOSE: the header texts are full-width
            boxes that overlap this corner, and whichever sibling stacks
            higher wins the click — as an earlier sibling this button was
            losing presses to invisible text (reported 2026-08-07 as "have to
            click different places before it works"). */}
        {coach && (
          <Pressable
            onPress={() => router.push("/create-assignment")}
            accessibilityRole="button"
            accessibilityLabel="Create assignment"
            // The pill is visually small; the finger's target is not — the
            // press area extends well past the paint on every side.
            hitSlop={14}
            style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed]}
          >
            <Text style={styles.createBtnText}>+ Create Assignment</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.options}>
        {coach ? (
          <>
            <OptionCard
              title="Reviews"
              subtitle={
                s === null
                  ? "…"
                  : s.reviews_pending > 0
                    ? `${s.reviews_pending} play${s.reviews_pending === 1 ? "" : "s"} awaiting review`
                    : "No plays waiting"
              }
              onPress={() => router.push("/reviews")}
            />
            <OptionCard
              title="My Learners"
              subtitle="Open a learner's history and feedback"
              onPress={() => router.push("/learners")}
            />
            <OptionCard
              title="Assignments"
              subtitle="Boards you've delegated, and who has finished"
              onPress={() => router.push("/assignments")}
            />
          </>
        ) : (
          <>
            <OptionCard
              // Unknown biases to "My Coach" — most learners here have one, so
              // that label is right far more often than "Hire a Coach" during
              // the loading beat, and both open the same screen anyway.
              title={s && !s.coach ? "Hire a Coach" : "My Coach"}
              subtitle={
                s === null
                  ? "…"
                  : s.coach
                    ? `${s.coach.name} — tap to view or switch`
                    : "Browse coaches"
              }
              onPress={() => router.push("/coaches")}
            />
            <OptionCard
              title="Feedback"
              subtitle={
                s === null
                  ? "…"
                  : s.plays_reviewed > 0
                    ? `${s.plays_reviewed} game${s.plays_reviewed === 1 ? "" : "s"} reviewed`
                    : "Reviewed games appear here"
              }
              onPress={() => router.push("/plays")}
            />
            <OptionCard
              title="Assignments"
              subtitle={
                s === null
                  ? "…"
                  : s.assignments_open > 0
                    ? `${s.assignments_open} waiting for you`
                    : "Boards your coach sent you"
              }
              onPress={() => router.push("/assigned")}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: Spacing.screen },
  headerBlock: { paddingTop: 32, gap: 4 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.textMuted,
    fontFamily: Fonts.heading,
  },
  title: { fontSize: 26, color: Colors.text, fontFamily: Fonts.display, },
  createBtn: {
    position: "absolute",
    right: 0,
    top: 30,
    zIndex: 10,
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  createBtnPressed: { opacity: 0.75 },
  createBtnText: { fontSize: 13, color: Brand.cream, fontFamily: Fonts.heading },
  subtitle: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, fontFamily: Fonts.body, },
  options: { flex: 1, paddingTop: 24, gap: 12, paddingBottom: TAB_BAR_CLEARANCE },
});
