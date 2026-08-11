// Pick which unfinished board to continue — shown only when there's more than
// one (a single one resumes straight from Play).

import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { OptionCard, Screen, ScreenHeader } from "../components/ui";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { type InProgressBoard } from "../lib/nexus";
import { peekSummary, refreshSummary } from "../lib/summary-cache";
import { useClubs } from "../lib/club-context";

export default function ResumeScreen() {
  const { token } = useAuth();
  // The selected club scopes every bridge read here (null = app-wide). While
  // clubs are LOADING the scope is unknown, so the effects below fetch nothing
  // yet: firing early asked about the app-wide program, a guaranteed 403 for a
  // club-only account, paid in full before the real fetch could start.
  const { selected, loading: clubsLoading } = useClubs();
  const clubId = selected?.programId ?? null;
  // Last known list renders immediately; the focus effect refreshes it.
  const [boards, setBoards] = useState<InProgressBoard[] | null>(() =>
    token ? (peekSummary(token, clubId ?? undefined)?.in_progress ?? null) : null,
  );

  useFocusEffect(
    useCallback(() => {
      if (!token || clubsLoading) return;
      let cancelled = false;
      refreshSummary(token, clubId ?? undefined)
        .then((s) => !cancelled && setBoards(s.in_progress))
        .catch(() => !cancelled && setBoards((b) => b ?? []));
      return () => {
        cancelled = true;
      };
    }, [token, clubId, clubsLoading]),
  );

  return (
    <Screen>
      <ScreenHeader title="Resume a board" />
      {!boards && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.text} />
        </View>
      )}
      {boards && (
        <View style={styles.list}>
          {boards.map((b, i) => (
            <OptionCard
              key={b.session_id}
              index={i}
              title={b.board_name}
              subtitle={b.updated_at ? `last played ${b.updated_at.slice(0, 10)}` : "in progress"}
              onPress={() =>
                router.push({ pathname: "/table/[sessionId]", params: { sessionId: b.session_id } })
              }
            />
          ))}
          {boards.length === 0 && (
            <Text style={styles.stateText}>
              Nothing unfinished — deal a new board from Play.
            </Text>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: Spacing.screen, paddingTop: 8, gap: 12 },
  stateText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    paddingTop: 24,
    fontFamily: Fonts.body,
  },
});
