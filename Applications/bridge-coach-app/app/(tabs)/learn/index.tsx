// Learn — horizontal decks of playing cards, one deck per KIND of content
// (Figma 476:663 for the card and deck treatment).
//
// Everything here is real: the published learning objects of the club being
// viewed, dealt as cards and opening the platform's reader on tap. The shelves are
// Concepts, Flashcards, Tutorials, Quizzes in that order, and then a shelf for any
// other type that actually has content — nothing published is unreachable, which
// is the rule this screen kept breaking (a status filter and a type filter each
// hid most of the library at different times).
//
// A "Browse Lessons" shelf used to sit at the bottom with three hardcoded
// titles. It is gone: the API has no lessons or courses, and nothing on screen
// admitted the content was invented.

import { router, useFocusEffect } from "expo-router";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandChrome } from "../../../components/brand-chrome";
import { CARD, PlayingCard } from "../../../components/playing-card";
import { PrimaryButton } from "../../../components/ui";
import { TabLoading } from "../../../components/tab-loading";
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
import { getLearningObjects, splitByOwner, primeLearningCache } from "../../../lib/learning";
import { subscribeToLiveLearning } from "../../../lib/learning-live";
import { LearningObject, NexusError } from "../../../lib/nexus";

/**
 * The shelves, top to bottom, and which Studio type ids belong on each.
 *
 * Order is the owner's. Tutorials collect two ids because the Studio writes
 * `tutorial-v2` for anything authored in the V2 pipeline and `tutorial` for the
 * older shape; to a learner they are the same kind of thing.
 *
 * A type NOT listed here still appears — see leftoverSections below. Content
 * silently vanishing behind a filter is the bug this tab just had twice, so the
 * rule is that every published object lands on some shelf.
 */
const SECTIONS: { heading: string; types: string[] }[] = [
  { heading: "Concepts", types: ["concept-card"] },
  { heading: "Flashcards", types: ["flashcard-set"] },
  { heading: "Tutorials", types: ["tutorial-v2", "tutorial"] },
  { heading: "Quizzes", types: ["quiz"] },
];

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
        const all = await getLearningObjects(token, {
          refresh,
          ...(clubId ? { programId: clubId } : {}),
        });
        // The CURRICULUM half only. A club read returns club ∪ parent, and the
        // club's own authored content belongs to the club's surfaces — putting it
        // here would make one club's material everyone's reading list.
        setCards(splitByOwner(all, clubId).curriculum);
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
   * Live updates: an author publishes elsewhere and this list changes under us.
   *
   * The subscription hands back the whole fresh list (see subscribeToLiveLearning),
   * which is primed into the shared cache so the reader screen and a later focus
   * both see the same rows rather than the tab holding a private newer copy.
   *
   * Does nothing when the direct path is unavailable — the foreground and focus
   * refetches below are then the only liveness, which is the behaviour that shipped
   * before this and remains the fallback.
   */
  useEffect(() => {
    if (!token) return;
    return subscribeToLiveLearning(token, (objects) => {
      // Same split as the fetch above: a live push must not put club-authored
      // content on the curriculum shelves that the initial load keeps off them.
      setCards(splitByOwner(primeLearningCache(token, clubId ?? undefined, objects), clubId).curriculum);
    });
  }, [token, clubId]);

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

  /**
   * The named shelves in order, then a shelf for every OTHER type that actually
   * has content — so a type nobody thought to list still reaches a learner rather
   * than disappearing. Empty shelves are dropped here rather than in the JSX.
   */
  const shelves = useMemo(() => {
    const all = cards ?? [];
    const named = SECTIONS.map((sec) => ({
      heading: sec.heading,
      items: all.filter((o) => sec.types.includes(o.type)),
    }));
    const claimed = new Set(SECTIONS.flatMap((sec) => sec.types));
    const leftoverTypes = [...new Set(all.map((o) => o.type).filter((t) => !claimed.has(t)))].sort();
    const leftovers = leftoverTypes.map((type) => ({
      heading: typeLabel(type),
      items: all.filter((o) => o.type === type),
    }));
    return [...named, ...leftovers].filter((shelf) => shelf.items.length > 0);
  }, [cards]);

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
          // Empty is now a legitimate, explainable state rather than a symptom:
          // only a version someone pressed publish on appears here, so a library
          // full of saved-but-unpublished work shows nothing. Say which act is
          // missing, or this reads as a fault.
          <Text style={styles.stateText}>
            Nothing published yet. In the Content Studio, publish a version of a
            piece of content and it will appear here.
          </Text>
        )}

        {/* One shelf per kind. An empty shelf renders nothing at all — a heading
            over no cards reads as a fault rather than as an absence. */}
        {cards &&
          !error &&
          shelves.map((shelf) => (
            <View key={shelf.heading}>
              <SectionHeading>{shelf.heading}</SectionHeading>
              <Deck>
                {shelf.items.map((item, i) => (
                  <PlayingCard
                    key={item.id}
                    index={i}
                    title={item.title}
                    body={item.description ?? undefined}
                    // The shelf already says what kind of thing this is, so the
                    // footer carries the time instead — and falls back to the type
                    // only when no time is recorded, so it is never blank.
                    footer={
                      <Text style={styles.cardFooter}>
                        {item.estimated_time || typeLabel(item.type)}
                      </Text>
                    }
                    onPress={() => router.push(`/learn-object/${item.id}`)}
                  />
                ))}
              </Deck>
            </View>
          ))}

      </ScrollView>

      {/* Ready once the library (or its error) is in; the fail-safe hands a
          slow load back to the in-page spinner below the title. */}
      <TabLoading ready={cards !== null || error !== null} />
    </BrandChrome>
  );
}

const styles = StyleSheet.create({
  // The bar's clearance plus a little air: with several shelves the last deck ends
  // near the bottom, and the sheets set the same precedent (CLEARANCE + n).
  page: { paddingBottom: TAB_BAR_CLEARANCE + 24 },
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
