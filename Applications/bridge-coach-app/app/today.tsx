// Today — the role-aware feed that used to be the Home tab before the
// BirdBridge tree replaced it. Nothing here changed behaviourally: learners see
// what their coach sent, coaches see what needs their attention. Reachable from
// the menu (☰) so none of it was lost in the redesign.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { OptionCard, Screen, ScreenHeader } from "../components/ui";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { getBridgeContextCached, isCoach } from "../lib/bridge-role";
import { prefetchLaunch } from "../lib/launch-cache";
import { fetchBridgeSummary, type BridgeSummary } from "../lib/nexus";

export default function TodayScreen() {
  const { user, token } = useAuth();
  const [coach, setCoach] = useState(false);
  const [summary, setSummary] = useState<BridgeSummary | null>(null);

  const firstName = user?.display_name?.split(" ")[0];

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
      prefetchLaunch(token, "bridge");
      let cancelled = false;
      fetchBridgeSummary(token)
        .then((s) => {
          if (!cancelled) setSummary(s);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [token]),
  );

  const s = summary;
  const learnerCaughtUp = s && s.assignments_open === 0 && s.plays_reviewed === 0;
  const coachCaughtUp = s && s.reviews_pending === 0;

  return (
    <Screen>
      <ScreenHeader title="Today" backTo="/home" />
      <View style={styles.inner}>
        <View style={styles.headerBlock}>
          <Text style={styles.title}>
            Welcome back{firstName ? `, ${firstName}` : ""}! 👋
          </Text>
          {!coach && (
            <Pressable onPress={() => router.push("/coaches")} hitSlop={8}>
              <Text style={styles.coachLine}>
                {s?.coach ? `Coached by ${s.coach.name}` : "No coach yet — hire one"}
                <Text style={styles.coachLinkHint}>  ›</Text>
              </Text>
            </Pressable>
          )}
          {coach && (
            <Text style={styles.coachLine}>
              {s
                ? `${s.roster_count} learner${s.roster_count === 1 ? "" : "s"} on your roster`
                : " "}
            </Text>
          )}
        </View>

        <View style={styles.options}>
          <Text style={styles.sectionLabel}>Today</Text>

          {coach ? (
            <>
              {s && s.reviews_pending > 0 && (
                <OptionCard
                  title={`${s.reviews_pending} play${s.reviews_pending === 1 ? "" : "s"} awaiting review`}
                  subtitle="Your learners are waiting for feedback"
                  onPress={() => router.push("/reviews")}
                />
              )}
              {coachCaughtUp && (
                <OptionCard
                  title="All caught up"
                  subtitle="No plays waiting — assign your learners something new"
                  onPress={() => router.push("/assignments")}
                />
              )}
              <OptionCard
                title="Assignments"
                subtitle="Delegate boards and track progress"
                onPress={() => router.push("/assignments")}
              />
              <OptionCard
                title="My Learners"
                subtitle="Learners who hired you"
                onPress={() => router.push("/learners")}
              />
            </>
          ) : (
            <>
              {s && s.assignments_open > 0 && (
                <OptionCard
                  title={`${s.assignments_open} board${s.assignments_open === 1 ? "" : "s"} from your coach`}
                  subtitle="Assigned and waiting — tap to play"
                  onPress={() => router.push("/assigned")}
                />
              )}
              {s && s.plays_reviewed > 0 && (
                <OptionCard
                  title={`${s.plays_reviewed} game${s.plays_reviewed === 1 ? "" : "s"} reviewed`}
                  subtitle="Your coach left comments — take a look"
                  onPress={() => router.push("/plays")}
                />
              )}
              {learnerCaughtUp && (
                <OptionCard
                  title="All caught up"
                  subtitle="Play a board or pick up where you left off in Learn"
                  onPress={() => router.push("/play")}
                />
              )}
              <OptionCard
                title="My Games"
                subtitle="Boards you've played — send one to your coach"
                onPress={() => router.push("/plays")}
              />
            </>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerIdentity}>
            Signed in as {user?.email ?? "unknown"}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, paddingHorizontal: Spacing.screen },
  headerBlock: { paddingTop: 8, gap: 6 },
  title: { fontSize: 26, color: Colors.text, fontFamily: Fonts.display, },
  coachLine: { fontSize: 15, color: Colors.textMuted, fontFamily: Fonts.body, },
  coachLinkHint: { fontWeight: "700", color: Colors.text },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.textMuted,
    fontFamily: Fonts.heading,
  },
  options: { flex: 1, paddingTop: 24, gap: 12 },
  footer: { alignItems: "center", gap: 8, paddingBottom: 8 },
  footerIdentity: { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.body, },
});
