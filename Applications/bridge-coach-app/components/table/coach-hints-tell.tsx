// CoachHints / CoachTell — apps/bridge-web components/table/play/
// CoachHintsTell.tsx ported 1:1 to RN (owner direction 2026-08-12: paste and
// rewire):
//
//   · CoachHints — HINTS: five face-down hints for the decision on the table,
//     written in one request and opened one at a time. The ladder is the
//     design: stopping early is a win. Prefetched when the decision lands.
//   · CoachTell — TELL: the answers side by side — the coach's own card
//     (WhatShouldIPlay) and BEN's choice with its candidate scores.

import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  fetchBenTell,
  fetchHints,
  type BenTell,
  type CoachAuth,
} from "../../lib/table/coach";
import { RedSuits, SERIF, WhatShouldIPlay } from "./coach-event-ask";

// The BirdBridge palette, as CoachPanel uses it.
const PAPER = "#ffffff";
const INK = "#1f1f1f";
const MUTED = "#7b7466";
const FAINT = "#a49d8e";
const FELT_DEEP = "#541015";
const FELT_MID = "#105431";
const FELT_SOFT = "#f6ead0";
const FELT_LINE = "#e0d7c2";
/** BEN's badge blue — the same one CoachPanel's note badges wear. */
const BEN_BLUE = "#384bb3";

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

/* ════════════════════════════════════════════════════════════════════════════
   HINTS — five rungs, opened one at a time
   ════════════════════════════════════════════════════════════════════════════ */

const HINT_COUNT = 5;

/** "Hint 1" … "Hint 4", and the last rung says what it costs to open. */
const rungName = (i: number): string => (i === HINT_COUNT - 1 ? "The answer" : `Hint ${i + 1}`);

type HintsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; hints: string[] }
  | { kind: "empty"; reason: string };

export function CoachHints({
  auth,
  sessionId,
  epoch,
  active,
}: {
  auth: CoachAuth;
  sessionId: string;
  epoch: string;
  active: boolean;
}) {
  const [state, setState] = useState<HintsState>({ kind: "idle" });
  // The ladder only goes down: opened rungs stay open, nothing re-locks.
  const [revealed, setRevealed] = useState(0);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const r = await fetchHints(auth, sessionId, epoch);
      if (r.hints?.length === HINT_COUNT) {
        setState({ kind: "ready", hints: r.hints });
      } else {
        setState({ kind: "empty", reason: r.reason ?? "no answer" });
      }
    } catch {
      setState({ kind: "empty", reason: "unreachable" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.programId, sessionId, epoch]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // Revealing never fetches — it only turns over the next rung.
  const reveal = () => setRevealed((n) => Math.min(n + 1, HINT_COUNT));

  if (!active) {
    return (
      <View style={styles.section}>
        <SectionLabel>HINTS</SectionLabel>
        <Text style={styles.mutedLine}>
          Hints are for a decision that’s in front of you — they’ll be here when it’s your turn.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionLabel>HINTS</SectionLabel>
      <Text style={[styles.mutedLine, { marginBottom: 10, fontSize: 12.5 }]}>
        Five hints for this decision, each giving away a little more. Open them one at a time —
        stopping early is the win.
      </Text>

      <View style={{ gap: 6 }}>
        {Array.from({ length: HINT_COUNT }, (_, i) => {
          const isOpen = state.kind === "ready" && i < revealed;
          const isNext =
            (state.kind === "ready" && i === revealed) || (state.kind !== "ready" && i === 0);
          const isAnswer = i === HINT_COUNT - 1;

          if (isOpen) {
            const hint = (state as { hints: string[] }).hints[i] ?? "";
            return (
              <View key={i} style={styles.rungOpen}>
                <View style={[styles.rungNo, { backgroundColor: isAnswer ? FELT_DEEP : FELT_MID }]}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontSize: 9.5,
                      fontWeight: "700",
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      color: isAnswer ? FELT_DEEP : FAINT,
                    }}
                  >
                    {rungName(i)}
                  </Text>
                  <Text style={{ fontFamily: SERIF, fontSize: 13.5, lineHeight: 20, color: INK }}>
                    <RedSuits>{hint}</RedSuits>
                  </Text>
                </View>
              </View>
            );
          }

          if (isNext && state.kind !== "empty") {
            const loading = state.kind === "loading";
            return (
              <Pressable
                key={i}
                onPress={reveal}
                disabled={loading}
                style={[
                  styles.rungNext,
                  { borderColor: loading ? FELT_LINE : FELT_MID, opacity: loading ? 0.7 : 1 },
                ]}
              >
                <View style={[styles.rungNo, styles.rungNoNext]}>
                  <Text style={{ color: FELT_MID, fontSize: 11, fontWeight: "700" }}>{i + 1}</Text>
                </View>
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: loading ? FAINT : FELT_MID }}>
                  {loading
                    ? "Writing your hints — a few seconds…"
                    : isAnswer
                      ? "Show the answer"
                      : `Reveal ${rungName(i).toLowerCase()}`}
                </Text>
              </Pressable>
            );
          }

          return (
            <View key={i} accessibilityLabel={`${rungName(i)} — locked`} style={styles.rungLocked}>
              <View style={[styles.rungNo, { backgroundColor: FELT_SOFT }]}>
                <Text style={{ color: FAINT, fontSize: 11, fontWeight: "700" }}>{i + 1}</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: "600", color: FAINT }}>{rungName(i)}</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 11, color: FAINT }}>●●●</Text>
            </View>
          );
        })}
      </View>

      {state.kind === "empty" && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Text style={styles.mutedItalic}>
            {state.reason === "not your turn"
              ? "Not your turn — hints come back when the next decision is yours."
              : "No hints for this position right now."}
          </Text>
          {state.reason !== "not your turn" && (
            <Pressable onPress={() => void load()} style={styles.tryAgain}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: FELT_MID }}>Try again</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   TELL — the answers, side by side, each labelled with who is talking
   ════════════════════════════════════════════════════════════════════════════ */

type TellState =
  | { kind: "loading" }
  | { kind: "done"; tell: BenTell }
  | { kind: "empty"; reason: string };

export function CoachTell({
  auth,
  sessionId,
  epoch,
  phase,
  active,
}: {
  auth: CoachAuth;
  sessionId: string;
  epoch: string;
  phase: "auction" | "play" | "other";
  active: boolean;
}) {
  const [ben, setBen] = useState<TellState>({ kind: "loading" });

  // No button: BEN starts thinking when the decision lands (the prefetch) and
  // this screen just reads the shared promise.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetchBenTell(auth, sessionId, epoch);
        if (!alive) return;
        setBen(r.tell ? { kind: "done", tell: r.tell } : { kind: "empty", reason: r.reason ?? "no answer" });
      } catch {
        if (alive) setBen({ kind: "empty", reason: "unreachable" });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.programId, sessionId, epoch, active]);

  const benVerb = phase === "auction" ? "bid" : "play";

  return (
    <View style={{ gap: 14 }}>
      {/* ── the coach's own answer — the existing advice, reused whole ── */}
      {phase === "play" && active && (
        <View style={styles.section}>
          <SectionLabel>YOUR COACH</SectionLabel>
          <WhatShouldIPlay auth={auth} sessionId={sessionId} epoch={epoch} />
        </View>
      )}

      {/* ── BEN's answer — a second opinion, labelled as one ── */}
      <View style={styles.section}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 7 }}>
          <View style={styles.benBadge}>
            <Text style={{ color: "#fff", fontSize: 9.5, fontWeight: "700" }}>BEN</Text>
          </View>
          <Text style={styles.sectionLabelInline}>NEURAL ENGINE</Text>
        </View>
        <Text style={[styles.mutedLine, { marginBottom: 8, fontSize: 12.5 }]}>
          BEN is a neural player, not your system — where it agrees with your coach is worth
          noticing, and where it doesn’t is worth thinking about.
        </Text>

        {!active ? (
          <Text style={styles.mutedItalic}>
            BEN answers when the decision is yours — come back on your turn.
          </Text>
        ) : (
          <>
            {ben.kind === "loading" && (
              <Text style={styles.mutedItalic}>
                {phase === "play"
                  ? "BEN is simulating the play — this can take up to a minute…"
                  : "BEN is thinking — a few seconds…"}
              </Text>
            )}
            {ben.kind === "empty" && (
              <Text style={styles.mutedItalic}>
                {ben.reason === "not your turn"
                  ? "Not your turn — BEN answers when the next decision is yours."
                  : "BEN has no answer for this one right now."}
              </Text>
            )}
            {ben.kind === "done" && (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: MUTED }}>BEN would {benVerb}</Text>
                  <View style={styles.cardChip}>
                    <Text
                      style={{
                        fontSize: 14.5,
                        fontWeight: "700",
                        lineHeight: 17,
                        color: /[♥♦]/.test(ben.tell.action) ? "#c00" : "#000",
                      }}
                    >
                      {ben.tell.action}
                    </Text>
                  </View>
                  {typeof ben.tell.score === "number" && (
                    <Text style={{ fontSize: 11, color: FAINT }}>score {ben.tell.score.toFixed(2)}</Text>
                  )}
                </View>
                {ben.tell.because && (
                  <Text style={{ fontFamily: SERIF, fontSize: 13, lineHeight: 19.5, color: INK }}>
                    <RedSuits>{ben.tell.because}</RedSuits>
                  </Text>
                )}
                {ben.tell.alternatives.length > 0 && (
                  <View>
                    <Text
                      style={{
                        fontSize: 9.5,
                        fontWeight: "700",
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        color: FAINT,
                        marginTop: 3,
                        marginBottom: 4,
                      }}
                    >
                      IT ALSO WEIGHED
                    </Text>
                    <View style={{ gap: 3 }}>
                      {ben.tell.alternatives.map((alt) => (
                        <View
                          key={alt.action}
                          style={{ flexDirection: "row", alignItems: "baseline", gap: 7 }}
                        >
                          <Text style={{ minWidth: 40, fontWeight: "700", fontSize: 12.5, color: INK }}>
                            <RedSuits>{alt.action}</RedSuits>
                          </Text>
                          <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: FAINT }}>
                            {typeof alt.score === "number" ? `score ${alt.score.toFixed(2)}` : ""}
                            {alt.because
                              ? `${typeof alt.score === "number" ? " — " : ""}${alt.because}`
                              : ""}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: "#e8ddc3",
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: FELT_DEEP,
    marginBottom: 7,
  },
  sectionLabelInline: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: FELT_DEEP,
  },
  mutedLine: { fontSize: 13, lineHeight: 19.5, color: MUTED },
  mutedItalic: { fontSize: 12.5, color: MUTED, fontStyle: "italic" },
  benBadge: {
    height: 16,
    paddingHorizontal: 5,
    backgroundColor: BEN_BLUE,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  cardChip: {
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
  },
  rungOpen: {
    flexDirection: "row",
    gap: 9,
    alignItems: "flex-start",
    backgroundColor: FELT_SOFT,
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#e0cfa4",
  },
  rungNo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rungNoNext: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: FELT_MID,
    marginTop: 0,
  },
  rungNext: {
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    width: "100%",
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: PAPER,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 9,
  },
  rungLocked: {
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: FELT_LINE,
    borderRadius: 9,
    opacity: 0.65,
  },
  tryAgain: {
    minHeight: 26,
    paddingVertical: 3,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: FELT_MID,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
});
