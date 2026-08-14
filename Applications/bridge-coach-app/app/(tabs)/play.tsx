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
import { TabLoading } from "../../components/tab-loading";
import { peekBridgeOrigin, prefetchLaunch } from "../../lib/launch-cache";
import { type BridgeSummary } from "../../lib/nexus";
import { prewarmBridgePages } from "../../lib/prewarm";
import { peekSummary, refreshSummary } from "../../lib/summary-cache";
import { useClubs } from "../../lib/club-context";

const DESIGN_WIDTH = 390;
/** The grid's left edge, and its top measured from under the screen title. */
const GRID_LEFT = 24;
const GRID_TOP_GAP = 42;

export default function PlayScreen() {
  const { token } = useAuth();
  // The selected club scopes every bridge read here (null = app-wide). While
  // clubs are LOADING the scope is unknown, so the effects below fetch nothing
  // yet: firing early asked about the app-wide program, a guaranteed 403 for a
  // club-only account, paid in full before the real fetch could start.
  const { selected, loading: clubsLoading } = useClubs();
  const clubId = selected?.programId ?? null;
  const { width } = useWindowDimensions();
  // Last known summary renders immediately; the focus effect refreshes it.
  const [summary, setSummary] = useState<BridgeSummary | null>(() =>
    token ? peekSummary(token, clubId ?? undefined) : null,
  );
  const [error, setError] = useState<string | null>(null);

  const s = width / DESIGN_WIDTH;

  // Refresh on every visit: what's resumable changes as boards are played.
  useFocusEffect(
    useCallback(() => {
      if (!token || clubsLoading) return;
      prefetchLaunch(token, "bridge"); // keep a launch warm — one tap away
      // Warm the screens this grid's cards open, so tapping one lands on a
      // warm function instead of a cold start. THE TABLE ITSELF is on the
      // list: each route is its own serverless function, and the table's is
      // the heaviest — a bogus id 404s cheaply while still paying its module
      // init and DB pool. quick-play is NOT warmable (a GET there deals a
      // real board).
      prewarmBridgePages(
        ["/m/assigned", "/m/plays", "/welcome", "/bridge/table2/prewarm"],
        peekBridgeOrigin(token),
      );
      let cancelled = false;
      setError(null);
      refreshSummary(token, clubId ?? undefined)
        .then((sum) => !cancelled && setSummary(sum))
        // A failed refresh with stale data on screen stays silent — the stale
        // summary beats an error banner.
        .catch(() => !cancelled && !peekSummary(token, clubId ?? undefined) && setError("Couldn't load your boards."));
      return () => {
        cancelled = true;
      };
    }, [token, clubId, clubsLoading]),
  );

  const inProgress = summary?.in_progress ?? [];

  async function resume() {
    if (!token || inProgress.length === 0) return;
    // Decide from FRESH data: the cached summary can be a beat old right
    // after a save (the refresh races the tap), and deciding from the stale
    // list opened the wrong board. refreshSummary shares the in-flight focus
    // refresh, so this usually resolves instantly.
    const fresh = await refreshSummary(token, clubId ?? undefined).catch(() => null);
    const list = fresh?.in_progress ?? inProgress;
    if (fresh) setSummary(fresh);
    if (list.length === 0) return;
    // ONE unfinished board opens straight at the table; several open the
    // picker (owner direction 2026-08-13: never auto-pick among many).
    if (list.length === 1) {
      router.push({
        pathname: "/table/[sessionId]",
        params: { sessionId: list[0]!.session_id },
      });
    } else {
      router.push("/resume");
    }
  }

  const colPitch = (ACTION_CARD.width + ACTION_CARD.columnGap) * s;
  const rowPitch = (ACTION_CARD.height + ACTION_CARD.rowGap) * s;

  const cards: {
    key: string;
    label: string;
    icon: string;
    suit: string;
    onPress: () => void;
    disabled: boolean;
    badge?: number;
  }[] = [
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
      // How many boards are waiting behind the card — the badge on its corner.
      badge: inProgress.length,
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
                {...(c.badge != null ? { badge: c.badge } : {})}
              />
            </View>
          ))}
        </View>

        {error ? <Text style={styles.stateText}>{error}</Text> : null}
      </View>

      {/* Ready once the club is known and the summary (or its error) is in —
          the tiles' numbers arrive with the content, not after it. */}
      <TabLoading ready={!clubsLoading && (summary !== null || error !== null)} />
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
