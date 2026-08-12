// The native board screen — the composition role of the web's
// app/bridge/table2/[sessionId]/page.tsx, rewired to the session store
// (owner direction 2026-08-12: the web table pasted and rewired). This file
// decides WHAT the table shows — seats, visibility, transport, settings
// rows, the coach's data — and PlayTable (the 1:1 port) decides how it
// looks. The app chrome around it (the felt loading cover, the quit
// pull-out, the leave-board dialog) is the same chrome the webview board
// wears.

import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../lib/auth-context";
import { useSelectedClubId } from "../../lib/club-context";
import { PROGRAM_ID } from "../../lib/config";
import { fetchCoach, type CoachAuth, type CoachPanelData } from "../../lib/table/coach";
import { useTableSession } from "../../lib/table/session-store";
import { LeaveBoardDialog } from "../leave-board-dialog";
import { leaveWithFade } from "../leave-veil";
import { Screen, ScreenHeader } from "../ui";
import {
  nextSkin,
  resolveSkin,
  resultLabel,
  scoreBoard,
  skinLabel,
  type Card,
  type Seat,
} from "../../lib/vendor/table-kernel/table-kernel";
import { BoardLoading } from "./board-loading";
import { CoachDock } from "./coach-panel";
import { PlayTable } from "./play-table";
import { QuitPullout } from "./quit-pullout";
import { SeatsPanel } from "./seats-popup";
import { ChallengeOverlay } from "./sheets";
import { GLYPH } from "./table-tokens";

/** The coach payload refresh: debounced off the confirmed head — it compiles
    the KB server-side and must never ride every robot card. */
const COACH_DEBOUNCE_MS = 900;

/** The AutoAdvance rail (variant="rail" at railScale 1.5) + the page's Undo
    chip — the transport group the bottom bar carries, wired to the store. */
function TransportRail({
  s = 1.5,
  paused,
  onPause,
  stepActive,
  onStep,
  showUndo,
  onUndo,
  benThinking,
}: {
  s?: number;
  paused: boolean;
  onPause: () => void;
  stepActive: boolean;
  onStep: () => void;
  showUndo: boolean;
  onUndo: () => void;
  benThinking: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 * s }}>
      {/* A challenge robot's turn is a remote neural call; say so rather than
          leaving the felt looking frozen. */}
      {benThinking && (
        <View
          style={{
            height: 30 * s,
            paddingHorizontal: 10 * s,
            borderRadius: 6,
            backgroundColor: "rgba(255,255,255,.08)",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#cfe0d8", fontSize: 12 * s, fontWeight: "700" }}>BEN is thinking…</Text>
        </View>
      )}
      <Pressable
        onPress={onPause}
        accessibilityLabel={paused ? "Play" : "Pause"}
        style={{
          height: 30 * s,
          paddingHorizontal: 12 * s,
          borderWidth: 1,
          borderColor: paused ? "#a94848" : "rgba(255,255,255,.18)",
          borderRadius: 6,
          backgroundColor: paused ? "#8a3030" : "rgba(255,255,255,.10)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: paused ? "#fff" : "#eef4f1", fontSize: 13 * s, fontWeight: "700" }}>
          {paused ? "Play" : "Pause"}
        </Text>
      </Pressable>
      <Pressable
        disabled={!stepActive}
        onPress={onStep}
        accessibilityLabel="step"
        style={{
          width: 30 * s,
          height: 30 * s,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,.18)",
          borderRadius: 6,
          backgroundColor: "rgba(255,255,255,.10)",
          alignItems: "center",
          justifyContent: "center",
          opacity: stepActive ? 1 : 0.42,
        }}
      >
        <Text style={{ color: "#eef4f1", fontSize: 13 * s }}>▶</Text>
      </Pressable>
      {showUndo && (
        <Pressable
          onPress={onUndo}
          accessibilityLabel="undo"
          style={{
            height: 30 * s,
            paddingHorizontal: 12 * s,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,.18)",
            borderRadius: 6,
            backgroundColor: "rgba(255,255,255,.10)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#eef4f1", fontSize: 13 * s, fontWeight: "700" }}>↩ Undo</Text>
        </Pressable>
      )}
    </View>
  );
}

export function NativeTable({ sessionId }: { sessionId: string }) {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;
  const insets = useSafeAreaInsets();
  const session = useTableSession(token, programId, sessionId);
  const { bootstrap: b, state } = session;
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [pickedSeat, setPickedSeat] = useState<Seat | null>(null);
  // Table toggles the web keeps in URL params — component state here.
  const [auctionDisplay, setAuctionDisplay] = useState<"box" | "seats">("box");
  const [confirmBids, setConfirmBids] = useState(false);

  const auth: CoachAuth | null = useMemo(
    () => (token ? { token, programId } : null),
    [token, programId],
  );

  // ── the coach's data — the page recomputes it per render; the native host
  // re-asks the route after a quiet beat per event batch. ──
  const [coach, setCoach] = useState<CoachPanelData | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const coachOn = !!b?.control["table.coach"];
  useEffect(() => {
    if (!auth || !coachOn) return;
    const timer = setTimeout(() => {
      fetchCoach(auth, sessionId)
        .then((p) => {
          if (live.current) setCoach(p);
        })
        .catch(() => {});
    }, COACH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [auth, sessionId, coachOn, session.headSeq]);

  const score = useMemo(() => (state ? scoreBoard(state) : null), [state]);

  // Leaving mid-board asks: keep it for Resume, or discard. The store's OWN
  // phase decides — no postMessage dance, the state is right here.
  const goBack = () =>
    leaveWithFade(() => (router.canGoBack() ? router.back() : router.replace("/play")));
  const onQuit = () => {
    const unfinished =
      !!b && !!state && !b.boardOver && state.phase !== "complete" && b.mySeat !== null;
    if (unfinished) setLeaveAsk(true);
    else goBack();
  };

  if (!b || !state) {
    return (
      <Screen style={!session.error ? styles.feltScreen : undefined}>
        {/* NO header while the felt loads (owner request 2026-08-12: not even
            a flash) — it exists only in the error state. */}
        {session.error ? <ScreenHeader title="Board" backTo="/play" /> : null}
        <View style={styles.loading}>
          {session.error ? (
            <Text style={styles.loadingText}>{session.error}</Text>
          ) : (
            <BoardLoading ready={false} onGone={() => {}} />
          )}
        </View>
      </Screen>
    );
  }

  const boardOver = b.boardOver || state.phase === "complete";
  const skin = resolveSkin(b.appearance.skin, b.appearance.overrides);

  // The table is shown a COMPLETE board once the auction was the board — this
  // puts the result card on the felt and folds the tray away (the page's rule).
  const tableState = {
    ...state,
    ...(b.auctionWasTheBoard || boardOver ? { phase: "complete" as const } : {}),
    dealer: b.board.dealer as Seat,
    vul: b.board.vul,
  };

  // ── the result card's lines (page.tsx's own phrasing) ──
  const c = state.contract;
  const contractText = c
    ? `${c.level}${c.strain === "N" ? "NT" : GLYPH[c.strain]}${
        c.doubled === 1 ? "X" : c.doubled === 2 ? "XX" : ""
      } by ${c.declarer}`
    : "Passed out";
  const resultLine = score ? resultLabel(score) : b.auctionWasTheBoard ? contractText : "Passed out";
  const resultScore = score ? `${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}` : "";
  const completedAction = b.challenge?.done
    ? {
        label: `${b.challenge.onward.label} →`,
        onPress: () =>
          leaveWithFade(() =>
            b.challenge!.onward.href.includes("/results")
              ? router.replace("/club-challenges")
              : router.replace("/challenge-play"),
          ),
      }
    : undefined;

  // ── gates: every control's PRESENCE is the server's answer ──
  const canStepControls = b.control["table.step_controls"];
  const canUndo = b.control["table.undo"];
  const canHandsView = b.control["table.hands_view"];
  const canSeatsPanel = b.control["table.seats_panel"];
  const canSettingsMenu = b.control["table.settings_menu"];
  const canSkinSettings = b.control["table.skin_settings"];

  // ── ☰ settings rows (page.tsx:263-329; hrefs become the store's verbs).
  // "Appearance →" and "Verification workbench →" lead to other platform
  // pages, not board surfaces — they have no native destination yet. ──
  const speedLabel = session.beatMs === 350 ? "Fast" : session.beatMs === 1500 ? "Slow" : "Normal";
  const nextSpeed = session.beatMs === 1500 ? 350 : session.beatMs === 350 ? 750 : 1500;
  const settings = [
    ...(b.canSeeAllHands
      ? [
          {
            label: "Show all four hands",
            value: b.showAll ? "On" : "Off",
            on: () => session.setHandsPref(b.showAll ? "mine" : "all"),
          },
        ]
      : []),
    {
      label: "Auction display",
      value: auctionDisplay === "seats" ? "At seats" : "Centre box",
      on: () => setAuctionDisplay((v) => (v === "seats" ? "box" : "seats")),
    },
    {
      label: "Robot speed",
      value: speedLabel,
      on: () => session.setBeatMs(nextSpeed),
    },
    {
      label: "Confirm bids",
      value: confirmBids ? "On" : "Off",
      on: () => setConfirmBids((v) => !v),
    },
    ...(canSkinSettings
      ? [
          {
            label: "Skin",
            value: skinLabel(b.appearance.skin),
            on: () => void session.setAppearance({ skin: nextSkin(b.appearance.skin) }),
          },
          {
            label: "Hand layout",
            value: b.appearance.handLayout === "fan" ? "Fan" : "Row",
            on: () =>
              void session.setAppearance({
                handLayout: b.appearance.handLayout === "fan" ? "row" : "fan",
              }),
          },
          {
            label: "Bid pad",
            value: b.appearance.bidPad === "columns" ? "Suit columns" : "Level grid",
            on: () =>
              void session.setAppearance({
                bidPad: b.appearance.bidPad === "columns" ? "grid" : "columns",
              }),
          },
          {
            label: "Centre frame",
            value: b.appearance.centreFrame ? "On" : "Off",
            on: () => void session.setAppearance({ centreFrame: !b.appearance.centreFrame }),
          },
        ]
      : []),
  ];

  // ── the transport group (controlsAt(1.5): the rail + the Undo chip) ──
  const controlsExtraNarrow = canStepControls ? (
    <TransportRail
      paused={session.paused}
      onPause={() => session.setPaused(!session.paused)}
      stepActive={!boardOver && !session.myTurn}
      onStep={() => {
        session.setPaused(true);
        void session.step();
      }}
      showUndo={!!canUndo && state.auction.length > 0 && !boardOver}
      onUndo={() => void session.undo()}
      benThinking={session.benWaiting}
    />
  ) : undefined;

  // ── the seats panel (railExtra), behind the bottom bar's Seats button ──
  const railExtra = canSeatsPanel ? (
    <SeatsPanel
      seatNames={b.seatNames}
      roster={b.roster}
      benOffered={b.benOffered}
      pickedSeat={pickedSeat}
      onPickSeat={setPickedSeat}
      onSwap={(seat, playerId) => {
        setPickedSeat(null);
        void session
          .swapSeat(seat, playerId)
          // The fork stays on the native table — it is opt-in, and the opt
          // rides the navigation (the webview is the app's default).
          .then((id) => id && leaveWithFade(() => router.replace(`/table/${id}?native=1`)));
      }}
    />
  ) : undefined;

  return (
    <View style={[styles.host, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LeaveBoardDialog
        visible={leaveAsk}
        onSave={() => {
          setLeaveAsk(false);
          goBack();
        }}
        onDiscard={() => {
          setLeaveAsk(false);
          void session.discard().finally(goBack);
        }}
        onStay={() => setLeaveAsk(false)}
      />
      {b.challenge && (
        <ChallengeOverlay
          visible={standingsOpen}
          onClose={() => setStandingsOpen(false)}
          challenge={b.challenge}
        />
      )}

      {/* ── ChallengeStrip (ChallengeStrip.tsx): the dark band above ── */}
      {b.challenge && (
        <View style={styles.challengeStrip}>
          <Text style={styles.challengeTitle} numberOfLines={1}>
            {b.challenge.strip.title}
          </Text>
          <View style={styles.challengeBadge}>
            <Text style={styles.challengeBadgeText}>
              Board {b.challenge.strip.boardNo} of {b.challenge.strip.boardsTotal}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 8 }} />
          {b.challenge.strip.showResults && (
            <Pressable onPress={() => setStandingsOpen(true)} style={styles.challengeResults}>
              <Text style={styles.challengeResultsText}>Results</Text>
            </Pressable>
          )}
          <View style={styles.challengeProgress}>
            <View
              style={[
                styles.challengeProgressFill,
                {
                  width: `${Math.round(
                    (b.challenge.strip.boardNo / Math.max(1, b.challenge.strip.boardsTotal)) * 100,
                  )}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* PHONE TIER ALWAYS (the web's embedded rule): the region is capped at
          a phone width and the table renders its phone stack inside it. */}
      <View style={styles.region}>
        <View style={{ flex: 1, width: "100%", maxWidth: 480, alignSelf: "center" }}>
          <PlayTable
            state={tableState}
            seats={b.seats}
            visible={b.visible}
            mySeat={b.mySeat}
            legalCalls={[...session.legalCallSet]}
            legalPlays={session.legalPlayList}
            myTurn={session.myTurn}
            boardLabel={b.board.number}
            auctionDisplay={auctionDisplay}
            confirmBids={confirmBids}
            resultLine={resultLine}
            resultScore={resultScore}
            {...(b.auctionWasTheBoard
              ? { resultDetail: "Bidding only · the auction was the board" }
              : {})}
            {...(completedAction ? { completedAction } : {})}
            {...(b.challenge?.done && b.challenge.onward.note
              ? { completedNote: b.challenge.onward.note }
              : {})}
            onCall={(call) => void session.act({ call })}
            onPlay={(_seat: Seat, card: Card) => void session.act({ card })}
            {...(controlsExtraNarrow ? { controlsExtraNarrow } : {})}
            {...(railExtra ? { railExtra } : {})}
            {...(canSettingsMenu ? { settings } : {})}
            {...(canHandsView
              ? {
                  viewAction: {
                    label: "Hands",
                    on: () => router.push(`/table/${sessionId}?view=hands&from=table`),
                  },
                }
              : {})}
            tok={skin}
            handLayout={b.appearance.handLayout}
            bidPad={b.appearance.bidPad}
            centreFrame={b.appearance.centreFrame}
            fanSpread={b.appearance.fanSpread}
            fanRadius={b.appearance.fanRadius}
            hideTopBar
            coachContent={coachOn && coach && auth ? <CoachDock data={coach} auth={auth} /> : undefined}
          />
        </View>
      </View>

      {session.actError ? <Text style={styles.actError}>{session.actError}</Text> : null}

      {/* The app's exit — the same pull-out the webview board wears. */}
      <QuitPullout onQuit={onQuit} />
    </View>
  );
}

const styles = StyleSheet.create({
  /** While loading, the SAFE AREAS wear the felt too — no cream bars. */
  feltScreen: { backgroundColor: "#1d5c46" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1d5c46" },
  loadingText: { fontSize: 14, color: "#fff4d7" },

  host: { flex: 1, backgroundColor: "#fff", overflow: "hidden" },
  region: { flex: 1, alignSelf: "stretch" },

  // ChallengeStrip tokens (challengeTokens.ts).
  challengeStrip: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: "#0e1a1c",
  },
  challengeTitle: { flexShrink: 1, fontSize: 12.5, fontWeight: "700", color: "#eaf1ef" },
  challengeBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,.06)",
  },
  challengeBadgeText: { fontSize: 10, fontWeight: "700", color: "#93aaa7" },
  challengeResults: {
    height: 26,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.22)",
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  challengeResultsText: { color: "#dbe8e6", fontSize: 11.5, fontWeight: "700" },
  challengeProgress: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: "rgba(255,255,255,.10)",
  },
  challengeProgressFill: { height: 2, backgroundColor: "#0d707c" },

  actError: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 90,
    fontSize: 12.5,
    fontWeight: "700",
    color: "#fff",
    backgroundColor: "#8a3030",
    borderWidth: 1,
    borderColor: "#a94848",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: "center",
    overflow: "hidden",
    zIndex: 20,
  },
});
