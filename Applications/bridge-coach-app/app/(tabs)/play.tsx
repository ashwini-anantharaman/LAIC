// Play — a native launcher, not a library. The day's board on top, then the
// three ways into a table: pick up an unfinished board, deal a fresh one, or
// play what your coach assigned. Everything it launches is the bridge
// platform (the table itself stays an embed); this screen is only the door.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { OptionCard, Screen } from "../../components/ui";
import { Colors, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { getBridgeContextCached, isCoach } from "../../lib/bridge-role";
import { prefetchLaunch } from "../../lib/launch-cache";
import { fetchBridgeSummary, type BridgeSummary } from "../../lib/nexus";

export default function PlayScreen() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<BridgeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Assignments are something a coach GIVES, not receives — a coach's Play
  // tab is just the day's board, resume and new. Theirs live in the Coach tab.
  const [coach, setCoach] = useState(false);

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
      let cancelled = false;
      setError(null);
      fetchBridgeSummary(token)
        .then((s) => !cancelled && setSummary(s))
        .catch(() => !cancelled && setError("Couldn't load your boards."));
      return () => {
        cancelled = true;
      };
    }, [token]),
  );

  const deal = summary?.deal_of_the_day ?? null;
  const inProgress = summary?.in_progress ?? [];

  const openBoard = (sessionId: string) =>
    router.push({ pathname: "/table/[sessionId]", params: { sessionId } });

  function resume() {
    if (inProgress.length === 1) openBoard(inProgress[0]!.session_id);
    else router.push("/resume");
  }

  const dealMeta = deal
    ? [deal.dealer && `dealer ${deal.dealer}`, deal.vul && `vul ${deal.vul}`, deal.contract_label]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <Screen style={styles.screen}>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>Play</Text>
        <Text style={styles.title}>Deal of the Day</Text>
      </View>

      {/* The day's board — one for everyone in the program, until midnight. */}
      {!summary && !error && (
        <View style={styles.dealLoading}>
          <ActivityIndicator color={Colors.text} />
        </View>
      )}
      {error && <Text style={styles.stateText}>{error}</Text>}
      {summary && !deal && (
        <View style={styles.dealEmpty}>
          <Text style={styles.stateText}>
            No board today — an admin can curate a “Deal of the Day” collection in the
            library.
          </Text>
        </View>
      )}
      {deal && (
        <Pressable
          style={styles.dealCard}
          onPress={() =>
            router.push({ pathname: "/play-board/[entryId]", params: { entryId: deal.entry_id } })
          }
        >
          <Text style={styles.dealName}>{deal.name ?? "Today's board"}</Text>
          {!!dealMeta && <Text style={styles.dealMeta}>{dealMeta}</Text>}
          <Text style={styles.dealCta}>Play today's board →</Text>
        </Pressable>
      )}

      <View style={styles.options}>
        <OptionCard
          title="Resume"
          subtitle={
            inProgress.length === 0
              ? "No unfinished boards"
              : inProgress.length === 1
                ? `Continue “${inProgress[0]!.board_name}”`
                : `${inProgress.length} unfinished boards`
          }
          onPress={inProgress.length === 0 ? () => {} : resume}
        />
        <OptionCard
          title="New"
          subtitle="Deal a fresh board against the house"
          onPress={() => router.push("/new-board")}
        />
        {!coach && (
          <OptionCard
            title="Coach's Assignments"
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
  dealLoading: { paddingVertical: 34, alignItems: "center" },
  dealEmpty: {
    marginTop: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d3ccbb",
    borderRadius: 14,
    padding: 16,
  },
  dealCard: {
    marginTop: 16,
    backgroundColor: "#1f5e56",
    borderRadius: 16,
    padding: 18,
    gap: 4,
  },
  dealName: { fontSize: 18, color: "#fff", fontFamily: Fonts.display, },
  dealMeta: { fontSize: 12.5, color: "rgba(255,255,255,.75)", fontFamily: Fonts.body, },
  dealCta: { marginTop: 8, fontSize: 13, color: "#ffe6a7", fontFamily: Fonts.heading, },
  options: { flex: 1, paddingTop: 24, gap: 12, paddingBottom: TAB_BAR_CLEARANCE },
  stateText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 21,
    fontFamily: Fonts.body,
  },
});
