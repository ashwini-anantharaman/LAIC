import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { OptionCard, PrimaryButton, Screen, ScreenHeader } from "../../../components/ui";
import { Colors, Spacing } from "../../../constants/theme";
import { useAuth } from "../../../lib/auth-context";
import { prefetchLaunch } from "../../../lib/launch-cache";
import { getLearningObjects } from "../../../lib/learning";
import { LearningObject, NexusError } from "../../../lib/nexus";

export default function LearnListScreen() {
  const { token } = useAuth();
  const [cards, setCards] = useState<LearningObject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (!token) return;
      setError(null);
      try {
        const objects = await getLearningObjects(token, { refresh });
        // Boss demo scope: concept cards only. Widen to more types later.
        setCards(objects.filter((o) => o.type === "concept-card"));
      } catch (e) {
        setError(
          e instanceof NexusError && e.status === 403
            ? "Your account doesn't have access to learning content in this program."
            : "Couldn't load content. Check that the Nexus backend is running.",
        );
      }
    },
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Every time this list gains focus, make sure an unused launch token is
  // ready — tapping a card then opens the platform without a mint round-trip.
  useFocusEffect(
    useCallback(() => {
      if (token) prefetchLaunch(token, "learning");
    }, [token]),
  );

  return (
    <Screen>
      <ScreenHeader title="Learn" />

      {!cards && !error && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.text} />
        </View>
      )}

      {error && (
        <View style={styles.center}>
          <Text style={styles.stateText}>{error}</Text>
          <PrimaryButton label="Try again" onPress={() => load(true)} />
        </View>
      )}

      {cards && !error && (
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={<Text style={styles.sectionTitle}>Concept Cards</Text>}
          ListEmptyComponent={
            <Text style={styles.stateText}>
              No concept cards yet. Content published in the learning platform
              will appear here.
            </Text>
          }
          renderItem={({ item }) => (
            <OptionCard
              title={item.title}
              subtitle={_cardSubtitle(item)}
              onPress={() => router.push(`/learn/${item.id}`)}
            />
          )}
        />
      )}
    </Screen>
  );
}

function _cardSubtitle(item: LearningObject): string {
  const bits = [
    item.description,
    [item.estimated_time, item.owner_name].filter(Boolean).join(" · "),
  ].filter(Boolean);
  return bits[0] ?? "";
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
});
