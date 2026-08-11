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
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from "react-native";

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
import { useSelectedClubId } from "../../../lib/club-context";
import { prefetchLaunch } from "../../../lib/launch-cache";
import { getLearningObjects } from "../../../lib/learning";
import { LearningObject, NexusError } from "../../../lib/nexus";

/** Placeholder shelf — clearly not real data. See the note above. */
const SAMPLE_LESSONS = [
  { title: "Bridge Fundamentals", author: "Coach Miland", chapters: 10 },
  { title: "Bridge Intermediate", author: "Coach Miland", chapters: 12 },
  { title: "Bridge Advanced", author: "Coach Miland", chapters: 10 },
] as const;

/** The Studio's type ids, as a learner would read them. */
const TYPE_LABELS: Record<string, string> = {
  "tutorial-v2": "Tutorial",
  tutorial: "Tutorial",
  quiz: "Quiz",
  "flashcard-set": "Flashcards",
  "concept-card": "Concept",
  summary: "Summary",
  reflection: "Reflection",
  scenario: "Scenario",
  assignment: "Assignment",
  drill: "Drill",
  lesson: "Lesson",
};

/** Unknown types show their own id rather than being hidden or mislabelled. */
function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

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
  // The library belongs to the club being viewed. Asking about the app-wide
  // program answers "no access" for a club's people, who are not in it — which is
  // exactly the 403 this screen used to show.
  const clubId = useSelectedClubId();
  const [cards, setCards] = useState<LearningObject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (!token) return;
      setError(null);
      try {
        // EVERY authored type, not just concept cards: the Studio publishes
        // tutorials, quizzes, flashcard sets and concept cards, and filtering to
        // one of them left most of the library invisible. The server already
        // orders by updated_at desc, so the newest content deals first.
        setCards(await getLearningObjects(token, { refresh, ...(clubId ? { programId: clubId } : {}) }));
      } catch (e) {
        // Show the SERVER'S own 403 reason. It distinguishes "this feature is not
        // enabled for the program" (a Features toggle on the club) from "your role
        // does not grant access" (a role grant) — two different fixes that the old
        // single message flattened into one, sending anyone who hit it looking in
        // the wrong place.
        setError(
          e instanceof NexusError && e.status === 403
            ? `${e.message} (learning access for this club)`
            : "Couldn't load content. Check that the Nexus backend is running.",
        );
      }
    },
    [token, clubId],
  );

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Refetch when the app comes back to the foreground.
   *
   * Content is authored elsewhere while this app sits in the background, so the
   * list it holds is stale by the time someone returns to it. Coming back is
   * exactly the moment to re-read — and it costs one request, unlike polling.
   */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load(true);
    });
    return () => sub.remove();
  }, [load]);

  // Keep an unused launch token warm so tapping a card opens the platform
  // without a mint round-trip.
  useFocusEffect(
    useCallback(() => {
      if (token) prefetchLaunch(token, "learning", clubId ?? undefined);
      // Returning to the tab re-reads as well: content added since the last look
      // should be here without a restart.
      void load(true);
    }, [token, clubId, load]),
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
                // What a learner chooses on: what kind of thing it is, and how
                // long it takes. Both are optional in the data, so the footer is
                // whatever is actually known.
                footer={
                  <Text style={styles.cardFooter}>
                    {[typeLabel(item.type), item.estimated_time].filter(Boolean).join(" · ")}
                  </Text>
                }
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
