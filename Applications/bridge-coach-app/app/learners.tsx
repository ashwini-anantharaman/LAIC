import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { OptionCard, PrimaryButton, Screen, ScreenHeader } from "../components/ui";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { useSelectedClubId } from "../lib/club-context";
import {
  fetchProgramLearners,
  NexusError,
  ProgramLearner,
} from "../lib/nexus";

/** Coach view: the coach's HIRED roster (owner direction 2026-08-11, second
 *  pass: subscription happens through Hire a Coach, in clubs exactly as in
 *  the main program — never implicitly by club membership). Asked about the
 *  selected club so a club coach sees their own club's hires. */
export default function LearnersScreen() {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const [learners, setLearners] = useState<ProgramLearner[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setLearners(await fetchProgramLearners(token, clubId ?? undefined));
    } catch (e) {
      setError(
        e instanceof NexusError && e.status === 403
          ? "Your account doesn't have coach access to this program."
          : "Couldn't load the learner roster. Check that the backend is running.",
      );
    }
  }, [token, clubId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen>
      <ScreenHeader title="My Learners" />

      {!learners && !error && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.text} />
        </View>
      )}

      {error && (
        <View style={styles.center}>
          <Text style={styles.stateText}>{error}</Text>
          <PrimaryButton label="Try again" onPress={load} />
        </View>
      )}

      {learners && !error && (
        <FlatList
          data={learners}
          keyExtractor={(item, i) => item.user_id ?? item.email ?? String(i)}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            learners.length > 0 ? (
              <Text style={styles.sectionTitle}>
                {learners.length} learner{learners.length === 1 ? "" : "s"} on
                your roster
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.stateText}>
              No learners have hired you yet. When a learner picks you as their
              coach, they appear here.
            </Text>
          }
          renderItem={({ item, index }) => (
            <OptionCard
              index={index}
              title={item.name || item.email || "Unnamed learner"}
              subtitle={[item.email, _joined(item.joined_at)]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => {
                if (item.user_id)
                  router.push({ pathname: "/learner/[id]", params: { id: item.user_id } });
              }}
            />
          )}
        />
      )}
    </Screen>
  );
}

function _joined(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : `joined ${d.toISOString().slice(0, 10)}`;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingHorizontal: Spacing.screen,
  },
  list: {
    paddingHorizontal: Spacing.screen,
    paddingTop: 8,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
    fontFamily: Fonts.heading,
  },
  separator: {
    height: 12,
  },
  stateText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    fontFamily: Fonts.body,
  },
});
