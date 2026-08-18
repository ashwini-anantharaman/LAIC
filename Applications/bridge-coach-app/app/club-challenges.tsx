// Challenges — pushed from the Club tab's "Challenges" button (Figma 630:4819).
//
// The same carousel + per-challenge leaderboard as the old Club tab, with the
// changes the new design makes: the club name and blurb are gone (the Club tab
// owns those now) and the screen is titled "Challenges".
//
// The coach's + sits INLINE, immediately right of the title. It was a round
// button centred under the title for a while, which left it floating in the gap
// between the heading and the carousel with nothing to align to.
//
// It is a pushed screen, not a tab, so the app bar carries a back arrow.
//
// The + and the leaderboard are each gated on their own capability, so a role
// may view challenges without creating them, or without seeing standings.
//
// The data is REAL: challenges and standings come from the bridge platform
// (where the working feature lives — assemble boards, play them against BEN,
// score, compare) through its summary route, so the carousel lists the
// challenges this person is actually in and the leaderboard shows the actual
// field. TAPPING A TILE opens that challenge's info screen (challenge-info);
// its Start button is what enters the embed — play while it has boards for
// you, results once it doesn't.

import { Ionicons } from "@expo/vector-icons";
import { SvgXml } from "react-native-svg";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { BackChevron, BrandChrome } from "../components/brand-chrome";
import { leaveWithFade } from "../components/leave-veil";
import { TabLoading } from "../components/tab-loading";
import { ChallengeCaption, ChallengeTile } from "../components/challenge-tile";
import { Avatar } from "../components/avatar";
import { ICON_ARCHIVE_BOX } from "../constants/brand-vectors";
import { Brand, Fonts, TAB_BAR_CLEARANCE, Type } from "../constants/theme";
import { tintSvg } from "../components/svg-tint";
import { useAuth } from "../lib/auth-context";
import { confirmDestructive } from "../lib/dialogs";
import {
  deleteChallengeDraft,
  fetchChallengeDrafts,
  type ChallengeDraftRow,
} from "../lib/challenge-create";
import { PROGRAM_ID } from "../lib/config";
import {
  fetchClubChallenges,
  type ChallengeStanding,
  type ClubChallenge,
  describeChallengesError,
} from "../lib/challenges";
import { useSelectedClubId } from "../lib/club-context";
import { useCan } from "../lib/use-can";
import { useIsCoach } from "../lib/use-is-coach";

const DESIGN_WIDTH = 390;
/** BrandChrome already supplies the gap under the status bar. */
const TITLE_TOP = 0;
/** The coach's + : a 30pt disc sitting just right of the title's last letter. */
const PLUS = { size: 30, gap: 14 };
/**
 * The archive toggle (Figma 816:282): a 33-square with a 0.75 ink hairline and a
 * 3.75 radius, holding the 18pt glyph centred. The design pins it at x=340 in a
 * 390-wide frame — i.e. hard right — so it is laid out as "pushed to the end of the
 * title row" rather than at a fixed x, which keeps it on the edge at any width.
 */
/** The glyph ships black; tinted once at module scope rather than per render. */
const ARCHIVE_GLYPH_INK = tintSvg(ICON_ARCHIVE_BOX, Brand.ink);
const ARCHIVE_GLYPH_CREAM = tintSvg(ICON_ARCHIVE_BOX, Brand.cream);

const ARCHIVE_BTN = { size: 33, radius: 3.75, border: 0.75, glyph: 18, right: 17 };
/** Tile 185.47 at left 101, the next at 338.53 — a wide slice peeks, which is
 *  how the design signals that it swipes. */
const TILE = 185.469;
const ITEM_PITCH = 237.53;
const FIRST_TILE_LEFT = 101;
const CAROUSEL_GAP = 26;
const CAPTION_GAP = 2.5;

const BOARD_HEADING_GAP = 16;
const ROW = { height: 48, offset: 5, pitch: 64, left: 20, radius: 12 };

/** One standing: a green row on a darker green one, offset to look stacked. */
function LeaderboardRow({
  rank,
  standing,
  scale: s,
}: {
  rank: number;
  standing: ChallengeStanding;
  scale: number;
}) {
  return (
    <View
      style={{
        height: (ROW.height + ROW.offset) * s,
        marginBottom: (ROW.pitch - ROW.height - ROW.offset) * s,
      }}
    >
      <View
        style={[
          styles.rowShadow,
          {
            left: ROW.offset * s,
            top: ROW.offset * s,
            height: ROW.height * s,
            borderRadius: ROW.radius * s,
          },
        ]}
      />
      <View
        style={[
          styles.row,
          {
            right: ROW.offset * s,
            height: ROW.height * s,
            borderRadius: ROW.radius * s,
            paddingLeft: 12 * s,
            paddingRight: 16 * s,
          },
        ]}
      >
        <Text style={[styles.rank, { fontSize: 14.4 * s, width: 14 * s }]}>{rank}</Text>
        <View style={{ marginLeft: 12 * s, marginRight: 22 * s }}>
          {/* The summary carries names, not faces — drawn through Avatar so
              entrants get their picture the day the payload carries one. */}
          <Avatar uri={null} width={29 * s} height={28.12 * s} tint={Brand.cream} />
        </View>
        <Text style={[styles.name, { fontSize: 14.4 * s }]} numberOfLines={1}>
          {standing.name}
        </Text>
        <Text style={[styles.score, { fontSize: 14.4 * s, width: 62 * s }]}>{standing.score}</Text>
        <Text style={[styles.pct, { fontSize: 14.4 * s, width: 42 * s }]}>{standing.pct}</Text>
      </View>
    </View>
  );
}

export default function ClubChallengesScreen() {
  const { width } = useWindowDimensions();
  const s = width / DESIGN_WIDTH;
  // Capabilities, not a role. Each fallback is what this surface did before
  // roles existed: only a coach could add a challenge, everyone saw standings.
  const coach = useIsCoach();
  const canCreate = useCan("app.challenge.create", coach);
  const canSeeBoard = useCan("app.challenge.leaderboard.view", true);
  const { token } = useAuth();
  const clubId = useSelectedClubId();

  // Null while loading — an empty carousel means "none", not "not yet".
  const [all, setAll] = useState<ClubChallenge[] | null>(null);
  /** The club's parked drafts — its own shelf, never mixed into the carousel. */
  const [drafts, setDrafts] = useState<ChallengeDraftRow[] | null>(null);
  /** Showing the archive instead of the live list. */
  const [showArchived, setShowArchived] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const lastActive = useRef(0);
  const carousel = useRef<ScrollView>(null);

  /**
   * `fresh` distinguishes the two reasons to read.
   *
   * A first load clears the list and starts at the first card. A REFRESH keeps both:
   * blanking the carousel on every return would flash, and resetting the index would
   * throw you off the challenge you were just looking at.
   */
  const load = useCallback(
    (fresh: boolean) => {
      if (!token) return () => {};
      let cancelled = false;
      if (fresh) {
        setAll(null);
        setLoadError(null);
      }
      // The drafts shelf rides the same load. Only creators can see it (the
      // route refuses others), so a refusal is an empty shelf, not an error.
      if (canCreate) {
        fetchChallengeDrafts(token, clubId ?? PROGRAM_ID)
          .then(({ drafts: rows }) => !cancelled && setDrafts(rows))
          .catch(() => !cancelled && setDrafts([]));
      } else {
        setDrafts([]);
      }
      fetchClubChallenges(token, clubId)
        .then((rows) => {
          if (cancelled) return;
          setAll(rows);
          setLoadError(null);
          if (fresh) {
            setActive(0);
            lastActive.current = 0;
          }
        })
        .catch((e) => {
          if (cancelled) return;
          // A failed REFRESH keeps what is on screen — it is still true — and says
          // nothing. Only a failed first load has nothing to show.
          if (!fresh) return;
          setAll([]);
          setLoadError(describeChallengesError(e));
        });
      return () => {
        cancelled = true;
      };
    },
    [token, clubId, canCreate],
  );

  useEffect(() => load(true), [load]);

  /**
   * Re-read on every return to this screen.
   *
   * Archiving happens on the challenge's own info screen, so coming back here with a
   * cached list showed the challenge still sitting in the live carousel — and never in
   * the archive, since the app's copy still said archived: false.
   */
  useFocusEffect(useCallback(() => load(false), [load]));


  const pitch = ITEM_PITCH * s;
  const captionH = (CAPTION_GAP + 13.633 * 1.35) * s;

  /**
   * The carousel shows ONE of the two lists, never both mixed: live challenges, or
   * the archive. An archived challenge is retired — leaving it among the playable
   * ones is what made "which challenge am I supposed to open?" hard in the first
   * place — but it is not gone, so the toggle above reaches it.
   */
  const challenges = useMemo(
    () => (all == null ? null : all.filter((c) => c.archived === showArchived)),
    [all, showArchived],
  );

  // Swapping lists changes their length, so a carousel index from the other list
  // could point past the end — start each view at its first card.
  useEffect(() => {
    setActive(0);
    lastActive.current = 0;
    carousel.current?.scrollTo({ x: 0, animated: false });
  }, [showArchived]);

  /**
   * Arriving with ?id= selects that challenge — "See results" and finishing a
   * challenge both land here, and landing on some other challenge's leaderboard
   * would be worse than not navigating at all.
   *
   * Runs when the list arrives rather than on mount: the id cannot be resolved to a
   * carousel index before the rows exist. If that challenge is archived, the archive
   * view opens instead of silently showing nothing.
   *
   * DECLARED AFTER the reset-on-swap effect on purpose. Both react to showArchived,
   * effects run in declaration order, and for an archived target they fire in the same
   * commit — so the reset would otherwise land last and send the carousel back to 0.
   */
  const { id: wantedId } = useLocalSearchParams<{ id?: string }>();
  const honoured = useRef<string | null>(null);
  useEffect(() => {
    if (!wantedId || all == null || honoured.current === wantedId) return;
    const row = all.find((c) => c.id === wantedId);
    if (!row) return;
    if (row.archived !== showArchived) {
      // Swap lists and let this effect run again — deliberately NOT marked handled
      // yet, or the rerun would skip the scroll it exists to do.
      setShowArchived(row.archived);
      return;
    }
    const index = (all.filter((c) => c.archived === row.archived)).findIndex(
      (c) => c.id === wantedId,
    );
    if (index < 0) return;
    honoured.current = wantedId;
    setActive(index);
    lastActive.current = index;
    carousel.current?.scrollTo({ x: index * pitch, animated: false });
  }, [wantedId, all, showArchived, pitch]);

  const count = challenges?.length ?? 0;
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / pitch);
      const clamped = Math.max(0, Math.min(count - 1, i));
      if (clamped !== lastActive.current) {
        lastActive.current = clamped;
        setActive(clamped);
      }
    },
    [pitch, count],
  );


  const challenge = challenges?.[active] ?? challenges?.[0] ?? null;

  return (
    <BrandChrome>
      <View style={styles.page}>
        {/* Title and + on one line, the + hugging the text rather than the
            screen's edge, so the pair reads as one heading. */}
        <View style={[styles.titleRow, { paddingTop: TITLE_TOP * s }]}>
          <BackChevron
            onPress={() =>
              leaveWithFade(() => (router.canGoBack() ? router.back() : router.replace("/club")))
            }
            style={{ marginRight: 8 * s }}
          />
          <Text style={styles.title}>Challenges</Text>
          {canCreate ? (
            <Pressable
              // The platform's wizard, not a native panel: a challenge needs boards,
              // seats, scoring AND an invite list, and only that page has them. The
              // local draft this replaced existed on one device and could not be
              // played or invited to.
              onPress={() => router.push("/challenge-new")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Add a challenge"
              style={({ pressed }) => [
                styles.plus,
                {
                  width: PLUS.size * s,
                  height: PLUS.size * s,
                  borderRadius: (PLUS.size / 2) * s,
                  marginLeft: PLUS.gap * s,
                },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="add" size={19 * s} color={Brand.cream} />
            </Pressable>
          ) : null}

          {/* Pushed to the right edge — the design's x=340 in a 390 frame. */}
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => setShowArchived((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityState={{ selected: showArchived }}
            accessibilityLabel={showArchived ? "Show live challenges" : "Show archived challenges"}
            style={({ pressed }) => [
              styles.archiveBtn,
              {
                width: ARCHIVE_BTN.size * s,
                height: ARCHIVE_BTN.size * s,
                borderRadius: ARCHIVE_BTN.radius * s,
                borderWidth: Math.max(1, ARCHIVE_BTN.border * s),
                marginRight: ARCHIVE_BTN.right * s,
                // Filled while you are IN the archive, so the toggle says which list
                // you are looking at rather than only what it will do next.
                backgroundColor: showArchived ? Brand.green : "transparent",
              },
              pressed && styles.pressed,
            ]}
          >
            <SvgXml
              xml={showArchived ? ARCHIVE_GLYPH_CREAM : ARCHIVE_GLYPH_INK}
              width={ARCHIVE_BTN.glyph * s}
              height={ARCHIVE_BTN.glyph * s}
            />
          </Pressable>
        </View>

        {challenges === null || challenges.length === 0 ? (
          // Same footprint as the carousel, so the button and leaderboard
          // below don't jump when the challenges arrive.
          <View
            style={[
              styles.carouselFallback,
              { height: TILE * s + captionH, marginTop: CAROUSEL_GAP * s },
            ]}
          >
            {challenges === null ? (
              <ActivityIndicator color={Brand.green} />
            ) : (
              <Text style={styles.fallbackText}>
                {loadError ??
                  (showArchived
                    ? "Nothing archived. Retired challenges collect here."
                    : "No challenges yet — a coach starts one with the + above.")}
              </Text>
            )}
          </View>
        ) : (
          <ScrollView
            ref={carousel}
            horizontal
            showsHorizontalScrollIndicator={false}
            // Pinned: a horizontal ScrollView in a column parent otherwise
            // stretches to fill the height and pushes the leaderboard down.
            style={{ height: TILE * s + captionH, flexGrow: 0, marginTop: CAROUSEL_GAP * s }}
            onLayout={() => carousel.current?.scrollTo({ x: active * pitch, animated: false })}
            contentContainerStyle={{
              paddingLeft: FIRST_TILE_LEFT * s,
              paddingRight: Math.max(0, width - (FIRST_TILE_LEFT + TILE) * s),
            }}
            snapToInterval={pitch}
            snapToAlignment="start"
            decelerationRate="fast"
            onScroll={onScroll}
            scrollEventThrottle={16}
          >
            {challenges.map((c) => (
              <View key={c.id} style={{ width: pitch }}>
                <ChallengeTile
                  size={TILE * s}
                  // A local draft has nothing behind it to open. Real tiles
                  // land on the info screen; its Start button enters play.
                  onPress={
                    c.id.startsWith("local-")
                      ? undefined
                      : () => router.push({ pathname: "/challenge-info", params: { id: c.id } })
                  }
                />
                <ChallengeCaption
                  challenge={c}
                  width={TILE * s}
                  fontSize={13.633 * s}
                  dot={6 * s}
                  gap={10 * s}
                  paddingTop={CAPTION_GAP * s}
                />
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── Drafts: the club's parked challenges, a separate shelf ──
            Any of the club's challenge-creators can pick one up — parking at
            club level is the point — and publishing promotes the same row, so
            nothing here goes stale beside the contest it became. Hidden in the
            archive view: a draft is unstarted work, and the archive is where
            finished things rest. */}
        {canCreate && !showArchived && drafts !== null && drafts.length > 0 && (
          <>
            <Text
              style={[
                styles.heading,
                { paddingTop: BOARD_HEADING_GAP * s, paddingBottom: 10 * s, paddingLeft: ROW.left * s },
              ]}
            >
              Drafts
            </Text>
            <View style={{ paddingHorizontal: ROW.left * s }}>
              {drafts.map((d) => (
                <Pressable
                  key={d.entryId}
                  onPress={() =>
                    router.push({ pathname: "/challenge-new", params: { draft: d.entryId } })
                  }
                  style={({ pressed }) => [styles.draftRow, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Keep building ${d.title}`}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.draftTitle} numberOfLines={1}>
                      {d.title}
                    </Text>
                    <Text style={styles.draftMeta} numberOfLines={1}>
                      {d.boardCount} board{d.boardCount === 1 ? "" : "s"} · edited{" "}
                      {new Date(d.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </View>
                  <Text style={styles.draftGo}>Keep building →</Text>
                  <Pressable
                    onPress={() =>
                      confirmDestructive(
                        "Delete draft?",
                        `"${d.title}" will be gone for the whole club.`,
                        "Delete",
                        () => {
                          if (!token) return;
                          deleteChallengeDraft(token, clubId ?? PROGRAM_ID, d.entryId)
                            .then(() => setDrafts((prev) => prev?.filter((x) => x.entryId !== d.entryId) ?? null))
                            .catch(() => {});
                        },
                      )
                    }
                    hitSlop={10}
                    accessibilityLabel={`Delete draft ${d.title}`}
                  >
                    <Text style={styles.draftDelete}>✕</Text>
                  </Pressable>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {canSeeBoard ? (
          <Text
            style={[
              styles.heading,
              { paddingTop: BOARD_HEADING_GAP * s, paddingBottom: 14 * s, paddingLeft: ROW.left * s },
            ]}
          >
            Challenge Leaderboard
          </Text>
        ) : null}

        {/* Clipped so rows cut at both edges and scroll only within here. */}
        <View style={[styles.boardClip, { paddingHorizontal: ROW.left * s }]}>
          {!canSeeBoard || challenge === null ? null : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {!challenge.resultsUnlocked ? (
              // The platform's own visibility rule: standings stay hidden
              // until this viewer finishes the challenge.
              <Text style={styles.boardEmpty}>
                Standings unlock once you finish all {challenge.boards} boards.
              </Text>
            ) : challenge.standings.length === 0 ? (
              <Text style={styles.boardEmpty}>
                No results yet — standings appear once this challenge is played.
              </Text>
            ) : (
              challenge.standings.map((st, i) => (
                <LeaderboardRow
                  key={`${challenge.id}-${st.name}-${i}`}
                  rank={st.rank}
                  standing={st}
                  scale={s}
                />
              ))
            )}
          </ScrollView>
          )}
        </View>
      </View>

      <TabLoading ready={all !== null || loadError !== null} />
    </BrandChrome>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingBottom: TAB_BAR_CLEARANCE },
  titleRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 25 },
  title: { fontFamily: Fonts.display, fontSize: Type.screenTitle, color: Brand.ink },
  plus: { alignItems: "center", justifyContent: "center", backgroundColor: Brand.ink },
  heading: { fontFamily: Fonts.heading, fontSize: Type.sectionHeading, color: Brand.ink },
  boardClip: { flex: 1, overflow: "hidden" },
  carouselFallback: { alignItems: "center", justifyContent: "center" },
  fallbackText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: "rgba(31,31,31,0.55)",
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 32,
  },
  rowShadow: { position: "absolute", left: 0, right: 0, backgroundColor: Brand.rowShadow },
  row: {
    position: "absolute",
    left: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Brand.green,
  },
  rank: { fontFamily: Fonts.display, color: Brand.white, textAlign: "center" },
  name: { flex: 1, fontFamily: Fonts.display, color: Brand.white },
  score: { fontFamily: Fonts.display, color: Brand.white, textAlign: "right" },
  pct: { fontFamily: Fonts.display, color: Brand.white, textAlign: "right" },
  boardEmpty: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: "rgba(31,31,31,0.55)",
    textAlign: "center",
    lineHeight: 21,
    paddingTop: 24,
    paddingHorizontal: 12,
  },
  archiveBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: Brand.ink,
  },
  pressed: { opacity: 0.6 },
  draftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Brand.white,
    borderWidth: 1,
    borderColor: "#d3ccbb",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
  },
  draftTitle: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.ink },
  draftMeta: { fontFamily: Fonts.body, fontSize: 11.5, color: "#7b7466", marginTop: 1 },
  draftGo: { fontFamily: Fonts.bodySemibold, fontSize: 12, color: Brand.green },
  draftDelete: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 14,
    color: "#a49d8e",
    paddingHorizontal: 4,
  },
});
