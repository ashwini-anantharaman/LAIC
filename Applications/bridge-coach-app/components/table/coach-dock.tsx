// The coach dock (Part II Phase D) — his three prompts under the native felt:
//
//   · "What am I looking at?"  — the facts layer, no authority in them
//   · "Help me think"          — the deterministic scaffold
//   · "What should I play?"    — his advice, fetched when asked
//
// The two deterministic layers arrive PRE-RENDERED from the coach route (the
// web dock's own lines); the hint is on demand. The expand icon opens the
// history sheet — the whole board so far with each call's replayed meaning —
// and a composer for a question about the position (event-qa).
//
// Refreshes follow the board, debounced: the caller bumps `refreshKey` per
// event batch, and the dock waits for a quiet beat before re-asking — the
// payload compiles the KB server-side and must not ride every robot card.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Brand, Fonts, Radius } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { useSelectedClubId } from "../../lib/club-context";
import { PROGRAM_ID } from "../../lib/config";
import {
  askAboutBoard,
  fetchCoach,
  fetchHint,
  hintLines,
  type CoachLine,
  type CoachPayload,
} from "../../lib/table/coach";

type Layer = "looking" | "think" | "advice";

const REFRESH_DEBOUNCE_MS = 900;

export function CoachDock({
  sessionId,
  refreshKey,
}: {
  sessionId: string;
  /** Bump per event batch — the dock re-asks after a quiet beat. */
  refreshKey: number;
}) {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;

  const [coach, setCoach] = useState<CoachPayload | null>(null);
  const [layer, setLayer] = useState<Layer>("looking");
  const [advice, setAdvice] = useState<CoachLine[] | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      fetchCoach(token, programId, sessionId)
        .then((p) => {
          if (!live.current) return;
          setCoach(p);
          // A new position invalidates the old advice, never silently: the
          // layer falls back to the facts.
          setAdvice(null);
          setLayer((l) => (l === "advice" ? "looking" : l));
        })
        .catch(() => {});
    }, REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [token, programId, sessionId, refreshKey]);

  const tell = useCallback(async () => {
    if (!token || adviceLoading) return;
    setLayer("advice");
    if (coach?.phase === "auction") {
      setAdvice([
        { text: "Bidding advice isn't wired yet.", color: "#28312c" },
        {
          text: "It will name the call your system makes here and say what it shows — the same authorities as the card advice.",
          color: "#57573f",
        },
      ]);
      return;
    }
    setAdviceLoading(true);
    setAdvice(null);
    try {
      const res = await fetchHint(token, programId, sessionId);
      if (live.current) setAdvice(hintLines(res));
    } catch {
      if (live.current) setAdvice([{ text: "The coach is unreachable — try again.", color: "#57573f" }]);
    } finally {
      if (live.current) setAdviceLoading(false);
    }
  }, [token, programId, sessionId, coach?.phase, adviceLoading]);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!token || !q || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const res = await askAboutBoard(token, programId, sessionId, q);
      if (live.current) setAnswer(res.answer ?? "No answer for that here.");
    } catch {
      if (live.current) setAnswer("The coach is unreachable — try again.");
    } finally {
      if (live.current) setAsking(false);
    }
  }, [token, programId, sessionId, question, asking]);

  if (!coach) return null;

  const lines: CoachLine[] =
    layer === "advice"
      ? (advice ?? [])
      : layer === "think"
        ? coach.lines.think
        : coach.lines.looking;
  const status =
    layer === "advice" ? (coach.active ? "Hint" : "Hint · waiting") : coach.status[layer];

  return (
    <View style={styles.dock}>
      <View style={styles.dockHeader}>
        <Text style={styles.dockTitle}>COACH</Text>
        <Text style={styles.dockStatus}>{status.toUpperCase()}</Text>
        <Pressable onPress={() => setExpanded(true)} hitSlop={8}>
          <Text style={styles.expand}>⤢</Text>
        </Pressable>
      </View>

      {coach.watcher ? (
        <Text style={styles.placeholder}>{coach.placeholder}</Text>
      ) : (
        <>
          {adviceLoading && layer === "advice" ? (
            <View style={styles.adviceLoading}>
              <ActivityIndicator size="small" color="#28312c" />
              <Text style={styles.lineMuted}>Working it out — a few seconds…</Text>
            </View>
          ) : lines.length === 0 ? (
            <Text style={styles.placeholder}>{coach.placeholder}</Text>
          ) : (
            lines.map((l, i) => (
              <Text key={i} style={[styles.line, { color: l.color }]}>
                {l.text}
              </Text>
            ))
          )}

          <View style={styles.actions}>
            <DockButton label="What am I looking at?" on={layer === "looking"} onPress={() => setLayer("looking")} />
            <DockButton label="Help me think" on={layer === "think"} onPress={() => setLayer("think")} />
            <DockButton label={coach.tellLabel} on={layer === "advice"} onPress={() => void tell()} />
          </View>
        </>
      )}

      {/* ── The expanded sheet: the whole board so far, and a question box. ── */}
      <Modal visible={expanded} transparent animationType="slide" onRequestClose={() => setExpanded(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Coach</Text>
              <Pressable onPress={() => setExpanded(false)} hitSlop={10}>
                <Text style={styles.sheetClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {coach.eventGroups.map((g) => (
                <View key={g.id} style={styles.group}>
                  <Text style={styles.groupTitle}>
                    {g.title.toUpperCase()}
                    {g.note ? `  ·  ${g.note}` : ""}
                  </Text>
                  {g.events.map((e) => (
                    <View key={e.id} style={styles.eventRow}>
                      <Text style={styles.eventLabel}>{e.label}</Text>
                      {e.detail ? <Text style={styles.eventDetail}>{e.detail}</Text> : null}
                    </View>
                  ))}
                </View>
              ))}
              {coach.eventGroups.length === 0 && (
                <Text style={styles.placeholder}>Nothing has happened yet.</Text>
              )}
            </ScrollView>

            <View style={styles.askRow}>
              <TextInput
                style={styles.askInput}
                value={question}
                onChangeText={setQuestion}
                placeholder="Ask about this board…"
                placeholderTextColor="rgba(31,31,31,0.4)"
              />
              <Pressable
                onPress={() => void ask()}
                disabled={asking || !question.trim()}
                style={({ pressed }) => [
                  styles.askButton,
                  (asking || !question.trim()) && { opacity: 0.4 },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text style={styles.askButtonText}>{asking ? "…" : "Ask"}</Text>
              </Pressable>
            </View>
            {answer ? <Text style={styles.answer}>{answer}</Text> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DockButton({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.dockButton, on && styles.dockButtonOn, pressed && { opacity: 0.75 }]}
    >
      <Text style={[styles.dockButtonText, on && styles.dockButtonTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dock: {
    backgroundColor: "#f4f1e6",
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  dockHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  dockTitle: { fontFamily: Fonts.bodySemibold, fontSize: 10.5, letterSpacing: 1.8, color: "#28312c" },
  dockStatus: { flex: 1, fontFamily: Fonts.body, fontSize: 10, letterSpacing: 1.2, color: "#7d7d66" },
  expand: { fontSize: 16, color: "#28312c" },

  placeholder: { fontFamily: Fonts.body, fontSize: 12.5, lineHeight: 18, color: "#7d7d66" },
  line: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 19 },
  lineMuted: { fontFamily: Fonts.body, fontSize: 12.5, color: "#57573f" },
  adviceLoading: { flexDirection: "row", alignItems: "center", gap: 8 },

  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  dockButton: {
    borderWidth: 1,
    borderColor: "#c9c3ae",
    backgroundColor: "#fffefa",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  dockButtonOn: { backgroundColor: "#28312c", borderColor: "#28312c" },
  dockButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 11.5, color: "#28312c" },
  dockButtonTextOn: { color: "#fffefa" },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(42,5,6,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Brand.cream,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    padding: 20,
    maxHeight: "80%",
    gap: 8,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center" },
  sheetTitle: { flex: 1, fontFamily: Fonts.display, fontSize: 20, color: Brand.ink },
  sheetClose: { fontSize: 18, color: Brand.ink, padding: 4 },

  group: { marginTop: 10 },
  groupTitle: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: "#a49d8e",
    marginBottom: 4,
  },
  eventRow: { marginTop: 4 },
  eventLabel: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 19, color: Brand.ink },
  eventDetail: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 17, color: "#7b7466", marginLeft: 12 },

  askRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 },
  askInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13.5,
    color: Brand.ink,
    backgroundColor: "#fffefa",
    borderWidth: 1,
    borderColor: "#d3ccbb",
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  askButton: {
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  askButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.white },
  answer: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: Brand.ink,
    backgroundColor: "#f1ede3",
    borderRadius: 10,
    padding: 10,
  },
});
