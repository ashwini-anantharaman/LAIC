// My Club (Figma 579:2364; challenges 580:2753; coach view 582:2938 / 583:3339).
//
// Coaches see one extra affordance: a + beside "Challenges" that opens the
// configure panel IN PLACE of the carousel (the design draws it covering exactly
// that band). Learners never see it — the role comes from the same
// getBridgeContextCached/isCoach check the Home, Play and Coach tabs use.
//
// The Nexus API has no clubs, challenges or leaderboards yet, so every name and
// score in CHALLENGES below is placeholder data. Nothing on screen says so (by
// request) — the layout and interaction are real, the content is not.
//
// Structure, per the design:
//   • Club name + blurb
//   • Challenges — a horizontal carousel (Figma 580:2753). The tile is centred
//     and captioned beneath as "Challenge 1 • 8 Boards"; the pitch (237.53) is
//     well under the screen width (390), so a good slice of the next tile shows,
//     which is how the design signals that it swipes.
//   • Challenge Leaderboard — EACH challenge has its own board, so swiping the
//     carousel swaps the standings below it.
//
// The leaderboard scrolls inside its own clipped region rather than extending the
// page, so rows are cut off at the top and bottom edges exactly as drawn and can
// never spill over the tab bar or the carousel.

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SvgXml } from "react-native-svg";

import { BrandChrome } from "../../components/brand-chrome";
import { ChallengeFormPanel } from "../../components/challenge-form-panel";
import { tintSvg } from "../../components/svg-tint";
import { ICON_AVATAR, ICON_CHALLENGE_CARD } from "../../constants/brand-vectors";
import { Brand, Fonts, Spacing, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { getBridgeContextCached, isCoach } from "../../lib/bridge-role";

/** Design-space geometry, scaled to the real screen width like the home tree. */
const DESIGN_WIDTH = 390;
const TILE = 185.47;
const TILE_INNER = 158.42;
const TILE_INSET = 13.52;
const TILE_RADIUS = 10.6;
const TILE_BORDER = 1.93;
/** Distance from one challenge to the next; the gap lets the next tile peek. */
const ITEM_PITCH = 237.53;
/** Left offset of the first tile — (390 − 185.47) / 2, i.e. centred. */
const FIRST_TILE_LEFT = 100;
/** The two card glyphs, positioned inside the green face. */
const GLYPH = { w: 49, h: 62.67 };
const GLYPH_A = { left: 29.5, top: 25.8 };
const GLYPH_B = { left: 87.1, top: 79.5 };
/** Caption sits under the tile: "Challenge 1 • 8 Boards". */
const CAPTION_GAP = 10;
const CAPTION_DOT = 6;

const ROW_HEIGHT = 48;
const ROW_GAP = 16;
const ROW_OFFSET = 5;

/** The avatar ships dark for the cream app bar; on a green row it must be light. */
const AVATAR_CREAM = tintSvg(ICON_AVATAR, Brand.cream);

type Standing = { name: string; mp: number; pct: number };
type Challenge = { name: string; boards: number; scoring: string; standings: Standing[] };

/** Placeholder seed content — see the note at the top of this file. */
const SEED_CHALLENGES: Challenge[] = [
  {
    name: "Challenge 1",
    boards: 8,
    scoring: "MP score",
    standings: [
      { name: "Keith", mp: 41, pct: 74 },
      { name: "Ralph", mp: 37, pct: 66 },
      { name: "Quan", mp: 31, pct: 56 },
      { name: "Ashwini", mp: 28, pct: 51 },
      { name: "Miland", mp: 24, pct: 44 },
      { name: "David", mp: 19, pct: 35 },
    ],
  },
  {
    name: "Challenge 2",
    boards: 12,
    scoring: "IMP score",
    standings: [
      { name: "Ralph", mp: 52, pct: 81 },
      { name: "David", mp: 47, pct: 73 },
      { name: "Keith", mp: 39, pct: 61 },
      { name: "Miland", mp: 33, pct: 52 },
      { name: "Quan", mp: 26, pct: 41 },
    ],
  },
  {
    name: "Challenge 3",
    boards: 6,
    scoring: "MP score",
    standings: [
      { name: "Ashwini", mp: 36, pct: 69 },
      { name: "Quan", mp: 30, pct: 58 },
      { name: "Keith", mp: 22, pct: 42 },
    ],
  },
];

/** The maroon tile with its green face and two card glyphs. */
function ChallengeTile({ scale: s }: { scale: number }) {
  return (
    <View
      style={[styles.tile, { width: TILE * s, height: TILE * s, borderRadius: TILE_RADIUS * s }]}
    >
      <View
        style={[
          styles.tileFace,
          {
            left: TILE_INSET * s,
            top: TILE_INSET * s,
            width: TILE_INNER * s,
            height: TILE_INNER * s,
            borderWidth: TILE_BORDER * s,
          },
        ]}
      >
        {/* Two stacked-card glyphs, offset diagonally as drawn. */}
        <View style={{ position: "absolute", left: GLYPH_A.left * s, top: GLYPH_A.top * s }}>
          <SvgXml xml={ICON_CHALLENGE_CARD} width={GLYPH.w * s} height={GLYPH.h * s} />
        </View>
        <View style={{ position: "absolute", left: GLYPH_B.left * s, top: GLYPH_B.top * s }}>
          <SvgXml xml={ICON_CHALLENGE_CARD} width={GLYPH.w * s} height={GLYPH.h * s} />
        </View>
      </View>
    </View>
  );
}

/** "Challenge 1 • 8 Boards", centred under its tile. */
function ChallengeCaption({
  challenge,
  scale: s,
}: {
  challenge: Challenge;
  scale: number;
}) {
  return (
    <View style={[styles.caption, { width: TILE * s, gap: CAPTION_GAP * s, paddingTop: 8 * s }]}>
      <Text style={[styles.detail, { fontSize: Type.clubDetail * s }]} numberOfLines={1}>
        {challenge.name}
      </Text>
      <View
        style={{
          width: CAPTION_DOT * s,
          height: CAPTION_DOT * s,
          borderRadius: (CAPTION_DOT / 2) * s,
          backgroundColor: Brand.ink,
        }}
      />
      <Text style={[styles.detail, { fontSize: Type.clubDetail * s }]} numberOfLines={1}>
        {challenge.boards} Boards
      </Text>
    </View>
  );
}

/** One standing: a green row on a darker green one, offset to look stacked. */
function LeaderboardRow({
  rank,
  standing,
  scale: s,
}: {
  rank: number;
  standing: Standing;
  scale: number;
}) {
  return (
    <View style={{ height: (ROW_HEIGHT + ROW_OFFSET) * s, marginBottom: ROW_GAP * s }}>
      <View
        style={[
          styles.rowShadow,
          { left: ROW_OFFSET * s, top: ROW_OFFSET * s, height: ROW_HEIGHT * s, borderRadius: 12 * s },
        ]}
      />
      <View style={[styles.row, { height: ROW_HEIGHT * s, borderRadius: 12 * s }]}>
        <Text style={[styles.rank, { fontSize: 14.4 * s }]}>{rank}</Text>
        <SvgXml xml={AVATAR_CREAM} width={29 * s} height={28.12 * s} />
        <Text style={[styles.name, { fontSize: 14.4 * s }]} numberOfLines={1}>
          {standing.name}
        </Text>
        <Text style={[styles.score, { fontSize: 14.4 * s }]}>{standing.mp} MP</Text>
        <Text style={[styles.pct, { fontSize: 14.4 * s }]}>{standing.pct}%</Text>
      </View>
    </View>
  );
}

export default function ClubScreen() {
  const { width } = useWindowDimensions();
  const { token } = useAuth();
  const s = width / DESIGN_WIDTH;
  const [active, setActive] = useState(0);
  const lastActive = useRef(0);
  // Coaches can add challenges, so the list is state rather than a constant.
  const [challenges, setChallenges] = useState<Challenge[]>(SEED_CHALLENGES);
  const carousel = useRef<ScrollView>(null);

  // Only a coach can configure challenges — same role check the other tabs use.
  const [coach, setCoach] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    getBridgeContextCached(token).then((ctx) => {
      if (!cancelled) setCoach(isCoach(ctx));
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The configure panel opens in place of the carousel.
  const [configuring, setConfiguring] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftBoards, setDraftBoards] = useState(8);

  const openConfigure = () => {
    // A create form, so it starts on the next challenge number.
    setDraftName(`Challenge ${challenges.length + 1}`);
    setDraftBoards(8);
    setConfiguring(true);
  };

  const saveChallenge = () => {
    const name = draftName.trim();
    if (!name) return;
    // A brand-new challenge has no results yet — an empty board is the truth.
    const next: Challenge = { name, boards: draftBoards, scoring: "MP score", standings: [] };
    const index = challenges.length;
    setChallenges((prev) => [...prev, next]);
    setActive(index);
    lastActive.current = index;
    setConfiguring(false);
  };

  const pitch = ITEM_PITCH * s;
  // Tile plus the caption line beneath it, so the pinned ScrollView is exactly
  // as tall as its content.
  const carouselHeight = (TILE + 8 + Type.clubDetail * 1.35) * s;

  // Which challenge is under the finger decides which board is shown.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / pitch);
      const clamped = Math.max(0, Math.min(challenges.length - 1, i));
      if (clamped !== lastActive.current) {
        lastActive.current = clamped;
        setActive(clamped);
      }
    },
    [pitch, challenges.length],
  );

  const challenge = challenges[active] ?? challenges[0]!;

  return (
    <BrandChrome>
      <View style={styles.page}>
        <Text style={styles.club}>Club 1</Text>
        <Text style={styles.blurb}>A test club Under LAIC</Text>

        {/* Coaches get a + here; it turns into a collapse chevron while open. */}
        <View style={[styles.headingRow, { paddingTop: 14 * s, paddingBottom: 12 * s }]}>
          <Text style={styles.heading}>Challenges</Text>
          {coach ? (
            <Pressable
              onPress={() => (configuring ? setConfiguring(false) : openConfigure())}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityState={{ expanded: configuring }}
              accessibilityLabel={configuring ? "Close challenge settings" : "Add a challenge"}
              style={({ pressed }) => pressed && styles.pressedIcon}
            >
              <Ionicons
                name={configuring ? "chevron-down-circle" : "add-circle"}
                size={21 * s}
                color={Brand.ink}
              />
            </Pressable>
          ) : null}
        </View>

        {configuring ? (
          <ChallengeFormPanel
            name={draftName}
            boards={draftBoards}
            onChangeName={setDraftName}
            onChangeBoards={setDraftBoards}
            onClose={() => setConfiguring(false)}
            onSave={saveChallenge}
            scale={s}
          />
        ) : (
          <ScrollView
            ref={carousel}
            horizontal
            showsHorizontalScrollIndicator={false}
            // Remounted after the panel closes, so jump straight to the active
            // challenge instead of snapping back to the first.
            onLayout={() => carousel.current?.scrollTo({ x: active * pitch, animated: false })}
            // A horizontal ScrollView in a column parent stretches to fill the
            // available height unless pinned, which left a large dead gap and
            // pushed the leaderboard far down the screen. Pin it to its content.
            style={{ height: carouselHeight, flexGrow: 0 }}
            contentContainerStyle={{
              // Centres the first tile, and lets the last one reach centre too.
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
              <View key={c.name} style={{ width: pitch }}>
                <ChallengeTile scale={s} />
                <ChallengeCaption challenge={c} scale={s} />
              </View>
            ))}
          </ScrollView>
        )}

        {/* Design: 27pt from the carousel's bottom edge to this heading, then
            25pt to the first row. */}
        <Text
          style={[
            styles.heading,
            { paddingHorizontal: Spacing.screen, paddingTop: 20 * s, paddingBottom: 12 * s },
          ]}
        >
          Challenge Leaderboard
        </Text>

        {/* Clipped so rows are cut at both edges and scroll only within here. */}
        <View style={styles.boardClip}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 8 * s, paddingBottom: 8 * s }}
          >
            {challenge.standings.length === 0 ? (
              <Text style={styles.boardEmpty}>
                No results yet — standings appear once this challenge is played.
              </Text>
            ) : (
              challenge.standings.map((standing, i) => (
                <LeaderboardRow
                  key={`${challenge.name}-${standing.name}-${i}`}
                  rank={i + 1}
                  standing={standing}
                  scale={s}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </BrandChrome>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  tile: { backgroundColor: Brand.maroon },
  /** The green face is a square inside the maroon tile — no radius, as drawn. */
  tileFace: {
    position: "absolute",
    backgroundColor: Brand.green,
    borderColor: Brand.cream,
  },
  club: {
    fontFamily: Fonts.display,
    fontSize: Type.screenTitle,
    color: Brand.ink,
    paddingHorizontal: Spacing.screen,
    paddingTop: 5,
  },
  blurb: {
    fontFamily: Fonts.body,
    fontSize: Type.clubDetail,
    color: Brand.ink,
    paddingHorizontal: Spacing.screen,
    paddingTop: 6,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Spacing.screen,
  },
  /** Padding comes from headingRow (or the inline style on the standalone one). */
  heading: {
    fontFamily: Fonts.heading,
    fontSize: Type.sectionHeading,
    color: Brand.ink,
  },
  pressedIcon: { opacity: 0.55 },
  detail: {
    fontFamily: Fonts.body,
    color: Brand.ink,
  },
  caption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  boardClip: {
    flex: 1,
    overflow: "hidden",
    paddingHorizontal: 19,
    marginBottom: TAB_BAR_CLEARANCE,
  },
  boardEmpty: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: "rgba(31,31,31,0.55)",
    textAlign: "center",
    lineHeight: 21,
    paddingTop: 24,
    paddingHorizontal: 12,
  },
  rowShadow: {
    position: "absolute",
    right: 0,
    left: 0,
    backgroundColor: Brand.rowShadow,
  },
  row: {
    position: "absolute",
    left: 0,
    right: ROW_OFFSET,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Brand.green,
    paddingHorizontal: 14,
    gap: 12,
  },
  rank: {
    fontFamily: Fonts.display,
    color: Brand.white,
    width: 14,
    textAlign: "center",
  },
  name: {
    flex: 1,
    fontFamily: Fonts.display,
    color: Brand.white,
  },
  score: {
    fontFamily: Fonts.display,
    color: Brand.white,
    textAlign: "right",
  },
  pct: {
    fontFamily: Fonts.display,
    color: Brand.white,
    width: 42,
    textAlign: "right",
  },
});
