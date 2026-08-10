// Practice Deal — pushed from the Club tab's "Practice Deal" button.
//
// The Challenges screen with one substitution. A practice deal is always ONE
// board, so where a challenge carries a count of boards it carries a
// DESCRIPTION, and where a challenge shows a leaderboard it shows that
// description — a deal is played alone, so there is nothing to rank.
//
// That makes it the same three parts: a title with the coach's +, a carousel of
// tiles, and a panel below that changes with the selected tile — here the
// description, and under it a small conversation about that deal. The chat is
// PER DEAL, so a question stays attached to the hand it is about.
//
// Deals live in this module for now: the app's Practice Deal button opens the
// day's board through the bridge platform, and the Nexus API has no endpoint for
// a club's own authored deals. The layout and the create flow are real; the
// content is seeded.

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { BrandChrome } from "../components/brand-chrome";
import { ChallengeFormPanel } from "../components/challenge-form-panel";
import { ChallengeTile } from "../components/challenge-tile";
import { DealChat } from "../components/deal-chat";
import { Brand, Fonts, TAB_BAR_CLEARANCE, Type } from "../constants/theme";
import { useCan } from "../lib/use-can";
import { useIsCoach } from "../lib/use-is-coach";

const DESIGN_WIDTH = 390;
/** BrandChrome already supplies the gap under the status bar. */
const TITLE_TOP = 0;
/** The coach's + : a 30pt disc sitting just right of the title's last letter. */
const PLUS = { size: 30, gap: 14 };
/** Same tile and pitch as Challenges, so the two screens read as siblings. */
const TILE = 185.469;
const ITEM_PITCH = 237.53;
const FIRST_TILE_LEFT = 101;
const CAROUSEL_GAP = 26;
const CAPTION_GAP = 2.5;
const INFO_GAP = 16;

type Deal = { name: string; description: string };

/** Placeholder content — the API has no club-authored deals yet. */
const SEED_DEALS: Deal[] = [
  {
    name: "Deal 1",
    description:
      "A gentle slam try. South opens 1♠ and North has the values to push — the point is deciding whether to stop at game or bid on.",
  },
  {
    name: "Deal 2",
    description:
      "Defence practice. You are East with a trump holding worth one trick if you keep it; the temptation is to cash early.",
  },
  {
    name: "Deal 3",
    description: "A simple finesse, played twice. Watch which hand you win the first trick in.",
  },
];

export default function PracticeDealsScreen() {
  const { width } = useWindowDimensions();
  const s = width / DESIGN_WIDTH;
  const coach = useIsCoach();
  // Own capability per control: a role may create challenges but not deals, or
  // read a deal without joining its discussion.
  const canCreate = useCan("app.deal.create", coach);
  const canDiscuss = useCan("app.deal.discuss", true);

  const [deals, setDeals] = useState<Deal[]>(SEED_DEALS);
  const [active, setActive] = useState(0);
  const lastActive = useRef(0);
  const carousel = useRef<ScrollView>(null);

  const [configuring, setConfiguring] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  const pitch = ITEM_PITCH * s;
  const captionH = (CAPTION_GAP + 13.633 * 1.35) * s;

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / pitch);
      const clamped = Math.max(0, Math.min(deals.length - 1, i));
      if (clamped !== lastActive.current) {
        lastActive.current = clamped;
        setActive(clamped);
      }
    },
    [pitch, deals.length],
  );

  const openConfigure = () => {
    setDraftName(`Deal ${deals.length + 1}`);
    setDraftDescription("");
    setConfiguring(true);
  };

  const saveDeal = () => {
    const name = draftName.trim();
    if (!name) return;
    const index = deals.length;
    setDeals((prev) => [...prev, { name, description: draftDescription.trim() }]);
    setActive(index);
    lastActive.current = index;
    setConfiguring(false);
  };

  const deal = deals[active] ?? deals[0]!;

  return (
    <BrandChrome onBack={() => (router.canGoBack() ? router.back() : router.replace("/club"))}>
      <View style={styles.page}>
        <View style={[styles.titleRow, { paddingTop: TITLE_TOP * s }]}>
          <Text style={styles.title}>Practice Deals</Text>
          {canCreate ? (
            <Pressable
              onPress={() => (configuring ? setConfiguring(false) : openConfigure())}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityState={{ expanded: configuring }}
              accessibilityLabel={configuring ? "Close deal settings" : "Add a practice deal"}
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
              <Ionicons
                name={configuring ? "chevron-down" : "add"}
                size={19 * s}
                color={Brand.cream}
              />
            </Pressable>
          ) : null}
        </View>

        {configuring ? (
          <ChallengeFormPanel
            noun="Deal"
            name={draftName}
            description={draftDescription}
            onChangeName={setDraftName}
            onChangeDescription={setDraftDescription}
            onClose={() => setConfiguring(false)}
            onSave={saveDeal}
            scale={s}
          />
        ) : (
          <ScrollView
            ref={carousel}
            horizontal
            showsHorizontalScrollIndicator={false}
            // Pinned: a horizontal ScrollView in a column parent otherwise
            // stretches to fill the height and pushes the description down.
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
            {deals.map((d) => (
              <View key={d.name} style={{ width: pitch }}>
                <ChallengeTile size={TILE * s} />
                {/* One board every time, so the caption says so rather than
                    carrying a count that never changes. */}
                <View style={[styles.caption, { width: TILE * s, paddingTop: CAPTION_GAP * s }]}>
                  <Text style={[styles.captionText, { fontSize: 13.633 * s }]} numberOfLines={1}>
                    {d.name}
                  </Text>
                  <View
                    style={{
                      width: 5.029 * s,
                      height: 5.029 * s,
                      borderRadius: 2.515 * s,
                      backgroundColor: Brand.ink,
                      marginHorizontal: 8 * s,
                    }}
                  />
                  <Text style={[styles.captionText, { fontSize: 13.633 * s }]} numberOfLines={1}>
                    1 Board
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Where a challenge shows standings. A deal is played alone, so this
            is what it is about — and then somewhere to discuss it. */}
        <KeyboardAvoidingView
          style={styles.below}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Text style={[styles.heading, { paddingTop: INFO_GAP * s, paddingBottom: 10 * s }]}>
            About this Deal
          </Text>
          {/* Capped: a long description must not squeeze the conversation out. */}
          <ScrollView style={[styles.info, { maxHeight: 110 * s }]} showsVerticalScrollIndicator={false}>
            {deal.description ? (
              <Text style={styles.infoText}>{deal.description}</Text>
            ) : (
              <Text style={styles.infoEmpty}>No description for this deal yet.</Text>
            )}
          </ScrollView>

          {canDiscuss ? (
            <>
              <Text style={[styles.heading, { paddingTop: 18 * s, paddingBottom: 6 * s }]}>
                Discussion
              </Text>
              <View style={[styles.chat, { paddingBottom: 10 * s }]}>
                {/* Keyed by name: the deal's identity within the session. */}
                <DealChat dealKey={deal.name} scale={s} />
              </View>
            </>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </BrandChrome>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingBottom: TAB_BAR_CLEARANCE },
  titleRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 25 },
  title: { fontFamily: Fonts.display, fontSize: Type.screenTitle, color: Brand.ink },
  plus: { alignItems: "center", justifyContent: "center", backgroundColor: Brand.ink },
  caption: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  captionText: { fontFamily: Fonts.body, color: Brand.ink },
  heading: {
    fontFamily: Fonts.heading,
    fontSize: Type.sectionHeading,
    color: Brand.ink,
    paddingHorizontal: 20,
  },
  below: { flex: 1 },
  info: { paddingHorizontal: 20 },
  chat: { flex: 1, paddingHorizontal: 20 },
  infoText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Brand.ink,
    lineHeight: 23,
  },
  infoEmpty: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: "rgba(31,31,31,0.55)",
    lineHeight: 21,
  },
  pressed: { opacity: 0.6 },
});
