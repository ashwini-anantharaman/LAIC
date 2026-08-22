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
//
// TWO VIEWS of the same shelves (Figma 906:417). Cards are the default and the
// browsing view — a deck you swipe through. The LIST is the finding view: every
// title on one screen, one row each, with each shelf collapsible so a learner can
// fold away the kinds they are not looking for. The toggle in the title's row
// always shows the view you would GO TO rather than the one you are in, which is
// the convention that stops it reading as a state indicator.

import { router, useFocusEffect } from "expo-router";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SvgXml } from "react-native-svg";

import { BrandChrome } from "../../../components/brand-chrome";
import { tintSvg } from "../../../components/svg-tint";
import { ICON_CHEVRON_UP, ICON_MENU, ICON_VIEW_GRID } from "../../../constants/brand-vectors";
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
import { describeLearningError, getLearningObjects, splitByOwner } from "../../../lib/learning";
import { LearningObject } from "../../../lib/nexus";

/**
 * The shelves, top to bottom, and which Studio type ids belong on each.
 *
 * Order is the owner's. Tutorials collect THREE ids because the Studio has had
 * three tutorial pipelines -- `tutorial` (oldest), `tutorial-v2`, and
 * `tutorial-v3`, which is the current authoring line. To a learner they are the
 * same kind of thing, and the shelf says "Tutorials" for all of them.
 *
 * v3 was missing here, so every v3 tutorial fell through to leftoverSections and
 * showed up under the raw id "tutorial-v3" -- a pipeline name leaking onto a
 * learner's screen. The leftover shelf did its job (nothing vanished), which is
 * exactly why this was easy to miss.
 *
 * A type NOT listed here still appears — see leftoverSections below. Content
 * silently vanishing behind a filter is the bug this tab just had twice, so the
 * rule is that every published object lands on some shelf.
 */
const SECTIONS: { heading: string; types: string[] }[] = [
  { heading: "Concepts", types: ["concept-card"] },
  { heading: "Flashcards", types: ["flashcard-set"] },
  { heading: "Tutorials", types: ["tutorial-v3", "tutorial-v2", "tutorial"] },
  { heading: "Quizzes", types: ["quiz"] },
];

/** The Studio's type ids, as a learner would read them. */
const TYPE_LABELS: Record<string, string> = {
  "tutorial-v3": "Tutorial",
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


/**
 * The list view's measurements (Figma 906:417), in the design's 390-wide space.
 *
 * Not scaled by screen width like the tiled screens: these rows stretch to the
 * available width, so only the fixed insets and heights come from the frame. The
 * row's SQUARE corners are the frame's own — every other card in the app is
 * rounded, and the list reads as a list precisely because these are not.
 */
const LIST = {
  /** Row height and the gap to the next one (208 → 253 in the frame). */
  rowHeight: 35,
  rowGap: 10,
  /** The row's own left inset, and the label's inside it (26 → 41). */
  inset: 26,
  labelInset: 15,
  labelSize: 16.437,
  /** Heading to its first row (208 − 175 in the frame, less the heading's line). */
  headingToRows: 20,
  /**
   * Above every heading, including the first.
   *
   * The frame uses two different gaps — 34 under the title, 24 above a later
   * heading — but the CARD view already spaces its headings at a uniform 28, and
   * two views that jump when you toggle between them is worse than six points of
   * Figma precision. One value, matching the deck.
   */
  rowsToHeading: 28,
  /** The chevron beside a heading. */
  chevron: { w: 13.4, h: 7.4, gap: 10 },
  /** The view toggle on the title's line. */
  toggle: 18,
} as const;

/**
 * One shelf as a foldable list.
 *
 * Collapsed state lives with the caller, not here, so folding a shelf survives a
 * refresh — the list re-renders from new data several times a minute on focus, and
 * a shelf that sprang back open every time would be unusable.
 */
function ListSection({
  heading,
  items,
  open,
  onToggle,
  onOpenItem,
}: {
  heading: string;
  items: LearningObject[];
  open: boolean;
  onToggle: () => void;
  onOpenItem: (id: string) => void;
}) {
  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${heading}, ${items.length} item${items.length === 1 ? "" : "s"}`}
        hitSlop={10}
        style={({ pressed }) => [styles.listHeadingRow, pressed && styles.pressed]}
      >
        <Text style={styles.listHeading}>{heading}</Text>
        {/* ONE asset for both states. The export points up (collapsed, as the frame
            draws "Browse Lessons"); an open shelf turns it 180°, which is the same
            trick the deck's mirrored card indices use. */}
        <View
          style={{
            marginLeft: LIST.chevron.gap,
            ...(open ? { transform: [{ rotate: "180deg" }] } : {}),
          }}
        >
          <SvgXml
            xml={tintSvg(ICON_CHEVRON_UP, Brand.ink)}
            width={LIST.chevron.w}
            height={LIST.chevron.h}
          />
        </View>
      </Pressable>

      {open ? (
        <View style={styles.listRows}>
          {items.map((item, i) => (
            <Pressable
              key={item.id}
              onPress={() => onOpenItem(item.id)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              style={({ pressed }) => [
                styles.listRow,
                // Alternating suits, dealt from the POSITION — the same rule the
                // decks use, so a title keeps its colour between the two views.
                { backgroundColor: i % 2 === 0 ? Brand.maroon : Brand.green },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.listRowLabel} numberOfLines={1}>
                {item.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
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
  /** Cards is the default: browsing is the commoner errand, and it is the view
   *  this tab has always opened in. */
  const [view, setView] = useState<"cards" | "list">("cards");
  /**
   * Which shelves are FOLDED, by heading — the absence of a heading means open.
   *
   * Tracking the folded ones rather than the open ones is what makes a new shelf
   * arrive expanded: content that appears while you are looking at the list should
   * be visible, not hidden behind a fold you never made.
   */
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const toggleFold = useCallback((heading: string) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(heading)) next.delete(heading);
      else next.add(heading);
      return next;
    });
  }, []);

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
        // Shared with the Club tab so the two cannot drift. It keeps the SERVER'S own
        // 403 reason — which distinguishes "this feature is not enabled for the
        // program" from "your role does not grant access", two different fixes — and
        // adds the 404 case this screen used to mistranslate as "check that the Nexus
        // backend is running", sending anyone who hit it to look at the wrong thing.
        setError(describeLearningError(e));
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
        <View style={styles.titleRow}>
          <Text style={styles.title}>Learn</Text>
          {/* Shows the view you would GO TO, never the one you are in: in cards it
              offers the list, in the list it offers the grid. A toggle that showed
              the current view would read as a state badge and get tapped by people
              expecting nothing to happen. Hidden until there is something to look
              at either way. */}
          {cards && !error && shelves.length > 0 ? (
            <Pressable
              onPress={() => setView((v) => (v === "cards" ? "list" : "cards"))}
              accessibilityRole="button"
              accessibilityLabel={view === "cards" ? "Show as a list" : "Show as cards"}
              hitSlop={14}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <SvgXml
                xml={tintSvg(view === "cards" ? ICON_MENU : ICON_VIEW_GRID, Brand.ink)}
                width={LIST.toggle}
                // The list glyph is 18x12 and the grid 18x18; forcing one box on
                // both would squash whichever loses, so each keeps its own ratio.
                height={view === "cards" ? 12 : LIST.toggle}
              />
            </Pressable>
          ) : null}
        </View>

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

        {/* One shelf per kind, in whichever view is showing. An empty shelf renders
            nothing at all — a heading over no cards reads as a fault rather than as
            an absence — so the same `shelves` list drives both. */}
        {cards && !error && view === "list"
          ? shelves.map((shelf) => (
              <ListSection
                key={shelf.heading}
                heading={shelf.heading}
                items={shelf.items}
                open={!folded.has(shelf.heading)}
                onToggle={() => toggleFold(shelf.heading)}
                onOpenItem={(id) => router.push(`/learn-object/${id}`)}
              />
            ))
          : null}

        {cards &&
          !error &&
          view === "cards" &&
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
  },
  sectionHeading: {
    fontFamily: Fonts.heading,
    fontSize: Type.sectionHeading,
    color: Brand.ink,
    paddingHorizontal: Spacing.screen,
    paddingTop: 28,
  },
  /** The title and the view toggle share one line, as the frame draws them. */
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.screen,
  },
  listHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: LIST.inset,
    paddingTop: LIST.rowsToHeading,
  },
  listHeading: {
    fontFamily: Fonts.heading,
    fontSize: Type.sectionHeading,
    color: Brand.ink,
  },
  listRows: { paddingTop: LIST.headingToRows, gap: LIST.rowGap },
  /** SQUARE corners, from the frame. Every other card here is rounded; that is
   *  what makes these read as a list rather than as a stack of small cards. */
  listRow: {
    height: LIST.rowHeight,
    marginHorizontal: LIST.inset,
    justifyContent: "center",
    paddingHorizontal: LIST.labelInset,
  },
  listRowLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: LIST.labelSize,
    color: Brand.white,
  },
  pressed: { opacity: 0.75 },
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
