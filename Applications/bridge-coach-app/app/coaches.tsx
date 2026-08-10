import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  ErrorText,
  OptionCard,
  PrimaryButton,
  Screen,
  ScreenHeader,
} from "../components/ui";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import {
  Coach,
  fetchCoaches,
  fetchMyCoaches,
  hireCoach,
  NexusError,
  removeCoach,
} from "../lib/nexus";
import { clearSummaryCache, refreshSummary } from "../lib/summary-cache";

/**
 * Learner: browse the program's coaches and hire AS MANY as they like
 * (owner direction 2026-08-09) — each game is later sent to a coach of the
 * learner's choosing, never to all of them. Tapping a coach selects them;
 * the button hires, or parts ways with one already on the list. The screen
 * stays put after either action, so several hires are a few taps, not a
 * round trip each.
 */
export default function CoachesScreen() {
  const { token } = useAuth();
  const [coaches, setCoaches] = useState<Coach[] | null>(null);
  const [hiredIds, setHiredIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [list, mine] = await Promise.all([
        fetchCoaches(token),
        fetchMyCoaches(token),
      ]);
      setCoaches(list);
      setHiredIds(new Set(mine.map((co) => co.coach_id)));
    } catch {
      setError("Couldn't load the coaches. Check that the backend is running.");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = coaches?.find((co) => co.coach_id === selectedId);
  const selectedHired = selected ? hiredIds.has(selected.coach_id) : false;

  const act = async () => {
    if (!token || !selected) return;
    setError(null);
    setSubmitting(true);
    try {
      if (selectedHired) await removeCoach(token, selected.coach_id);
      else await hireCoach(token, selected.coach_id);
      // The Coach tab's header and My Games' send-picker read the summary —
      // make both see this change on their next look.
      clearSummaryCache();
      refreshSummary(token).catch(() => {});
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(
        e instanceof NexusError
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      {/* Not "My Coaches" any more — the Coach tab IS the learner's coaches
          now, and two screens claiming that name is the confusion this
          redesign removes. This one is where you add and drop them. */}
      <ScreenHeader title={hiredIds.size > 0 ? "Manage Coaches" : "Hire a Coach"} />

      {!coaches && !error && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.text} />
        </View>
      )}

      {coaches && (
        <>
          <FlatList
            data={coaches}
            keyExtractor={(item) => item.coach_id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListHeaderComponent={
              <Text style={styles.intro}>
                {hiredIds.size > 0
                  ? "Hire as many coaches as you like — when you send a game for feedback, you choose which coach gets it."
                  : "Pick a coach. They'll see the plays you send them and can assign you boards to practice. You can hire more than one."}
              </Text>
            }
            ListEmptyComponent={
              <Text style={styles.stateText}>
                No coaches in the program yet. Check back soon.
              </Text>
            }
            renderItem={({ item, index }) => {
              const hired = hiredIds.has(item.coach_id);
              return (
                <OptionCard
                  index={index}
                  // The name is a person's name, never a string to decorate:
                  // the subtitle below already says they're hired.
                  title={item.name}
                  subtitle={
                    hired
                      ? "Your coach — tap to manage"
                      : `${item.learner_count} learner${item.learner_count === 1 ? "" : "s"}`
                  }
                  selected={selectedId === item.coach_id}
                  onPress={() =>
                    setSelectedId(selectedId === item.coach_id ? null : item.coach_id)
                  }
                />
              );
            }}
          />

          <View style={styles.actions}>
            <ErrorText message={error} />
            <PrimaryButton
              label={
                submitting
                  ? "Saving…"
                  : selected
                    ? selectedHired
                      ? `Part with ${selected.name}`
                      : `Hire ${selected.name}`
                    : hiredIds.size > 0
                      ? "Pick a coach to hire or manage"
                      : "Pick a coach"
              }
              disabled={!selected || submitting}
              onPress={act}
            />
          </View>
        </>
      )}

      {error && !coaches && (
        <View style={styles.center}>
          <Text style={styles.stateText}>{error}</Text>
          <PrimaryButton label="Try again" onPress={load} />
        </View>
      )}
    </Screen>
  );
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
    paddingBottom: 12,
  },
  intro: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 21,
    marginBottom: 16,
    fontFamily: Fonts.body,
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
  actions: {
    paddingHorizontal: Spacing.screen,
    paddingBottom: 24,
  },
});
