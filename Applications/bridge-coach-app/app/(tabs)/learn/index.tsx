// Learn — two horizontal decks of playing cards (Figma 476:663).
//
// "Concept Cards" is REAL: the same learning objects this screen always fetched,
// now dealt as cards instead of listed as rows, and still opening the platform's
// reader on tap. Loading / error / empty states are preserved.
//
// "Browse Lessons" is a design-only shelf — the Nexus API has no lessons,
// chapters or coach-authored courses — so SAMPLE_LESSONS below is placeholder
// content. Nothing on screen says so (by request), so keep that in mind before
// wiring anything to it.

import { router, useFocusEffect } from "expo-router";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandChrome } from "../../../components/brand-chrome";
import { CARD, PlayingCard } from "../../../components/playing-card";
import { PrimaryButton } from "../../../components/ui";
import {
  Brand,
  Colors,
  Fonts,
  Spacing,
  TAB_BAR_CLEARANCE,
  Type,
} from "../../../constants/theme";
import { useAuth } from "../../../lib/auth-context";
import { prefetchLaunch } from "../../../lib/launch-cache";
import { getLearningObjects } from "../../../lib/learning";
import { LearningObject, NexusError } from "../../../lib/nexus";

/** Placeholder shelf — clearly not real data. See the note above. */
const SAMPLE_LESSONS = [
  { title: "Bridge Fundamentals", author: "Coach Miland", chapters: 10 },
  { title: "Bridge Intermediate", author: "Coach Miland", chapters: 12 },
  { title: "Bridge Advanced", author: "Coach Miland", chapters: 10 },
] as const;

function SectionHeading({ children }: { children: string }) {
  return <Text style={styles.sectionHeading}>{children}</Text>;
}

/** One horizontally scrolling deck. */
function Deck({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.deck}
      decelerationRate="fast"
      // Cards snap so a swipe lands on a card edge rather than mid-card.
      snapToInterval={CARD.width + CARD.gap}
      snapToAlignment="start"
    >
      {children}
    </ScrollView>
  );
}

export default function LearnScreen() {
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

  // Keep an unused launch token warm so tapping a card opens the platform
  // without a mint round-trip.
  useFocusEffect(
    useCallback(() => {
      if (token) prefetchLaunch(token, "learning");
    }, [token]),
  );

  return (
    <BrandChrome>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Learn</Text>

        <SectionHeading>Concept Cards</SectionHeading>

        {!cards && !error && (
          <View style={styles.state}>
            <ActivityIndicator color={Brand.maroon} />
          </View>
        )}

        {error && (
          <View style={styles.state}>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => load(true)} />
          </View>
        )}

        {cards && !error && cards.length === 0 && (
          <Text style={styles.stateText}>
            No concept cards yet. Content published in the learning platform will
            appear here.
          </Text>
        )}

        {cards && !error && cards.length > 0 && (
          <Deck>
            {cards.map((item, i) => (
              <PlayingCard
                key={item.id}
                index={i}
                title={item.title}
                body={item.description ?? undefined}
                onPress={() => router.push(`/learn/${item.id}`)}
              />
            ))}
          </Deck>
        )}

        <SectionHeading>Browse Lessons</SectionHeading>
        <Deck>
          {SAMPLE_LESSONS.map((lesson, i) => (
            <PlayingCard
              key={lesson.title}
              index={i}
              title={lesson.title}
              body={`Created by\n${lesson.author}`}
              footer={<Text style={styles.cardFooter}>{lesson.chapters} Chapters</Text>}
            />
          ))}
        </Deck>
      </ScrollView>
    </BrandChrome>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: TAB_BAR_CLEARANCE },
  title: {
    fontFamily: Fonts.display,
    fontSize: Type.screenTitle,
    color: Brand.ink,
    paddingHorizontal: Spacing.screen,
  },
  sectionHeading: {
    fontFamily: Fonts.heading,
    fontSize: Type.sectionHeading,
    color: Brand.ink,
    paddingHorizontal: Spacing.screen,
    paddingTop: 28,
  },
  deck: {
    paddingHorizontal: Spacing.screen,
    paddingTop: 16,
    gap: CARD.gap,
  },
  cardFooter: {
    fontFamily: Fonts.body,
    fontSize: Type.cardBody,
    color: Brand.white,
    marginTop: 10,
  },
  state: {
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    paddingHorizontal: Spacing.screen,
    paddingTop: 40,
  },
  stateText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: Spacing.screen,
    paddingTop: 12,
  },
});
