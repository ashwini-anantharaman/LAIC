// Play — a native launcher, not a library. The ways into a table: pick up an
// unfinished board, deal a fresh one, revisit a finished one, or play what
// your coach assigned. Everything it launches is the bridge platform (the
// table itself stays an embed); this screen is only the door.
//
// "Deal of the Day" used to sit on top; removed 2026-08-07 (owner decision).
// The summary still carries it, so bringing it back is a render, not a
// backend change.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { OptionCard, Screen } from "../../components/ui";
import { Colors, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { getBridgeContextCached, isCoach, peekRoleContext } from "../../lib/bridge-role";
import { prefetchLaunch } from "../../lib/launch-cache";
import { type BridgeSummary } from "../../lib/nexus";
import { prewarmBridgePages } from "../../lib/prewarm";
import { peekSummary, refreshSummary } from "../../lib/summary-cache";

export default function PlayScreen() {
  const { token } = useAuth();
  // Last known summary renders immediately; the focus effect refreshes it.
  const [summary, setSummary] = useState<BridgeSummary | null>(() =>
    token ? peekSummary(token) : null,
  );
  const [error, setError] = useState<string | null>(null);
  // Assignments are something a coach GIVES, not receives — a coach's Play
  // tab is just the day's board, resume and new. Theirs live in the Coach tab.
  // Seeded from the sign-in prime; false only before the first resolve.
  const [coach, setCoach] = useState(() => isCoach(token ? peekRoleContext(token) : null));

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

  // Refresh on every visit: what's resumable changes as boards are played.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      prefetchLaunch(token, "bridge"); // keep a launch warm — one tap away
      // Warm the screens this tab's cards open, so tapping one lands on a
      // warm function instead of a cold start.
      prewarmBridgePages(["/m/assigned", "/m/plays", "/welcome"]);
      let cancelled = false;
      setError(null);
      refreshSummary(token)
        .then((s) => !cancelled && setSummary(s))
        // A failed refresh with stale data on screen stays silent — the
        // stale summary beats an error banner.
        .catch(() => !cancelled && !peekSummary(token) && setError("Couldn't load your boards."));
      return () => {
        cancelled = true;
      };
    }, [token]),
  );

  const inProgress = summary?.in_progress ?? [];

  const openBoard = (sessionId: string) =>
    router.push({ pathname: "/table/[sessionId]", params: { sessionId } });

  function resume() {
    if (inProgress.length === 1) openBoard(inProgress[0]!.session_id);
    else router.push("/resume");
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>Play</Text>
        <Text style={styles.title}>Your boards</Text>
      </View>

      {error && <Text style={styles.stateText}>{error}</Text>}

      <View style={styles.options}>
        <OptionCard
          title="Resume"
          // The count lives in the cream circle, not a sentence (owner
          // request 2026-08-07).
          badge={inProgress.length}
          onPress={inProgress.length === 0 ? () => {} : resume}
        />
        <OptionCard
          title="New"
          subtitle="Deal a fresh board against the house"
          onPress={() => router.push("/new-board")}
        />
        {/* MOVED HERE from the ☰ menu (owner decision 2026-08-07): finished
            boards belong beside the ones you're still playing, not in a
            drawer. Both roles get it — a coach plays boards too. */}
        <OptionCard
          title="My Games"
          subtitle={
            summary && summary.plays_reviewed > 0
              ? `Boards you've finished — ${summary.plays_reviewed} reviewed`
              : "Boards you've finished — send one for feedback"
          }
          onPress={() => router.push("/plays")}
        />
        {!coach && (
          <OptionCard
            title="From Coach"
            subtitle={
              summary && summary.assignments_open > 0
                ? `${summary.assignments_open} waiting for you`
                : "Boards your coach sent you"
            }
            onPress={() => router.push("/assigned")}
          />
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
  options: { flex: 1, paddingTop: 24, gap: 12, paddingBottom: TAB_BAR_CLEARANCE },
  stateText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 21,
    fontFamily: Fonts.body,
  },
});
