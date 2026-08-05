// Pick which unfinished board to continue — shown only when there's more than
// one (a single one resumes straight from Play).

import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { OptionCard, Screen, ScreenHeader } from "../components/ui";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { fetchBridgeSummary, type InProgressBoard } from "../lib/nexus";

export default function ResumeScreen() {
  const { token } = useAuth();
  const [boards, setBoards] = useState<InProgressBoard[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      fetchBridgeSummary(token)
        .then((s) => !cancelled && setBoards(s.in_progress))
        .catch(() => !cancelled && setBoards([]));
      return () => {
        cancelled = true;
      };
    }, [token]),
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
