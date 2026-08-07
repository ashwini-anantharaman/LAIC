// Play — four big playing cards, two by two (Figma 627:4285).
//
// Everything it launches is the bridge platform (the table itself stays an
// embed); this screen is only the door. The behaviour behind each card is the
// same as before the redesign:
//
//   New Play      deals a fresh board against the house
//   Resume Board  one unfinished board opens straight at the table; several open
//                 the picker. With none, the card is dimmed and inert.
//   My Plays      boards you've played (was "My Games", off the old Menu)
//   From Coach    boards your coach assigned (was "Coach's Assignments")
//
// The Deal of the Day hero the previous layout led with is gone — the design
// replaced it with this grid. Its route (/play-board/[entryId]) still exists and
// is still reached from a Learn card's embedded board.
//
// "From Coach" shows for everyone now. It used to be hidden from coaches on the
// grounds that assignments are something a coach gives; but a coach can also be
// assigned boards, and a four-card grid with a hole in it reads as broken.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { ACTION_CARD, ActionCard } from "../../components/action-card";
import { BrandChrome } from "../../components/brand-chrome";
import {
  ICON_CARD_ENVELOPE,
  ICON_CARD_HISTORY,
  ICON_CARD_PLAY,
  ICON_CARD_PLUS,
} from "../../constants/brand-vectors";
import { Brand, Fonts, Spacing, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { prefetchLaunch } from "../../lib/launch-cache";
import { type BridgeSummary } from "../../lib/nexus";
import { prewarmBridgePages } from "../../lib/prewarm";
import { peekSummary, refreshSummary } from "../../lib/summary-cache";

const DESIGN_WIDTH = 390;
/** The grid's left edge, and its top measured from under the screen title. */
const GRID_LEFT = 24;
const GRID_TOP_GAP = 42;

export default function PlayScreen() {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  // Last known summary renders immediately; the focus effect refreshes it.
  const [summary, setSummary] = useState<BridgeSummary | null>(() =>
    token ? peekSummary(token) : null,
  );
  const [error, setError] = useState<string | null>(null);

  const s = width / DESIGN_WIDTH;

  // Refresh on every visit: what's resumable changes as boards are played.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      prefetchLaunch(token, "bridge"); // keep a launch warm — one tap away
      // Warm the screens this grid's cards open, so tapping one lands on a
      // warm function instead of a cold start.
      prewarmBridgePages(["/m/assigned", "/m/plays", "/welcome"]);
      let cancelled = false;
      setError(null);
      refreshSummary(token)
        .then((sum) => !cancelled && setSummary(sum))
        // A failed refresh with stale data on screen stays silent — the stale
        // summary beats an error banner.
        .catch(() => !cancelled && !peekSummary(token) && setError("Couldn't load your boards."));
      return () => {
        cancelled = true;
      };
    }, [token]),
  );

  const inProgress = summary?.in_progress ?? [];

  function resume() {
    if (inProgress.length === 0) return;
    if (inProgress.length === 1) {
      router.push({
        pathname: "/table/[sessionId]",
        params: { sessionId: inProgress[0]!.session_id },
      });
    } else {
      router.push("/resume");
    }
  }

  const colPitch = (ACTION_CARD.width + ACTION_CARD.columnGap) * s;
  const rowPitch = (ACTION_CARD.height + ACTION_CARD.rowGap) * s;

  const cards = [
    {
      key: "new",
      label: "New Play",
      icon: ICON_CARD_PLUS,
      suit: Brand.maroon,
      onPress: () => router.push("/new-board"),
      disabled: false,
    },
    {
      key: "resume",
      label: "Resume Board",
      icon: ICON_CARD_PLAY,
      suit: Brand.green,
      onPress: resume,
      // Nothing to resume — dim it rather than opening an empty picker. Only
      // once the summary has loaded, so it doesn't flicker on arrival.
      disabled: summary != null && inProgress.length === 0,
    },
    {
      key: "plays",
      label: "My Plays",
      icon: ICON_CARD_HISTORY,
      suit: Brand.green,
      onPress: () => router.push("/plays"),
      disabled: false,
    },
    {
      key: "assigned",
      label: "From Coach",
      icon: ICON_CARD_ENVELOPE,
      suit: Brand.maroon,
      onPress: () => router.push("/assigned"),
      disabled: false,
    },
  ];

  return (
    <BrandChrome>
      <View style={styles.page}>
        <Text style={styles.title}>Play</Text>

        <View style={[styles.grid, { height: rowPitch * 2, marginTop: GRID_TOP_GAP * s }]}>
          {cards.map((c, i) => (
            <View
              key={c.key}
              style={{
                position: "absolute",
                left: GRID_LEFT * s + (i % 2) * colPitch,
                top: Math.floor(i / 2) * rowPitch,
                opacity: c.disabled ? 0.45 : 1,
              }}
              pointerEvents={c.disabled ? "none" : "auto"}
            >
              <ActionCard
                label={c.label}
                icon={c.icon}
                suit={c.suit}
                onPress={c.onPress}
                scale={s}
              />
            </View>
          ))}
        </View>

        {error ? <Text style={styles.stateText}>{error}</Text> : null}
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
    paddingHorizontal: Spacing.screen,
  },
  grid: { position: "relative" },
  stateText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: "rgba(31,31,31,0.55)",
    textAlign: "center",
    paddingHorizontal: Spacing.screen,
    paddingTop: 16,
  },
});
