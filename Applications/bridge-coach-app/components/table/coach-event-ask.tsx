// CoachEventAsk — apps/bridge-web components/table/play/CoachEventAsk.tsx
// ported 1:1 to RN (owner direction 2026-08-12: paste and rewire):
//
//   · CoachEventAsk — the QUESTION BOX behind an event's "Ask": free text
//     about that one event, answered through event-qa. Questions only.
//   · CoachChat — the panel's chat: general questions about the position;
//     exchanges stack up so the surface reads as a conversation.
//   · WhatShouldIPlay — the advice for the CURRENT decision, prefetched the
//     moment it lands, with the ⓘ source popup.
//
// The rewiring: fetches ride the coach client (bearer + x-program-id).

import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  askEvent,
  fetchPlayAdvice,
  type CoachAuth,
  type PlayHint,
} from "../../lib/table/coach";

// The BirdBridge palette, as CoachPanel uses it.
const PAPER = "#ffffff";
const INK = "#1f1f1f";
const MUTED = "#7b7466";
const FAINT = "#a49d8e";
const TEAL = "#105431";
const FELT_DEEP = "#541015";
const FELT_MID = "#105431";
const FELT_LINE = "#e0d7c2";

/** The coach's voice — one serif face for everything it says. */
export const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });

/** Text with ♥ and ♦ in red, as printed hand diagrams have them. */
export function RedSuits({ children }: { children: string }) {
  return (
    <>
      {children.split(/([♥♦])/).map((part, i) =>
        part === "♥" || part === "♦" ? (
          <Text key={i} style={{ color: "#c00" }}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** "DT" → "10♦" in the table's notation. */
function cardText(card: string): string {
  const glyph: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const rank = card.slice(1) === "T" ? "10" : card.slice(1);
  return `${rank}${glyph[card[0] ?? ""] ?? card[0] ?? ""}`;
}

/** The ask row's input + button pair — shared by the event ask and the chat. */
function AskRow({
  value,
  onChange,
  onSubmit,
  placeholder,
  busy,
  minH,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  busy: boolean;
  minH: number;
}) {
  const ok = !busy && !!value.trim();
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={FAINT}
        maxLength={300}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: minH,
          paddingVertical: 6,
          paddingHorizontal: 10,
          backgroundColor: PAPER,
          borderWidth: 1,
          borderColor: FELT_LINE,
          borderRadius: 8,
          fontSize: 12.5,
          color: INK,
        }}
      />
      <Pressable
        onPress={onSubmit}
        disabled={!ok}
        style={{
          minHeight: minH,
          paddingVertical: 6,
          paddingHorizontal: minH >= 36 ? 14 : 13,
          backgroundColor: ok ? FELT_MID : PAPER,
          borderWidth: 1,
          borderColor: ok ? FELT_MID : FELT_LINE,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: ok ? "#fff" : FAINT, fontSize: 12.5, fontWeight: "700" }}>Ask</Text>
      </Pressable>
    </View>
  );
}

export function CoachEventAsk({
  auth,
  sessionId,
  eventId,
  eventLabel,
  flush = false,
}: {
  auth: CoachAuth;
  sessionId: string;
  eventId: string;
  /** "West led the A♠" — echoed as the placeholder so the box names its subject. */
  eventLabel: string;
  /** Drop the ledger-row indent — for hosts that already frame this box. */
  flush?: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [qa, setQa] = useState<{ q: string; a: string } | { q: string; failed: true } | null>(null);

  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setQa(null);
    try {
      const body = await askEvent(auth, sessionId, q, eventId);
      setQa(body.answer ? { q, a: body.answer } : { q, failed: true });
    } catch {
      setQa({ q, failed: true });
    } finally {
      setAsking(false);
      setQuestion("");
    }
  }

  return (
    <View style={{ gap: 8, marginTop: 2, marginBottom: 9, marginLeft: flush ? 0 : 29 }}>
      <AskRow
        value={question}
        onChange={setQuestion}
        onSubmit={() => void ask()}
        placeholder={`Ask about "${eventLabel}"…`}
        busy={asking}
        minH={34}
      />
      {asking && <Text style={styles.thinking}>Thinking about it…</Text>}
      {qa && "a" in qa && (
        <View>
          <Text style={styles.q}>
            <RedSuits>{qa.q}</RedSuits>
          </Text>
          <Text style={styles.a}>
            <RedSuits>{qa.a}</RedSuits>
          </Text>
        </View>
      )}
      {qa && "failed" in qa && (
        <Text style={styles.thinking}>No answer for that one — try asking it another way.</Text>
      )}
    </View>
  );
}

/**
 * The panel's chat: general questions about the position, no event required.
 * Each question is answered independently against the current position; the
 * exchanges stack up so the surface reads as a conversation.
 */
export function CoachChat({ auth, sessionId }: { auth: CoachAuth; sessionId: string }) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [exchanges, setExchanges] = useState<{ q: string; a: string | null }[]>([]);

  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setQuestion("");
    try {
      const body = await askEvent(auth, sessionId, q);
      setExchanges((prev) => [...prev, { q, a: body.answer ?? null }]);
    } catch {
      setExchanges((prev) => [...prev, { q, a: null }]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      {exchanges.map((x, i) => (
        <View key={i}>
          <Text style={styles.q}>
            <RedSuits>{x.q}</RedSuits>
          </Text>
          <Text style={[styles.a, !x.a && { color: FAINT, fontStyle: "italic" }]}>
            {x.a ? <RedSuits>{x.a}</RedSuits> : "No answer for that one — try asking it another way."}
          </Text>
        </View>
      ))}
      {asking && <Text style={styles.thinking}>Thinking about it…</Text>}
      <AskRow
        value={question}
        onChange={setQuestion}
        onSubmit={() => void ask()}
        placeholder="Ask the coach about this position…"
        busy={asking}
        minH={36}
      />
    </View>
  );
}

/** Where each kind of answer comes from, for the ⓘ popup. */
const SOURCE_INFO: Record<PlayHint["source"], { title: string; from: string }> = {
  system: {
    title: "Your system plays",
    from: "Your partnership's system notes cover this position — this is what your side agreed to play.",
  },
  convention: {
    title: "Usually right here",
    from: "A general bridge guideline — the standard habit for positions like this.",
  },
  solution: {
    title: "By calculation",
    from: "A solver saw all four hands and tried every line. Each card shown keeps the maximum tricks — they are equals.",
  },
};

const WHY_DIFFERENT =
  "Your realistic choices is a neutral checklist of what you can see — it never peeks at the answer. This is the answer. A sensible-looking card can still cost a trick once every hand is known.";

type PlayAnswer =
  | { kind: "loading" }
  | { kind: "done"; hint: PlayHint; why?: string }
  | { kind: "empty"; reason: string };

/**
 * The advice for the decision ON the table — shown while it is the learner's
 * turn and BEFORE their card is played. Loads itself through the prefetch
 * cache; keyed by the host on the decision epoch.
 */
export function WhatShouldIPlay({
  auth,
  sessionId,
  epoch = "now",
}: {
  auth: CoachAuth;
  sessionId: string;
  epoch?: string;
}) {
  const [play, setPlay] = useState<PlayAnswer>({ kind: "loading" });
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const advice = await fetchPlayAdvice(auth, sessionId, epoch);
        if (!alive) return;
        setPlay(
          advice.hint
            ? { kind: "done", hint: advice.hint, ...(advice.why ? { why: advice.why } : {}) }
            : { kind: "empty", reason: advice.reason ?? "no answer" },
        );
      } catch {
        if (alive) setPlay({ kind: "empty", reason: "unreachable" });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.programId, sessionId, epoch]);

  return (
    <View style={{ gap: 6 }}>
      {play.kind === "loading" && <Text style={styles.thinking}>Working it out — a few seconds…</Text>}
      {play.kind === "empty" && (
        <Text style={styles.thinking}>
          {play.reason === "not your turn" ? "Not your turn." : "No suggestion for this position."}
        </Text>
      )}
      {play.kind === "done" && (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: MUTED }}>
              {SOURCE_INFO[play.hint.source].title}
            </Text>
            <Pressable
              accessibilityLabel="Where this answer comes from"
              onPress={() => setInfoOpen(true)}
              style={{
                width: 17,
                height: 17,
                borderRadius: 9,
                borderWidth: 1,
                borderColor: FELT_LINE,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: FELT_DEEP, fontSize: 10.5, fontWeight: "700", fontStyle: "italic", fontFamily: SERIF }}>
                i
              </Text>
            </Pressable>
            {(play.hint.prefer ? [play.hint.prefer] : play.hint.best).map((card) => {
              const label = cardText(card);
              return (
                <View key={card} style={styles.cardChip}>
                  <Text
                    style={{
                      fontSize: 14.5,
                      fontWeight: "700",
                      lineHeight: 17,
                      color: /[♥♦]/.test(label) ? "#c00" : "#000",
                    }}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
          {(play.why ?? play.hint.because) && (
            <Text style={{ fontFamily: SERIF, fontSize: 13, lineHeight: 19.5, color: play.why ? INK : MUTED }}>
              <RedSuits>{play.why ?? play.hint.because ?? ""}</RedSuits>
            </Text>
          )}
          {play.hint.source === "solution" && (
            <Text style={{ fontSize: 11.5, color: TEAL }}>Worked out from the full deal.</Text>
          )}
        </View>
      )}

      {/* ── the ⓘ popup: where the answer comes from ── */}
      <Modal visible={infoOpen && play.kind === "done"} transparent animationType="fade" onRequestClose={() => setInfoOpen(false)}>
        <Pressable style={styles.infoScrim} onPress={() => setInfoOpen(false)}>
          <Pressable style={styles.infoCard} onPress={() => {}}>
            <ScrollView style={{ flexGrow: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <Text style={styles.infoLabel}>
                  {play.kind === "done" ? SOURCE_INFO[play.hint.source].title : ""}
                </Text>
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => setInfoOpen(false)} accessibilityLabel="Close" style={styles.infoClose}>
                  <Text style={{ color: MUTED, fontSize: 13, lineHeight: 15 }}>×</Text>
                </Pressable>
              </View>
              <Text style={{ fontFamily: SERIF, fontSize: 13.5, lineHeight: 20, color: INK, marginBottom: 9 }}>
                {play.kind === "done" ? SOURCE_INFO[play.hint.source].from : ""}
              </Text>
              <Text style={[styles.infoLabel, { color: FAINT, marginBottom: 5 }]}>
                WHY IT DIFFERS FROM YOUR CHOICES
              </Text>
              <Text style={{ fontFamily: SERIF, fontSize: 13.5, lineHeight: 20, color: MUTED }}>
                {WHY_DIFFERENT}
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  thinking: { fontSize: 12.5, color: MUTED, fontStyle: "italic" },
  q: { marginBottom: 3, fontSize: 11.5, fontWeight: "700", color: FAINT },
  a: {
    fontFamily: SERIF,
    fontSize: 13.5,
    lineHeight: 20,
    color: MUTED,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: FELT_LINE,
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
  infoScrim: {
    flex: 1,
    backgroundColor: "rgba(42,5,6,.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  infoCard: {
    maxWidth: 340,
    maxHeight: "80%",
    backgroundColor: PAPER,
    borderRadius: 12,
    paddingTop: 13,
    paddingHorizontal: 15,
    paddingBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 26,
    elevation: 10,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: FELT_DEEP,
  },
  infoClose: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#f3ead4",
    alignItems: "center",
    justifyContent: "center",
  },
});
