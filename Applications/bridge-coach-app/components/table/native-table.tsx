// The native board (Part II — Phase A view, Phase B play). Phone-tier bands,
// exactly the web table's order — top bar, North, the centre (auction or
// trick), East/West flanking, South big at the bottom, the result card when
// the board is over. Everything policy-shaped (who's visible, who's dummy,
// seat plates, whose turn) is the SERVER'S answer via the session store;
// this file draws, and hands taps to the store's optimistic act().
//
// Layout prices itself off the window width with flex bands — RN has no CSS
// reflow problem, so the web's scaled-fixed-stage trick stays behind.

import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { Brand, Fonts } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { useSelectedClubId } from "../../lib/club-context";
import { PROGRAM_ID } from "../../lib/config";
import { useTableSession } from "../../lib/table/session-store";
import { LeaveBoardDialog } from "../leave-board-dialog";
import { Screen, ScreenHeader } from "../ui";
import { CoachDock } from "./coach-dock";
import {
  callLabel,
  cardId,
  resolveSkin,
  resultLabel,
  scoreBoard,
  type Call,
  type Card,
  type GameState,
  type Seat,
} from "../../lib/vendor/table-kernel/table-kernel";
import { BoardLoading } from "./board-loading";
import { CardBack, CardFace, SUIT_GLYPH } from "./cards";
import {
  ChallengeOverlay,
  HandsViewerSheet,
  SeatsSheet,
  SettingsSheet,
  cycleSkin,
} from "./sheets";

const SUIT_ORDER = ["S", "H", "D", "C"] as const;

/** Sort a hand for display: spades→clubs, high card first. */
function displaySort(cards: Card[]): Card[] {
  const suitRank: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
  return [...cards].sort((a, b) =>
    a.suit === b.suit ? b.rank - a.rank : suitRank[a.suit]! - suitRank[b.suit]!,
  );
}

export function NativeTable({ sessionId }: { sessionId: string }) {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;
  const { width } = useWindowDimensions();
  const session = useTableSession(token, programId, sessionId);
  const { bootstrap: b, state } = session;
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seatsOpen, setSeatsOpen] = useState(false);
  const [pickedSeat, setPickedSeat] = useState<Seat | null>(null);
  const [handsOpen, setHandsOpen] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [confirmBids, setConfirmBids] = useState(false);

  const stage = Math.min(width, 480);
  const smallCard = Math.max(20, Math.floor(stage / 16));
  const bigCard = Math.max(34, Math.floor(stage / 9));

  const score = useMemo(() => (state ? scoreBoard(state) : null), [state]);

  // Leaving mid-board asks: keep it for Resume, or discard it. The store's
  // OWN phase decides — no postMessage dance, the state is right here.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/play"));
  const onBack = (defaultBack: () => void) => {
    const unfinished =
      !!b && !!state && !b.boardOver && state.phase !== "complete" && b.mySeat !== null;
    if (unfinished) setLeaveAsk(true);
    else defaultBack();
  };

  if (!b || !state) {
    return (
      <Screen>
        {/* No back arrow while the felt loads (owner request) — it returns
            with the board, or with an error worth deciding about. */}
        <ScreenHeader title="Board" backTo="/play" showBack={!!session.error} />
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

  const trick = state.tricks.length ? state.tricks[state.tricks.length - 1]! : null;
  const boardOver = b.boardOver || state.phase === "complete";

  // The playable hand: the seat whose action is next, when it's the
  // viewer's to take (covers the takeover — the declarer's chair is theirs).
  const legalIds = new Set(session.legalPlayList.map(cardId));
  const hand = (seat: Seat, big: boolean) => {
    const playable = session.myTurn && state.phase === "play" && state.turn === seat;
    return (
      <HandStrip
        cards={displaySort(state.hands[seat])}
        faceUp={b.visible[seat]}
        backs={session.remainingCount(seat)}
        w={big ? bigCard : smallCard}
        back={skin.cardBack}
        {...(playable
          ? { legal: legalIds, onPlay: (card: Card) => void session.act({ card }) }
          : {})}
      />
    );
  };

  const plate = (seat: Seat) => (
    <SeatPlateView
      seat={seat}
      name={b.seats[seat].name}
      tag={b.seats[seat].tag}
      strip={b.seats[seat].strip}
      onTurn={!boardOver && state.turn === seat}
    />
  );

  const canStep = b.control["table.step_controls"];
  const canUndo = b.control["table.undo"];
  // The hands-record peek mirrors the web gate: the capability, or a
  // finished UNCHALLENGED board (nothing left to hide).
  const canHands = b.control["table.hands_view"] || (boardOver && !b.challenge);

  // The skin dresses the felt — resolved through the kernel, same tokens the
  // web table wears. feltFlat is the solid form (RN draws no CSS gradients).
  const skin = resolveSkin(b.appearance.skin, b.appearance.overrides);
  const feltColor = skin.feltFlat || "#1d5c46";
  const accent = skin.accent || Brand.cream;

  return (
    <Screen>
      <ScreenHeader title="Board" backTo="/play" onBack={onBack} />
      <LeaveBoardDialog
        visible={leaveAsk}
        // Save = the server already has every event; the board waits under
        // Resume by simply being left alive.
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
      <SettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        bootstrap={b}
        showAll={b.showAll}
        onToggleHands={() => session.setHandsPref(b.showAll ? "mine" : "all")}
        beatMs={session.beatMs}
        onBeat={session.setBeatMs}
        confirmBids={confirmBids}
        onConfirmBids={() => setConfirmBids((v) => !v)}
        onSkin={() => void session.setSkin(cycleSkin(b))}
      />
      <SeatsSheet
        visible={seatsOpen}
        onClose={() => {
          setSeatsOpen(false);
          setPickedSeat(null);
        }}
        bootstrap={b}
        pickedSeat={pickedSeat}
        onPickSeat={setPickedSeat}
        onSwap={(seat, playerId) => {
          setSeatsOpen(false);
          setPickedSeat(null);
          void session
            .swapSeat(seat, playerId)
            .then((id) => id && router.replace(`/table/${id}?native=1`));
        }}
      />
      {state && (
        <HandsViewerSheet
          visible={handsOpen}
          onClose={() => setHandsOpen(false)}
          bootstrap={b}
          state={state}
        />
      )}
      {b.challenge && (
        <ChallengeOverlay
          visible={standingsOpen}
          onClose={() => setStandingsOpen(false)}
          challenge={b.challenge}
        />
      )}
    <ScrollView style={[styles.felt, { backgroundColor: feltColor }]} contentContainerStyle={styles.feltInner}>
      {/* A challenge board wears its strip above the felt. */}
      {b.challenge && (
        <View style={styles.challengeStrip}>
          <Text style={styles.challengeTitle} numberOfLines={1}>
            {b.challenge.strip.title}
          </Text>
          <Text style={styles.challengeCount}>
            Board {b.challenge.strip.boardNo} of {b.challenge.strip.boardsTotal}
          </Text>
          {b.challenge.strip.showResults && (
            <Pressable onPress={() => setStandingsOpen(true)} hitSlop={6}>
              <Text style={[styles.challengeResults, { color: accent }]}>Results</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Top bar: the board's facts. */}
      <View style={styles.topBar}>
        <Text style={styles.topChip}>Board {b.board.number}</Text>
        <Text style={styles.topChip}>dealer {b.board.dealer}</Text>
        <Text style={styles.topChip}>vul {b.board.vul}</Text>
        {state.contract ? (
          <Text style={[styles.topChip, styles.topChipStrong]}>
            {callLabel(`${state.contract.level}${state.contract.strain}`)}
            {state.contract.doubled === 1 ? " X" : state.contract.doubled === 2 ? " XX" : ""} by{" "}
            {state.contract.declarer}
          </Text>
        ) : null}
        <Text style={styles.topChip}>
          NS {state.trickCount.NS} · EW {state.trickCount.EW}
        </Text>
      </View>

      {/* North */}
      <View style={styles.northBand}>
        {plate("N")}
        {hand("N", false)}
      </View>

      {/* West | centre | East */}
      <View style={styles.middleBand}>
        <View style={styles.sideSeat}>
          {plate("W")}
          {hand("W", false)}
        </View>
        <View style={styles.centre}>
          {boardOver ? (
            <ResultCardView
              contract={state.contract}
              line={score ? resultLabel(score) : b.auctionWasTheBoard ? "Bidding only" : "Passed out"}
              points={score ? `${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}` : ""}
              note={
                b.auctionWasTheBoard
                  ? "The auction was the board."
                  : b.challenge?.done
                    ? b.challenge.onward.label
                    : undefined
              }
            />
          ) : trick && trick.plays.length > 0 && state.phase === "play" ? (
            <TrickAreaView trick={trick} w={Math.floor(smallCard * 1.4)} stage={stage} />
          ) : (
            <AuctionBoxView state={state} />
          )}
        </View>
        <View style={styles.sideSeat}>
          {plate("E")}
          {hand("E", false)}
        </View>
      </View>

      {/* South — the viewer's hand rides big. */}
      <View style={styles.southBand}>
        {hand("S", true)}
        {plate("S")}
      </View>

      {/* The bid tray, when the auction is the viewer's to move. */}
      {session.myTurn && state.phase === "auction" && (
        <BidPad
          legal={session.legalCallSet}
          confirm={confirmBids}
          onCall={(call) => void session.act({ call })}
        />
      )}

      {/* BEN held the beat (challenges have no fallback): say so, offer ⟳. */}
      {session.benWaiting && (
        <Pressable onPress={session.retryBen} style={styles.benChip}>
          <Text style={styles.benChipText}>BEN is thinking… tap to retry</Text>
        </Pressable>
      )}

      {/* Transport: pause/run the robots, step one decision, take one back —
          plus the sheets' doors, each present only when the control is. */}
      {!boardOver && (
        <View style={styles.transportRow}>
          {canStep && (
            <>
              <Chip
                label={session.paused ? "▶ Run" : "❚❚ Pause"}
                onPress={() => session.setPaused(!session.paused)}
              />
              <Chip
                label="▸ Step"
                onPress={() => {
                  session.setPaused(true);
                  void session.step();
                }}
              />
            </>
          )}
          {canUndo && state.auction.length > 0 && (
            <Chip label="↩ Undo" onPress={() => void session.undo()} />
          )}
          {b.control["table.seats_panel"] && (
            <Chip label="Seats" onPress={() => setSeatsOpen(true)} />
          )}
          {canHands && <Chip label="Hands" onPress={() => setHandsOpen(true)} />}
          {b.control["table.settings_menu"] && (
            <Chip label="☰" onPress={() => setSettingsOpen(true)} />
          )}
        </View>
      )}

      {/* A finished board's onward verbs. */}
      {boardOver && (
        <View style={styles.transportRow}>
          {canHands && <Chip label="Hands" onPress={() => setHandsOpen(true)} />}
          {b.control["table.save_library"] && (
            <Chip
              label="Save play"
              onPress={() =>
                void session
                  .save("play")
                  .then((id) => id && setSavedNote("Saved to your library."))
              }
            />
          )}
          {b.control["table.new_deal"] && !b.challenge && (
            <Chip
              label="New deal"
              onPress={() =>
                void session
                  .newDeal()
                  .then((id) => id && router.replace(`/table/${id}?native=1`))
              }
            />
          )}
        </View>
      )}
      {savedNote ? <Text style={styles.savedNote}>{savedNote}</Text> : null}

      {/* A finished challenge board's way onward: the next board, or the
          results. The web hrefs map to the app's own journeys. */}
      {b.challenge?.done && (
        <Pressable
          onPress={() =>
            b.challenge!.onward.href.includes("/results")
              ? router.replace("/club-challenges")
              : router.replace("/challenge-play")
          }
          style={({ pressed }) => [styles.onwardBar, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.onwardLabel}>{b.challenge.onward.label} →</Text>
          {b.challenge.onward.note ? (
            <Text style={styles.onwardNote}>{b.challenge.onward.note}</Text>
          ) : null}
        </Pressable>
      )}

      {session.actError ? <Text style={styles.actError}>{session.actError}</Text> : null}
      {session.pending ? <Text style={styles.pendingNote}>…</Text> : null}

      {/* The coach band under the felt — gated like everything else by the
          server's control answer; refreshes off the confirmed head. */}
      {b.control["table.coach"] && (
        <CoachDock sessionId={sessionId} refreshKey={session.headSeq} />
      )}
    </ScrollView>
    </Screen>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.transportChip, pressed && { opacity: 0.75 }]}
    >
      <Text style={styles.transportChipText}>{label}</Text>
    </Pressable>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function SeatPlateView({
  seat,
  name,
  tag,
  strip,
  onTurn,
}: {
  seat: Seat;
  name: string;
  tag: string;
  strip: string;
  onTurn: boolean;
}) {
  return (
    <View style={[styles.plate, onTurn && styles.plateOnTurn]}>
      <View style={[styles.plateStrip, { backgroundColor: strip }]} />
      <Text style={styles.plateSeat}>{seat}</Text>
      <Text style={styles.plateName} numberOfLines={1}>
        {name}
        {tag ? ` · ${tag}` : ""}
      </Text>
    </View>
  );
}

function HandStrip({
  cards,
  faceUp,
  backs,
  w,
  back,
  legal,
  onPlay,
}: {
  cards: Card[];
  faceUp: boolean;
  backs: number;
  w: number;
  /** The skin's card-back color. */
  back?: string;
  /** Card ids the kernel says may be played — everything else dims. */
  legal?: Set<string>;
  onPlay?: (card: Card) => void;
}) {
  const overlap = Math.floor(w * 0.55);
  if (!faceUp) {
    return (
      <View style={styles.handRow}>
        {Array.from({ length: Math.max(0, backs) }, (_, i) => (
          <View key={i} style={{ marginLeft: i === 0 ? 0 : -overlap }}>
            <CardBack w={w} color={back} />
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.handRow}>
      {cards.map((c, i) => {
        const id = cardId(c);
        const playable = !!onPlay && !!legal?.has(id);
        const face = (
          <View
            style={[
              { marginLeft: i === 0 ? 0 : -overlap },
              // A tappable hand dims what the law refuses; a watching hand
              // dims nothing — nothing there is being offered.
              onPlay && !playable && { opacity: 0.45 },
              playable && { marginTop: -Math.floor(w * 0.12) },
            ]}
          >
            <CardFace card={c} w={w} />
          </View>
        );
        return playable ? (
          <Pressable key={id} onPress={() => onPlay(c)} hitSlop={4}>
            {face}
          </Pressable>
        ) : (
          <View key={id}>{face}</View>
        );
      })}
    </View>
  );
}

/** The bid tray: pick a level, tap a strain — or pass/double straight away.
 *  Legality comes from the kernel's set; everything else renders disabled.
 *  With `confirm` on, a chosen call ARMS instead of sending — the second tap
 *  (a labeled Confirm key) is the one that travels. */
function BidPad({
  legal,
  confirm,
  onCall,
}: {
  legal: Set<Call>;
  confirm: boolean;
  onCall: (call: Call) => void;
}) {
  const [level, setLevel] = useState<number | null>(null);
  const [armed, setArmed] = useState<Call | null>(null);
  const STRAINS: { key: string; label: string; red: boolean }[] = [
    { key: "C", label: "♣", red: false },
    { key: "D", label: "♦", red: true },
    { key: "H", label: "♥", red: true },
    { key: "S", label: "♠", red: false },
    { key: "N", label: "NT", red: false },
  ];
  const levelHasBid = (l: number) => STRAINS.some((s) => legal.has(`${l}${s.key}`));
  const send = (call: Call) => {
    if (confirm && armed !== call) {
      setArmed(call);
      return;
    }
    setLevel(null);
    setArmed(null);
    onCall(call);
  };
  return (
    <View style={styles.bidPad}>
      <View style={styles.bidRow}>
        {[1, 2, 3, 4, 5, 6, 7].map((l) => (
          <Pressable
            key={l}
            disabled={!levelHasBid(l)}
            onPress={() => {
              setLevel(level === l ? null : l);
              setArmed(null);
            }}
            style={[
              styles.bidKey,
              level === l && styles.bidKeyOn,
              !levelHasBid(l) && styles.bidKeyDim,
            ]}
          >
            <Text style={[styles.bidKeyText, level === l && styles.bidKeyTextOn]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.bidRow}>
        {STRAINS.map((s) => {
          const call = level ? `${level}${s.key}` : null;
          const ok = !!call && legal.has(call);
          return (
            <Pressable
              key={s.key}
              disabled={!ok}
              onPress={() => call && send(call)}
              style={[styles.bidKey, !ok && styles.bidKeyDim, armed === call && styles.bidKeyOn]}
            >
              <Text style={[styles.bidKeyText, s.red && { color: "#c0392b" }]}>{s.label}</Text>
            </Pressable>
          );
        })}
        {(["P", "X", "XX"] as Call[]).map((c) => (
          <Pressable
            key={c}
            disabled={!legal.has(c)}
            onPress={() => send(c)}
            style={[styles.bidKey, styles.bidKeyWide, !legal.has(c) && styles.bidKeyDim, armed === c && styles.bidKeyOn]}
          >
            <Text style={styles.bidKeyText}>{c === "P" ? "Pass" : c}</Text>
          </Pressable>
        ))}
      </View>
      {confirm && armed && (
        <Pressable onPress={() => send(armed)} style={styles.confirmKey}>
          <Text style={styles.confirmKeyText}>Confirm {callLabel(armed)}</Text>
        </Pressable>
      )}
    </View>
  );
}

function TrickAreaView({
  trick,
  w,
  stage,
}: {
  trick: { leader: Seat; plays: { seat: Seat; card: Card }[] };
  w: number;
  stage: number;
}) {
  const box = Math.min(stage * 0.42, 190);
  const h = w * 1.45;
  const spot: Record<Seat, object> = {
    N: { top: 0, left: box / 2 - w / 2 },
    S: { bottom: 0, left: box / 2 - w / 2 },
    W: { left: 0, top: box / 2 - h / 2 },
    E: { right: 0, top: box / 2 - h / 2 },
  };
  return (
    <View style={{ width: box, height: box }}>
      {trick.plays.map((p) => (
        <View key={p.seat} style={[{ position: "absolute" }, spot[p.seat]]}>
          <CardFace card={p.card} w={w} />
        </View>
      ))}
    </View>
  );
}

function AuctionBoxView({ state }: { state: GameState }) {
  const calls = state.auction;
  return (
    <View style={styles.auctionBox}>
      <Text style={styles.auctionTitle}>
        {calls.length === 0 ? "The auction opens" : "The auction"}
      </Text>
      <View style={styles.auctionFlow}>
        {calls.map((a, i) => (
          <Text
            key={i}
            style={[
              styles.auctionChip,
              { color: /[HD]/.test(a.call[1] ?? "") && a.call.length === 2 ? "#c0392b" : Brand.ink },
            ]}
          >
            {a.seat} {callLabel(a.call)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function ResultCardView({
  contract,
  line,
  points,
  note,
}: {
  contract: { level: number; strain: string; declarer: Seat } | null;
  line: string;
  points: string;
  note?: string;
}) {
  return (
    <View style={styles.resultCard}>
      <Text style={styles.resultTitle}>
        {contract
          ? `${contract.level}${contract.strain === "N" ? "NT" : SUIT_GLYPH[contract.strain]} by ${contract.declarer}`
          : "Passed out"}
      </Text>
      <Text style={styles.resultLine}>{line}</Text>
      {points ? <Text style={styles.resultPoints}>{points}</Text> : null}
      {note ? <Text style={styles.resultNote}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1d5c46" },
  loadingText: { fontFamily: Fonts.body, fontSize: 14, color: Brand.cream },

  felt: { flex: 1, backgroundColor: "#1d5c46" },
  feltInner: { padding: 12, paddingBottom: 28, gap: 10 },

  topBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  topChip: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 11.5,
    color: Brand.cream,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  topChipStrong: { backgroundColor: Brand.cream, color: Brand.ink },

  northBand: { alignItems: "center", gap: 6 },
  middleBand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 150,
  },
  sideSeat: { alignItems: "center", gap: 6, maxWidth: 92 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  southBand: { alignItems: "center", gap: 8, marginTop: 4 },

  plate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 999,
    paddingRight: 10,
    overflow: "hidden",
  },
  plateOnTurn: { backgroundColor: Brand.cream },
  plateStrip: { width: 6, alignSelf: "stretch" },
  plateSeat: { fontFamily: Fonts.bodySemibold, fontSize: 12, color: Brand.cream, paddingVertical: 4 },
  plateName: { fontFamily: Fonts.body, fontSize: 11.5, color: "rgba(255,255,255,0.85)", maxWidth: 110 },

  handRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap" },

  auctionBox: {
    backgroundColor: "rgba(255,254,250,0.94)",
    borderRadius: 12,
    padding: 10,
    maxWidth: 230,
  },
  auctionTitle: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: "#8b9a93",
    textTransform: "uppercase",
    marginBottom: 6,
    textAlign: "center",
  },
  auctionFlow: { flexDirection: "row", flexWrap: "wrap", gap: 5, justifyContent: "center" },
  auctionChip: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 12.5,
    backgroundColor: "#f1ede3",
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: "hidden",
  },

  resultCard: {
    backgroundColor: "#fffefa",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
    gap: 3,
    maxWidth: 240,
  },
  resultTitle: { fontFamily: Fonts.displayMedium, fontSize: 17, color: Brand.ink },
  resultLine: { fontFamily: Fonts.body, fontSize: 13, color: "#5e5749" },
  resultPoints: { fontFamily: Fonts.display, fontSize: 22, color: Brand.ink },
  resultNote: { fontFamily: Fonts.body, fontSize: 11.5, color: "#8b9a93", textAlign: "center" },

  bidPad: {
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 14,
    padding: 8,
    gap: 6,
    marginTop: 4,
  },
  bidRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  bidKey: {
    minWidth: 38,
    alignItems: "center",
    backgroundColor: "#fffefa",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  bidKeyWide: { minWidth: 52 },
  bidKeyOn: { backgroundColor: Brand.cream, borderWidth: 2, borderColor: Brand.maroon },
  bidKeyDim: { opacity: 0.35 },
  bidKeyText: { fontFamily: Fonts.bodySemibold, fontSize: 15, color: Brand.ink },
  bidKeyTextOn: { color: Brand.maroon },
  confirmKey: {
    alignSelf: "center",
    backgroundColor: Brand.cream,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginTop: 2,
  },
  confirmKeyText: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.ink },

  challengeStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  challengeTitle: { flex: 1, fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: Brand.white },
  challengeCount: { fontFamily: Fonts.body, fontSize: 11.5, color: "rgba(255,255,255,0.8)" },
  challengeResults: { fontFamily: Fonts.bodySemibold, fontSize: 12.5 },

  onwardBar: {
    backgroundColor: Brand.cream,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    gap: 2,
  },
  onwardLabel: { fontFamily: Fonts.bodySemibold, fontSize: 14, color: Brand.ink },
  onwardNote: { fontFamily: Fonts.body, fontSize: 11.5, color: "#7b7466", textAlign: "center" },

  transportRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  transportChip: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1,
    borderColor: "rgba(255,244,215,0.4)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  transportChipText: { fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.cream },
  benChip: {
    alignSelf: "center",
    backgroundColor: Brand.cream,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  benChipText: { fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: Brand.ink },
  savedNote: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 12.5,
    color: Brand.cream,
    textAlign: "center",
  },

  actError: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 12.5,
    color: Brand.white,
    backgroundColor: "#b91c1c",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: "center",
    overflow: "hidden",
  },
  pendingNote: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 16,
    color: "rgba(255,244,215,0.7)",
    textAlign: "center",
  },
});
