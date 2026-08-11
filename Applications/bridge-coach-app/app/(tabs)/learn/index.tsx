// Learn — the Content Library dealt as horizontal decks (Figma 476:663).
//
// ONE DECK PER FOLDER (owner direction 2026-08-11): the studio's library
// folders are named for their content types — concept cards, flashcards,
// quiz, bb-tutorials — so each published type deals as its own row, titled
// like its folder, in the library's own order. A folder with nothing
// published deals no row (an empty shelf is noise, not information). Only
// PUBLISHED objects appear: drafts and in-review content are authoring
// state, which is the studio's business.
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

/**
 * Folder rows, in the library's own order. Known types get their folder's
 * display name; anything the studio adds later still deals (prettified from
 * its type id) rather than silently vanishing from Learn.
 */
const FOLDER_ROWS: readonly { type: string; title: string }[] = [
  { type: "concept-card", title: "Concept Cards" },
  { type: "flashcard-set", title: "Flashcards" },
  { type: "quiz", title: "Quiz" },
  { type: "tutorial", title: "Tutorials" },
  { type: "tutorial-v2", title: "Tutorials" },
];

function rowsFor(objects: LearningObject[]): { title: string; items: LearningObject[] }[] {
  const rows: { title: string; items: LearningObject[] }[] = [];
  const rowByTitle = new Map<string, LearningObject[]>();
  const claim = (title: string): LearningObject[] => {
    let items = rowByTitle.get(title);
    if (!items) {
      items = [];
      rowByTitle.set(title, items);
      rows.push({ title, items });
    }
    return items;
  };
  const known = new Map(FOLDER_ROWS.map((r) => [r.type, r.title]));
  // Known folders first, in their order; unknown types afterwards, prettified.
  for (const r of FOLDER_ROWS) claim(r.title);
  for (const o of objects) {
    const title =
      known.get(o.type) ??
      o.type
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ") + "s";
    claim(title).push(o);
  }
  return rows.filter((r) => r.items.length > 0);
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
  // A club's Learn list is the club's own curriculum.
  const clubId = useSelectedClubId();
  const [cards, setCards] = useState<LearningObject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (!token) return;
      setError(null);
      try {
        // Every published object — rowsFor() deals them one deck per folder.
        setCards(await getLearningObjects(token, { refresh, programId: clubId ?? undefined }));
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
    }, [token, clubId]),
  );

  return (
    <BrandChrome>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Learn</Text>

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
            Nothing published yet. Content published in the learning platform
            will appear here, one row per folder.
          </Text>
        )}

        {cards &&
          !error &&
          rowsFor(cards).map((row) => (
            <View key={row.title}>
              <SectionHeading>{row.title}</SectionHeading>
              <Deck>
                {row.items.map((item, i) => (
                  <PlayingCard
                    key={item.id}
                    index={i}
                    title={item.title}
                    body={item.description ?? undefined}
                    onPress={() => router.push(`/learn-object/${item.id}`)}
                  />
                ))}
              </Deck>
            </View>
          ))}

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
