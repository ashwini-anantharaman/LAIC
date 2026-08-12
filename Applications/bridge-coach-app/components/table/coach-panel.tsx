// CoachPanel — apps/bridge-web components/table/play/CoachPanel.tsx ported
// 1:1 to RN (owner direction 2026-08-12: the ORIGINAL coach, pasted into the
// mobile space and rewired — same palette, same four screens, same flip
// cards, same bidding diagram, comment for comment where the code renders):
//
//   · CoachDock — the coach band's body: slim identity row (the sunset chip,
//     the serif name, the green ⤢) over CoachNow condensed.
//   · CoachSheet — the full original sheet behind the ⤢: the maroon header,
//     the Now/Hints/Tell/History tab pills with their speech-bubble icons,
//     and the four screens.
//   · CoachNow — Game state (flip cards) + realistic choices + the chat.
//
// Not ported: CoachFab (the draggable felt chip — table2 uses the dock, the
// fab never mounts on this page) and the guided-mode notes block (the page
// never passes `notes`; presence here is always "request", as the web dock
// hard-codes). Everything that RENDERS on the table2 page is here.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

import {
  boardEpoch,
  decisionEpoch,
  useCoachPrefetch,
  type CoachAuth,
  type CoachLookingEvent,
  type CoachPanelData,
  type KnownCard,
  type ThinkAid,
} from "../../lib/table/coach";
import { CoachChat, CoachEventAsk, RedSuits, SERIF } from "./coach-event-ask";
import { CoachHints, CoachTell } from "./coach-hints-tell";

// ── the BirdBridge palette (CoachPanel.tsx:55-74, names kept 1:1) ────────────
const HEAD = "#fff4d7";
const PAPER = "#ffffff";
const INK = "#1f1f1f";
const MUTED = "#7b7466";
const FAINT = "#a49d8e";
const FELT_DEEP = "#541015";
const FELT_MID = "#105431";
const FELT_SOFT = "#f6ead0";
const FELT_LINE = "#e0d7c2";
const GOLD = "#f5a95b";
/** The coach chip — the web's radial gradient rendered at its mid colour. */
const CHIP = "#e8853f";

/** How present the coach is. The dock hard-codes "request" (the web's own). */
const PRESENCE = {
  silent: { label: "Silent", sub: "Tracking quietly — won't interrupt" },
  request: { label: "On request", sub: "Watching this hand — ask any time" },
  guided: { label: "Guided", sub: "Guided — I'll flag what's worth a look" },
} as const;
type CoachPresence = keyof typeof PRESENCE;

function Label({ children, color = FAINT }: { children: string; color?: string }) {
  return (
    <Text
      style={{
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 0.7,
        textTransform: "uppercase",
        color,
        marginBottom: 7,
      }}
    >
      {children}
    </Text>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   THE DOCK — the coach band's whole body
   ════════════════════════════════════════════════════════════════════════════ */

export function CoachDock({ data, auth }: { data: CoachPanelData; auth: CoachAuth }) {
  const [open, setOpen] = useState(false);
  // The dock never unmounts while the table is up — the one reliable place to
  // start writing this decision's hints and advice.
  useCoachPrefetch(auth, data.ask, decisionEpoch(data));
  return (
    <View style={styles.dockRoot}>
      <View style={styles.dockHeader}>
        <View style={styles.chip22}>
          <Text style={{ color: FELT_DEEP, fontSize: 11 }}>♠</Text>
        </View>
        <Text style={{ fontFamily: SERIF, fontSize: 14.5, fontWeight: "700", color: INK }}>Coach</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityLabel="Open the full coach"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.expandBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={{ color: "#fff", fontSize: 13, lineHeight: 15 }}>⤢</Text>
        </Pressable>
      </View>
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingTop: 3, paddingHorizontal: 12, paddingBottom: 14 }}
      >
        <CoachNow data={data} auth={auth} condensed />
      </ScrollView>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <CoachSheet data={data} auth={auth} presence="request" onClose={() => setOpen(false)} />
      </Modal>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   THE SHEET — rises over the table, which stays visible above it
   ════════════════════════════════════════════════════════════════════════════ */

export function CoachSheet({
  data,
  auth,
  presence,
  onClose,
}: {
  data: CoachPanelData;
  auth: CoachAuth;
  presence: CoachPresence;
  onClose: () => void;
}) {
  // The context card's event rows: an accordion, one open at a time.
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  // Which history sections the learner toggled; untouched falls back to the
  // board's own default (the current section open).
  const [groupToggles, setGroupToggles] = useState<Record<string, boolean>>({});
  const groupOpen = (g: { id: string; current?: boolean }) => groupToggles[g.id] ?? Boolean(g.current);
  // The auction diagram's selected call — meaning + ask open below the grid.
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  // Prefetch: the screens open onto answers, not spinners.
  useCoachPrefetch(auth, data.ask, decisionEpoch(data));
  // FOUR SCREENS: Now faces forward; Hints is the ladder; Tell the answers;
  // History faces back with both records as collapsible sections.
  const [view, setView] = useState<"now" | "hints" | "tell" | "history">("now");
  const [historyToggles, setHistoryToggles] = useState<Record<string, boolean>>({});

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        accessibilityLabel="Close the coach"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(42,5,6,.44)" }}
      />
      <View style={styles.sheet}>
        {/* ── the header IS the felt: the sheet rises out of the table ── */}
        <View style={{ backgroundColor: FELT_DEEP }}>
          <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 2 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,.4)" }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4, paddingHorizontal: 14, paddingBottom: 11 }}>
            <View style={styles.roundel38}>
              <Text style={{ color: FELT_DEEP, fontSize: 17 }}>♠</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: SERIF, fontSize: 17, fontWeight: "700", lineHeight: 20, color: "#fff" }}>
                {data.title ?? "Coach"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: presence !== "silent" ? GOLD : "rgba(255,255,255,.45)",
                  }}
                />
                <Text style={{ fontSize: 11.5, color: "rgba(255,244,215,.85)" }}>
                  <Text style={{ fontWeight: "700", color: "#fff" }}>{PRESENCE[presence].label}</Text>
                  {` · ${PRESENCE[presence].sub}`}
                </Text>
              </View>
            </View>
            {/* A PLACEHOLDER, ON PURPOSE: settings will grow back into the gear. */}
            <View style={styles.headerBtn}>
              <Text style={{ color: "#f2f2ea", fontSize: 16, lineHeight: 18 }}>⚙︎</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.headerBtn}>
              <Text style={{ color: "#f2f2ea", fontSize: 16, lineHeight: 18 }}>×</Text>
            </Pressable>
          </View>
        </View>

        {/* ── the four screens, each wearing its icon: a speech bubble carrying
            an eye / a bulb / a check / a clock ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 6, paddingTop: 10, paddingHorizontal: 14 }}
        >
          {(["now", "hints", "tell", "history"] as const).map((v) => {
            const on = view === v;
            return (
              <Pressable
                key={v}
                accessibilityLabel={v === "now" ? "Now" : v === "hints" ? "Hints" : v === "tell" ? "Tell" : "History"}
                onPress={() => setView(v)}
                style={{
                  minHeight: 30,
                  paddingVertical: 3,
                  paddingHorizontal: 12,
                  borderRadius: 15,
                  backgroundColor: on ? FELT_MID : "transparent",
                  borderWidth: 1,
                  borderColor: on ? FELT_MID : FELT_LINE,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <TabGlyph kind={v} color={on ? "#fff" : "#8a8071"} />
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ paddingTop: 13, paddingHorizontal: 14, paddingBottom: 18, gap: 14 }}
        >
          {/* ── NOW: the default screen, shared with the table's coach band ── */}
          {view === "now" && <CoachNow data={data} auth={auth} />}

          {/* ── HINTS: five hints, opened one at a time; keyed per decision ── */}
          {view === "hints" &&
            (data.ask ? (
              <CoachHints
                key={decisionEpoch(data)}
                auth={auth}
                sessionId={data.ask.sessionId}
                epoch={decisionEpoch(data)}
                active={data.ask.active}
              />
            ) : (
              <Text style={styles.watcherLine}>
                Hints are for a player with a decision in front of them — take a seat to use them.
              </Text>
            ))}

          {/* ── TELL: the answers, side by side ── */}
          {view === "tell" &&
            (data.ask ? (
              <CoachTell
                key={decisionEpoch(data)}
                auth={auth}
                sessionId={data.ask.sessionId}
                epoch={decisionEpoch(data)}
                phase={data.ask.phase}
                active={data.ask.active}
              />
            ) : (
              <Text style={styles.watcherLine}>
                The answers are for a player with a decision in front of them — take a seat to see them.
              </Text>
            ))}

          {/* ── HISTORY: the auction and the play, two collapsible sections ── */}
          {view === "history" &&
            (() => {
              const tricks = (data.eventGroups ?? []).filter((g) => g.id !== "auction");
              const auction = (data.eventGroups ?? []).find((g) => g.id === "auction");
              const auctionOpen = historyToggles["auction"] ?? tricks.length === 0;
              const playOpen = historyToggles["play"] ?? tricks.length > 0;
              return (
                <>
                  <View style={styles.historyCard}>
                    <HistorySectionHeader
                      title="The auction"
                      open={auctionOpen}
                      count={auction?.events.length ?? 0}
                      onToggle={() => setHistoryToggles((prev) => ({ ...prev, auction: !auctionOpen }))}
                    />
                    {auctionOpen &&
                      (auction?.events.length ? (
                        <AuctionDiagram
                          events={auction.events}
                          selectedId={selectedCall}
                          onSelect={setSelectedCall}
                          auth={auth}
                          {...(data.ask ? { ask: { sessionId: data.ask.sessionId } } : {})}
                        />
                      ) : (
                        <Text style={[styles.watcherLine, { marginTop: 7 }]}>Nobody has called yet.</Text>
                      ))}
                  </View>

                  <View style={styles.historyCard}>
                    <HistorySectionHeader
                      title="The play"
                      open={playOpen}
                      count={tricks.reduce((n, g) => n + g.events.length, 0)}
                      onToggle={() => setHistoryToggles((prev) => ({ ...prev, play: !playOpen }))}
                    />
                    {playOpen &&
                      (tricks.length ? (
                        <View>
                          {tricks.map((group) => {
                            const isOpen = groupOpen(group);
                            return (
                              <View key={group.id}>
                                <Pressable
                                  onPress={() => setGroupToggles((prev) => ({ ...prev, [group.id]: !isOpen }))}
                                  style={styles.trickHeader}
                                >
                                  <Text
                                    style={{
                                      fontSize: 9.5,
                                      fontWeight: "700",
                                      letterSpacing: 0.6,
                                      textTransform: "uppercase",
                                      color: isOpen ? FELT_DEEP : FAINT,
                                    }}
                                  >
                                    {group.title}
                                  </Text>
                                  {group.note ? (
                                    <Text style={{ fontSize: 10.5, fontWeight: "500", color: FAINT }}>
                                      · {group.note}
                                    </Text>
                                  ) : null}
                                  <View style={{ flex: 1 }} />
                                  {!isOpen && (
                                    <Text style={{ fontSize: 10, color: FAINT }}>{group.events.length}</Text>
                                  )}
                                  <Text
                                    style={{
                                      width: 13,
                                      textAlign: "center",
                                      color: FELT_MID,
                                      fontSize: 9,
                                      transform: isOpen ? [{ rotate: "180deg" }] : [],
                                    }}
                                  >
                                    ▼
                                  </Text>
                                </Pressable>
                                {isOpen &&
                                  group.events.map((ev) => (
                                    <EventRow
                                      key={ev.id}
                                      event={ev}
                                      open={openEvent === ev.id}
                                      onToggle={() => setOpenEvent(openEvent === ev.id ? null : ev.id)}
                                    />
                                  ))}
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={[styles.watcherLine, { marginTop: 7 }]}>
                          No cards have been played yet.
                        </Text>
                      ))}
                  </View>
                </>
              );
            })()}
        </ScrollView>
      </View>
    </View>
  );
}

/**
 * The forward tabs' pictograms: a speech bubble — the coach speaking —
 * carrying the screen's symbol (eye / bulb / check / clock). Monochrome in
 * the pill's own colour, exactly as the web draws them.
 */
function TabGlyph({ kind, color }: { kind: "now" | "hints" | "tell" | "history"; color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {/* the bubble, tail bottom-left */}
      <Path d="M6 3h12a3.5 3.5 0 0 1 3.5 3.5v7.5a3.5 3.5 0 0 1-3.5 3.5h-7.4l-3.85 3.6v-3.6H6A3.5 3.5 0 0 1 2.5 14V6.5A3.5 3.5 0 0 1 6 3Z" />
      {kind === "now" && (
        <>
          <Path d="M6.2 10.4c1.1-2 3.2-3.4 5.8-3.4s4.7 1.4 5.8 3.4c-1.1 2-3.2 3.4-5.8 3.4s-4.7-1.4-5.8-3.4Z" />
          <Circle cx={12} cy={10.4} r={1.7} fill={color} stroke="none" />
        </>
      )}
      {kind === "hints" && (
        <>
          <Path d="M12 6.6a3.3 3.3 0 0 1 1.5 6.24c-.25.14-.4.3-.4.52v.24h-2.2v-.24c0-.22-.15-.38-.4-.52A3.3 3.3 0 0 1 12 6.6Z" />
          <Path d="M10.9 15.5h2.2" />
          <G strokeWidth={1.3}>
            <Path d="M12 3.8v1" />
            <Path d="M7.4 5.7l.7.7" />
            <Path d="M16.6 5.7l-.7.7" />
            <Path d="M5.4 10.2h1" />
            <Path d="M17.6 10.2h1" />
          </G>
        </>
      )}
      {kind === "tell" && <Path d="M7.8 10.8l3 3.1 5.4-6.3" strokeWidth={2.1} />}
      {kind === "history" && (
        <>
          <Circle cx={12} cy={10.4} r={4.6} />
          <Path d="M12 7.9v2.5l1.9 1.4" />
        </>
      )}
    </Svg>
  );
}

/** A History card's own header — the whole row toggles its section. */
function HistorySectionHeader({
  title,
  open,
  count,
  onToggle,
}: {
  title: string;
  open: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 26 }}>
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.7,
          textTransform: "uppercase",
          color: open ? FELT_DEEP : FAINT,
        }}
      >
        {title}
      </Text>
      <View style={{ flex: 1 }} />
      {!open && count > 0 && <Text style={{ fontSize: 10, color: FAINT }}>{count}</Text>}
      <Text
        style={{
          width: 13,
          textAlign: "center",
          color: FELT_MID,
          fontSize: 9,
          transform: open ? [{ rotate: "180deg" }] : [],
        }}
      >
        ▼
      </Text>
    </Pressable>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   NOW — the position, the scaffold, the chat (the dock's default screen)
   ════════════════════════════════════════════════════════════════════════════ */

export function CoachNow({
  data,
  auth,
  condensed = false,
}: {
  data: CoachPanelData;
  auth: CoachAuth;
  condensed?: boolean;
}) {
  // A new trick is a new conversation: the chat keys on where the board is.
  const epoch = boardEpoch(data);
  return (
    <View style={{ gap: 14 }}>
      {/* THE GAME STATE: one section of small flip cards — a glanceable value
          on the front, the full fact on the back. Condensed keeps only the
          position's own facts; the worked-out cards belong to the sheet. */}
      {(data.looking || !!data.facts?.length) && (
        <GameState
          {...(data.looking ? { looking: data.looking } : {})}
          facts={data.facts ?? []}
          known={condensed ? [] : (data.aid?.knownCards ?? [])}
          epoch={epoch}
        />
      )}

      {/* the realistic choices, shown without being asked — sheet only */}
      {!condensed && data.aid && (data.aid.candidates.length > 0 || data.aid.noChoice) && (
        <ThinkCard aid={data.aid} />
      )}

      {/* the chat — anything about the position */}
      {data.ask && (
        <View>
          <Label>Ask the coach</Label>
          <CoachChat key={epoch} auth={auth} sessionId={data.ask.sessionId} />
        </View>
      )}
      {/* watchers see the honest empty state instead */}
      {!data.ask && data.watcher && <Text style={styles.watcherLine}>{data.placeholder}</Text>}
    </View>
  );
}

/* ── the Game State — the position as flip cards ───────────────────────────── */

type StateCard = { title: string; value: string; detail?: string };

function FlipCard({ card }: { card: StateCard }) {
  const [flipped, setFlipped] = useState(false);
  const rot = useRef(new Animated.Value(0)).current;
  const canFlip = Boolean(card.detail);
  const flip = () => {
    const to = flipped ? 0 : 1;
    setFlipped(!flipped);
    Animated.timing(rot, { toValue: to, duration: 450, useNativeDriver: true }).start();
  };
  const frontRot = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backRot = rot.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
  return (
    <Pressable
      onPress={canFlip ? flip : undefined}
      disabled={!canFlip}
      accessibilityLabel={card.detail ? `${card.title || card.value} — tap to flip` : card.value}
      style={{ position: "relative", minHeight: 54, flexGrow: 1, flexBasis: 86 }}
    >
      <Animated.View
        style={[
          styles.flipFace,
          {
            backgroundColor: "#f3ead4",
            borderColor: "#e8ddc3",
            transform: [{ perspective: 600 }, { rotateY: frontRot }],
            backfaceVisibility: "hidden",
          },
        ]}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: INK, lineHeight: 16, textAlign: "center" }}>
          <RedSuits>{card.value}</RedSuits>
        </Text>
        {card.title ? (
          <Text
            style={{
              marginTop: 2,
              fontSize: 8.5,
              fontWeight: "600",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: "#6b5f50",
              textAlign: "center",
            }}
          >
            {card.title}
          </Text>
        ) : null}
        {canFlip && (
          <Text style={{ position: "absolute", top: 3, right: 5, fontSize: 8, color: "#b3a789" }}>⟳</Text>
        )}
      </Animated.View>
      {canFlip && (
        <Animated.View
          style={[
            styles.flipFace,
            {
              backgroundColor: FELT_SOFT,
              borderColor: "#e0cfa4",
              transform: [{ perspective: 600 }, { rotateY: backRot }],
              backfaceVisibility: "hidden",
            },
          ]}
        >
          <Text style={{ fontSize: 9.5, lineHeight: 13, color: FELT_DEEP, fontWeight: "500", textAlign: "center" }}>
            <RedSuits>{card.detail!}</RedSuits>
          </Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

/**
 * The Game State section: the one-line position, then the cards — the hand's
 * own facts first, the worked-out inferences after them, one grid. Keyed by
 * `epoch` so a new trick deals a fresh set with every card face up.
 */
function GameState({
  looking,
  facts,
  known,
  epoch,
}: {
  looking?: string;
  facts: readonly { label: string; value: string; detail?: string }[];
  known: readonly KnownCard[];
  epoch: string;
}) {
  const cards: StateCard[] = [
    ...facts.map((f) => ({ title: f.label, value: f.value, ...(f.detail ? { detail: f.detail } : {}) })),
    ...known.map((k) => ({ title: k.title, value: k.value, detail: k.detail })),
  ];
  return (
    <View style={styles.card}>
      <Label color={FELT_DEEP}>Game state</Label>
      {looking ? <Text style={{ fontSize: 13.5, lineHeight: 19.5, color: INK }}>{looking}</Text> : null}
      {cards.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: looking ? 9 : 0 }}>
          {cards.map((c) => (
            <FlipCard key={`${epoch}|${c.title}|${c.value}`} card={c} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The realistic choices, shown on the NOW view without being asked.
 * Candidates render in given order and are styled identically: any visual
 * difference between them reads as a recommendation.
 */
function ThinkCard({ aid }: { aid: ThinkAid }) {
  return (
    <View style={[styles.card, { gap: 11 }]}>
      {aid.candidates.length > 0 && (
        <View>
          <Label>Your realistic choices</Label>
          <View style={{ gap: 4 }}>
            {aid.candidates.map((c) => (
              <View key={c.label} style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Text style={{ minWidth: 42, fontWeight: "700", fontSize: 13.5, color: INK }}>
                  <RedSuits>{c.label}</RedSuits>
                </Text>
                {c.note ? (
                  <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19.5, color: FAINT }}>
                    <RedSuits>{c.note}</RedSuits>
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      )}
      {aid.noChoice ? (
        <Text style={{ fontSize: 13.5, lineHeight: 19.5, color: MUTED }}>{aid.noChoice}</Text>
      ) : null}
    </View>
  );
}

/* ── the auction, printed as a bidding box ──────────────────────────────────
   A column per seat in rotation from the dealer, each call a token in bidding
   order. Tapping a call selects it; its meaning and its ask box open below. */

const SEAT_ROTATION = ["N", "E", "S", "W"];

/** One call as a token: bids as card faces, Pass/Dbl/Rdbl as coloured chips. */
function CallToken({
  event,
  selected,
  onSelect,
}: {
  event: CoachLookingEvent;
  selected: boolean;
  onSelect: () => void;
}) {
  const isBid = Boolean(event.token);
  const text = event.token ?? (event.verb === "passed" ? "Pass" : event.verb === "doubled" ? "Dbl" : "Rdbl");
  const red = /[♥♦]/.test(text);
  return (
    <Pressable
      accessibilityLabel={event.label}
      onPress={onSelect}
      style={{
        width: "100%",
        minHeight: 28,
        paddingVertical: 3,
        paddingHorizontal: 2,
        backgroundColor: isBid ? "#fff" : event.verb === "passed" ? FELT_MID : "#b91c1c",
        borderWidth: 1,
        borderColor: selected ? FELT_DEEP : isBid ? "#d8d3bf" : "transparent",
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        ...(selected
          ? { shadowColor: GOLD, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 2, elevation: 3 }
          : { shadowColor: "#2a0506", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.75, shadowRadius: 0, elevation: 2 }),
      }}
    >
      <Text
        style={{
          fontSize: isBid ? 14 : 10.5,
          fontWeight: "700",
          lineHeight: isBid ? 17 : 13,
          textAlign: "center",
          color: isBid ? (red ? "#c00" : "#20201a") : "#fff",
          ...(isBid ? {} : { textTransform: "uppercase", letterSpacing: 0.4 }),
        }}
      >
        {text}
      </Text>
    </Pressable>
  );
}

function AuctionDiagram({
  events,
  selectedId,
  onSelect,
  ask,
  auth,
}: {
  events: readonly CoachLookingEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Present means the selected call's meaning panel carries a question box. */
  ask?: { sessionId: string };
  auth: CoachAuth;
}) {
  // The first call is the dealer's, so the column order falls out of the data.
  const dealer = events[0]?.seat ?? "N";
  const start = Math.max(0, SEAT_ROTATION.indexOf(dealer));
  const cols = [0, 1, 2, 3].map((i) => SEAT_ROTATION[(start + i) % 4]!);
  const bySeat = new Map<string, CoachLookingEvent[]>(cols.map((s) => [s, []]));
  for (const ev of events) bySeat.get(ev.seat ?? "")?.push(ev);
  const youSeat = events.find((e) => e.who === "You")?.seat;
  const selected = selectedId ? events.find((e) => e.id === selectedId) : undefined;

  return (
    <View style={{ paddingTop: 7, paddingBottom: 2 }}>
      <View style={{ flexDirection: "row", gap: 5 }}>
        {cols.map((s) => (
          <View key={s} style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {/* seat header — your seat wears the gold chip, the dealer is underlined */}
            <View
              style={{
                alignSelf: "center",
                minWidth: 21,
                height: 21,
                paddingHorizontal: 4,
                borderRadius: 5,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: s === youSeat ? CHIP : FELT_MID,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: s === youSeat ? FELT_DEEP : "#fff",
                  textDecorationLine: s === dealer ? "underline" : "none",
                }}
              >
                {s}
              </Text>
            </View>
            <View style={{ gap: 3, backgroundColor: FELT_SOFT, borderRadius: 8, padding: 4, minHeight: 40 }}>
              {(bySeat.get(s) ?? []).map((ev) => (
                <CallToken
                  key={ev.id}
                  event={ev}
                  selected={ev.id === selectedId}
                  onSelect={() => onSelect(ev.id === selectedId ? null : ev.id)}
                />
              ))}
            </View>
          </View>
        ))}
      </View>

      {/* ── the selected call: its meaning, and the way to ask about it ── */}
      {selected && (
        <View
          style={{
            marginTop: 8,
            borderRadius: 9,
            paddingTop: 9,
            paddingHorizontal: 11,
            paddingBottom: 4,
            backgroundColor: FELT_SOFT,
            borderWidth: 1,
            borderColor: FELT_LINE,
          }}
        >
          <Text
            style={{
              fontSize: 9.5,
              fontWeight: "700",
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: FELT_DEEP,
              marginBottom: 4,
            }}
          >
            Meaning ·{" "}
            <RedSuits>
              {`${
                selected.token ??
                (selected.verb === "doubled" ? "Double" : selected.verb === "redoubled" ? "Redouble" : "Pass")
              } by ${selected.who ?? "?"}`}
            </RedSuits>
          </Text>
          <Text
            style={{
              marginBottom: 6,
              fontFamily: SERIF,
              fontSize: 13.5,
              lineHeight: 20,
              color: selected.detail ? MUTED : FAINT,
            }}
          >
            {selected.detail ? (
              <RedSuits>{selected.detail}</RedSuits>
            ) : (
              "Your system notes don't cover this call."
            )}
          </Text>
          {ask && (
            <CoachEventAsk
              key={selected.id}
              auth={auth}
              sessionId={ask.sessionId}
              eventId={selected.id}
              eventLabel={selected.label}
              flush
            />
          )}
        </View>
      )}
    </View>
  );
}

/** The card or call itself, drawn as a small card face — red for ♥/♦. */
function TokenChip({ token }: { token: string }) {
  return (
    <View
      style={{
        paddingVertical: 2,
        paddingHorizontal: 8,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#d8d3bf",
        borderRadius: 4,
        shadowColor: "#2a0506",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.75,
        shadowRadius: 0,
        elevation: 2,
      }}
    >
      <Text
        style={{
          fontSize: 13.5,
          fontWeight: "700",
          lineHeight: 17,
          color: /[♥♦]/.test(token) ? "#c00" : "#20201a",
        }}
      >
        {token}
      </Text>
    </View>
  );
}

/**
 * One table event as a ledger line: seat badge, actor and verb, then the card
 * or call as a small card face. Rows with a `detail` expand to show it. The
 * learner's own rows get the coach's gold badge.
 */
function EventRow({
  event,
  open,
  onToggle,
}: {
  event: CoachLookingEvent;
  open: boolean;
  onToggle: () => void;
}) {
  const expandable = Boolean(event.detail);
  const isYou = event.who === "You";
  const structured = Boolean(event.who && event.verb);

  const content = structured ? (
    <>
      <View
        style={{
          width: 21,
          height: 21,
          borderRadius: 5,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isYou ? CHIP : FELT_MID,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "700", color: isYou ? FELT_DEEP : "#fff" }}>
          {event.seat}
        </Text>
      </View>
      <Text style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 17.5, color: INK }}>
        <Text style={{ fontWeight: "700" }}>{event.who}</Text>
        <Text style={{ color: MUTED }}> {event.verb}</Text>
      </Text>
      {event.token ? <TokenChip token={event.token} /> : null}
    </>
  ) : (
    <Text style={{ flex: 1, fontWeight: "600", fontSize: 13, lineHeight: 17.5, color: INK }}>
      <RedSuits>{event.label}</RedSuits>
    </Text>
  );

  // A fixed chevron slot whether or not there is one — a ledger's figures line up.
  const chevron = (
    <Text
      style={{
        width: 13,
        textAlign: "center",
        color: FELT_MID,
        fontSize: 10,
        transform: open ? [{ rotate: "180deg" }] : [],
      }}
    >
      {expandable ? "▼" : ""}
    </Text>
  );

  return (
    <View>
      <Pressable
        onPress={expandable ? onToggle : undefined}
        disabled={!expandable}
        accessibilityLabel={event.label}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          minHeight: 36,
          paddingVertical: 5,
          paddingHorizontal: 1,
          borderTopWidth: 1,
          borderTopColor: "#f2e8d2",
        }}
      >
        {content}
        {chevron}
      </Pressable>
      {open && (
        <Text
          style={{
            // Indented to the text column, under the actor it belongs to.
            marginBottom: 9,
            marginLeft: 29,
            paddingLeft: 10,
            fontFamily: SERIF,
            fontSize: 13.5,
            lineHeight: 20,
            color: MUTED,
            borderLeftWidth: 2,
            borderLeftColor: FELT_LINE,
          }}
        >
          <RedSuits>{event.detail ?? ""}</RedSuits>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dockRoot: { flex: 1, minHeight: 0, backgroundColor: HEAD },
  dockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 7,
    paddingHorizontal: 12,
    paddingBottom: 5,
  },
  chip22: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: CHIP,
    alignItems: "center",
    justifyContent: "center",
  },
  expandBtn: {
    width: 30,
    height: 26,
    borderRadius: 8,
    backgroundColor: FELT_MID,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  sheet: {
    height: "78%",
    backgroundColor: HEAD,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.34,
    shadowRadius: 26,
    elevation: 16,
  },
  roundel38: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: CHIP,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: "#e8ddc3",
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  historyCard: {
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: "#e8ddc3",
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  trickHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    minHeight: 30,
    paddingVertical: 4,
    paddingHorizontal: 1,
    borderTopWidth: 1,
    borderTopColor: "#e8ddc3",
  },
  watcherLine: { fontSize: 13, lineHeight: 19.5, color: MUTED },
  flipFace: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    paddingVertical: 5,
    paddingHorizontal: 7,
    overflow: "hidden",
  },
});
