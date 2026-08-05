// Coach — the relationship tab, role-aware like Home. A learner sees who
// coaches them and the state of their feedback; a coach sees who needs them.
// Both are launchers into the platform surfaces that already exist.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { OptionCard, Screen } from "../../components/ui";
import { Colors, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { getBridgeContextCached, isCoach } from "../../lib/bridge-role";
import { fetchBridgeSummary, type BridgeSummary } from "../../lib/nexus";

export default function CoachScreen() {
  const { token } = useAuth();
  const [coach, setCoach] = useState(false);
  const [summary, setSummary] = useState<BridgeSummary | null>(null);

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
      let cancelled = false;
      fetchBridgeSummary(token)
        .then((s) => !cancelled && setSummary(s))
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [token]),
  );

  const s = summary;

  return (
    <Screen style={styles.screen}>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>{coach ? "Coaching" : "Your coach"}</Text>
        <Text style={styles.title}>
          {coach
            ? `${s?.roster_count ?? 0} learner${s?.roster_count === 1 ? "" : "s"}`
            : (s?.coach?.name ?? "No coach yet")}
        </Text>
        <Text style={styles.subtitle}>
          {coach
            ? "Review their plays, delegate boards, and follow each learner."
            : s?.coach
              ? "They review the boards you send and leave feedback."
              : "Hire a coach to get feedback on the boards you play."}
        </Text>
      </View>

      <View style={styles.options}>
        {coach ? (
          <>
            <OptionCard
              title="Reviews"
              subtitle={
                s && s.reviews_pending > 0
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
              title={s?.coach ? "My Coach" : "Hire a Coach"}
              subtitle={s?.coach ? `${s.coach.name} — tap to view or switch` : "Browse coaches"}
              onPress={() => router.push("/coaches")}
            />
            <OptionCard
              title="Feedback"
              subtitle={
                s && s.plays_reviewed > 0
                  ? `${s.plays_reviewed} game${s.plays_reviewed === 1 ? "" : "s"} reviewed`
                  : "Reviewed games appear here"
              }
              onPress={() => router.push("/plays")}
            />
            <OptionCard
              title="Assignments"
              subtitle={
                s && s.assignments_open > 0
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
  subtitle: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, fontFamily: Fonts.body, },
  options: { flex: 1, paddingTop: 24, gap: 12, paddingBottom: TAB_BAR_CLEARANCE },
});
