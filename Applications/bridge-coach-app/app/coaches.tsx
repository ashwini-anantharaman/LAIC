import { router } from "expo-router";
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
import { Colors, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { Coach, fetchCoaches, fetchMyCoach, hireCoach, NexusError } from "../lib/nexus";

/** Learner: browse the program's coaches and hire (or switch to) one. */
export default function CoachesScreen() {
  const { token } = useAuth();
  const [coaches, setCoaches] = useState<Coach[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [list, mine] = await Promise.all([
        fetchCoaches(token),
        fetchMyCoach(token),
      ]);
      setCoaches(list);
      setCurrentId(mine?.coach_id ?? null);
    } catch {
      setError("Couldn't load the coaches. Check that the backend is running.");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = coaches?.find((co) => co.coach_id === selectedId);
  const isSwitch = currentId !== null;

  const handleHire = async () => {
    if (!token || !selected) return;
    setError(null);
    setSubmitting(true);
    try {
      await hireCoach(token, selected.coach_id);
      router.back();
    } catch (e) {
      setError(
        e instanceof NexusError
          ? e.message
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title={isSwitch ? "My Coach" : "Hire a Coach"} />

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
                {isSwitch
                  ? "You can switch coaches at any time — your new coach sees your plays from then on."
                  : "Pick a coach. They'll see the plays you send them and can assign you boards to practice."}
              </Text>
            }
            ListEmptyComponent={
              <Text style={styles.stateText}>
                No coaches in the program yet. Check back soon.
              </Text>
            }
            renderItem={({ item }) => {
              const isCurrent = item.coach_id === currentId;
              return (
                <OptionCard
                  title={item.name}
                  subtitle={
                    isCurrent
                      ? "Your current coach"
                      : `${item.learner_count} learner${item.learner_count === 1 ? "" : "s"}`
                  }
                  selected={selectedId === item.coach_id || (isCurrent && !selectedId)}
                  onPress={() => setSelectedId(isCurrent ? null : item.coach_id)}
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
                    ? `${isSwitch ? "Switch to" : "Hire"} ${selected.name}`
                    : isSwitch
                      ? "Pick a coach to switch"
                      : "Pick a coach"
              }
              disabled={!selected || submitting}
              onPress={handleHire}
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
  },
  separator: {
    height: 12,
  },
  stateText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  actions: {
    paddingHorizontal: Spacing.screen,
    paddingBottom: 24,
  },
});
