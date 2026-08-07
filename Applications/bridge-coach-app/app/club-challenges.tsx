// Challenges — pushed from the Club tab's "Challenges" button (Figma 630:4819).
//
// The same carousel + per-challenge leaderboard as the old Club tab, with the
// changes the new design makes: the club name and blurb are gone (the Club tab
// owns those now), the screen is titled "Challenges", and the coach's + is a
// round button centred in the space that freed up rather than sitting inline
// beside a heading.
//
// It is a pushed screen, not a tab, so the app bar carries a back arrow.
//
// The Nexus API has no clubs, challenges or leaderboards yet, so the content in
// SEED_CHALLENGES is placeholder; the layout and interaction are real.

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
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

import { BrandChrome } from "../components/brand-chrome";
import { ChallengeFormPanel } from "../components/challenge-form-panel";
import {
  Challenge,
  ChallengeCaption,
  ChallengeTile,
  SEED_CHALLENGES,
} from "../components/challenge-tile";
import { tintSvg } from "../components/svg-tint";
import { ICON_AVATAR } from "../constants/brand-vectors";
import { Brand, Fonts, TAB_BAR_CLEARANCE, Type } from "../constants/theme";
import { useIsCoach } from "../lib/use-is-coach";

const DESIGN_WIDTH = 390;
/** BrandChrome already supplies the gap under the status bar. */
const TITLE_TOP = 0;
/** The coach's + : 36 square, centred, 14 under the title. */
const PLUS = { size: 36, gap: 14 };
/** Tile 185.47 at left 101, the next at 338.53 — a wide slice peeks, which is
 *  how the design signals that it swipes. */
const TILE = 185.469;
const ITEM_PITCH = 237.53;
const FIRST_TILE_LEFT = 101;
const CAROUSEL_GAP = 26;
const CAPTION_GAP = 2.5;

const BOARD_HEADING_GAP = 16;
const ROW = { height: 48, offset: 5, pitch: 64, left: 20, radius: 12 };

const AVATAR_CREAM = tintSvg(ICON_AVATAR, Brand.cream);

/** One standing: a green row on a darker green one, offset to look stacked. */
function LeaderboardRow({
  rank,
  standing,
  scale: s,
}: {
  rank: number;
  standing: { name: string; mp: number; pct: number };
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
          <SvgXml xml={AVATAR_CREAM} width={29 * s} height={28.12 * s} />
        </View>
        <Text style={[styles.name, { fontSize: 14.4 * s }]} numberOfLines={1}>
          {standing.name}
        </Text>
        <Text style={[styles.score, { fontSize: 14.4 * s, width: 62 * s }]}>{standing.mp} MP</Text>
        <Text style={[styles.pct, { fontSize: 14.4 * s, width: 42 * s }]}>{standing.pct}%</Text>
      </View>
    </View>
  );
}

export default function ClubChallengesScreen() {
  const { width } = useWindowDimensions();
  const s = width / DESIGN_WIDTH;
  const coach = useIsCoach();

  const [challenges, setChallenges] = useState<Challenge[]>(SEED_CHALLENGES);
  const [active, setActive] = useState(0);
  const lastActive = useRef(0);
  const carousel = useRef<ScrollView>(null);

  const [configuring, setConfiguring] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftBoards, setDraftBoards] = useState(8);

  const pitch = ITEM_PITCH * s;
  const captionH = (CAPTION_GAP + 13.633 * 1.35) * s;

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

  const openConfigure = () => {
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

  const challenge = challenges[active] ?? challenges[0]!;

  return (
    <BrandChrome onBack={() => (router.canGoBack() ? router.back() : router.replace("/club"))}>
      <View style={styles.page}>
        <Text style={[styles.title, { paddingTop: TITLE_TOP * s }]}>Challenges</Text>

        {coach ? (
          <Pressable
            onPress={() => (configuring ? setConfiguring(false) : openConfigure())}
            accessibilityRole="button"
            accessibilityState={{ expanded: configuring }}
            accessibilityLabel={configuring ? "Close challenge settings" : "Add a challenge"}
            style={({ pressed }) => [
              styles.plus,
              {
                width: PLUS.size * s,
                height: PLUS.size * s,
                borderRadius: (PLUS.size / 2) * s,
                marginTop: PLUS.gap * s,
              },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={configuring ? "chevron-down" : "add"}
              size={22 * s}
              color={Brand.cream}
            />
          </Pressable>
        ) : null}

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
            // Pinned: a horizontal ScrollView in a column parent otherwise
            // stretches to fill the height and pushes the leaderboard down.
            // A learner has no +, so the carousel takes back that space.
            style={{
              height: TILE * s + captionH,
              flexGrow: 0,
              marginTop: (coach ? CAROUSEL_GAP : CAROUSEL_GAP + PLUS.size + PLUS.gap) * s,
            }}
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
              <View key={c.name} style={{ width: pitch }}>
                <ChallengeTile size={TILE * s} />
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

        <Text
          style={[
            styles.heading,
            { paddingTop: BOARD_HEADING_GAP * s, paddingBottom: 14 * s, paddingLeft: ROW.left * s },
          ]}
        >
          Challenge Leaderboard
        </Text>

        {/* Clipped so rows cut at both edges and scroll only within here. */}
        <View style={[styles.boardClip, { paddingHorizontal: ROW.left * s }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {challenge.standings.length === 0 ? (
              <Text style={styles.boardEmpty}>
                No results yet — standings appear once this challenge is played.
              </Text>
            ) : (
              challenge.standings.map((st, i) => (
                <LeaderboardRow
                  key={`${challenge.name}-${st.name}-${i}`}
                  rank={i + 1}
                  standing={st}
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
  page: { flex: 1, paddingBottom: TAB_BAR_CLEARANCE },
  title: {
    fontFamily: Fonts.display,
    fontSize: Type.screenTitle,
    color: Brand.ink,
    paddingHorizontal: 25,
  },
  plus: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.ink,
  },
  heading: { fontFamily: Fonts.heading, fontSize: Type.sectionHeading, color: Brand.ink },
  boardClip: { flex: 1, overflow: "hidden" },
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
  pressed: { opacity: 0.6 },
});
