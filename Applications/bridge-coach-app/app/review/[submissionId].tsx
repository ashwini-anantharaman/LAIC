// One play review — NATIVE (M3a; this thread lived inside the /m/review
// WebView). The frozen board snapshot (hands, auction, tricks), the learner's
// note, and the comment thread between learner and coach. The submission
// carries its OWN board copy, so this renders even after the session was
// removed or forked — reviews never drift.
//
// The thread uses the deal-chat bubble idiom: green from the other side with
// a name label, maroon from you on the right.

import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Screen, ScreenHeader } from "../../components/ui";
import { Brand, Fonts, Spacing } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { BridgeApiError } from "../../lib/bridge-api";
import { useSelectedClubId } from "../../lib/club-context";
import { PROGRAM_ID } from "../../lib/config";
import {
  addReviewComment,
  fetchReview,
  refreshMyGames,
  type CardRef,
  type ReviewComment,
  type ReviewThread,
  type Seat,
} from "../../lib/plays";

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_ORDER = ["S", "H", "D", "C"] as const;
const RANK_LABEL: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" };

function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

function cardLabel(card: CardRef): string {
  return `${SUIT_GLYPH[card.suit] ?? card.suit}${rankLabel(card.rank)}`;
}

/** "1S" → "1♠", "3NT" stays, "P"/"X"/"XX" stay. */
function callLabel(call: string): string {
  const m = /^([1-7])([SHDC])$/.exec(call);
  return m ? `${m[1]}${SUIT_GLYPH[m[2]!]}` : call;
}

export default function ReviewThreadScreen() {
  const { submissionId } = useLocalSearchParams<{ submissionId: string }>();
  const { token, user } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;

  const [thread, setThread] = useState<ReviewThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    if (!token || !submissionId) return;
    let cancelled = false;
    fetchReview(token, programId, submissionId)
      .then((t) => !cancelled && setThread(t))
      .catch((e) =>
        !cancelled &&
        setError(e instanceof BridgeApiError ? e.message : "Couldn't open this review."),
      );
    return () => {
      cancelled = true;
    };
  }, [token, programId, submissionId]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !token || !thread || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await addReviewComment(token, programId, thread.submission.submissionId, body);
      const mine: ReviewComment = {
        commentId: res.commentId,
        submissionId: thread.submission.submissionId,
        authorId: "me",
        authorName: user?.display_name ?? undefined,
        body,
        createdAt: new Date().toISOString(),
      };
      setThread({
        ...thread,
        comments: [...thread.comments, mine],
        // The first coach comment flips the loop closed — the route says so.
        submission: { ...thread.submission, status: res.status },
      });
      // My Games shows per-thread status chips — keep them honest.
      void refreshMyGames(token, programId).catch(() => {});
    } catch (e) {
      setDraft(body); // give the words back — nothing was posted
      setError(e instanceof BridgeApiError ? e.message : "Couldn't post that — try again.");
    } finally {
      setSending(false);
    }
  }, [draft, token, programId, thread, sending, user]);

  const sub = thread?.submission;
  const meId = thread
    ? thread.viewer.isCoach
      ? sub!.coachId
      : sub!.learnerId
    : null;

  // Group the frozen play back into tricks of four for display.
  const tricks: { seat: Seat; card: CardRef }[][] = [];
  if (sub) {
    for (let i = 0; i < sub.board.play.length; i += 4) {
      tricks.push(sub.board.play.slice(i, i + 4));
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Play review" backTo="/plays" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <ScrollView
          ref={scroller}
          contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: 16 }}
        >
          {!sub ? (
            <Text style={styles.empty}>{error ?? "Loading…"}</Text>
          ) : (
            <>
              <Text style={styles.eyebrow}>
                {sub.status === "reviewed" ? "REVIEWED" : "WAITING FOR COACH"}
              </Text>
              <Text style={styles.title}>{sub.board.name}</Text>
              <Text style={styles.subtitle}>
                {sub.learnerName ?? "Learner"} → {sub.coachName ?? "Coach"}
                {sub.board.contractLabel ? ` · ${callLabel(sub.board.contractLabel)}` : ""}
                {sub.board.resultLabel ? ` · ${sub.board.resultLabel}` : ""}
              </Text>
              {sub.note ? <Text style={styles.note}>“{sub.note}”</Text> : null}

              {/* The deal — all four hands, N/W–E/S compass layout. */}
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>THE DEAL</Text>
                <View style={{ alignItems: "center" }}>
                  <HandBlock seat="N" cards={sub.board.hands.N} />
                </View>
                <View style={styles.compassRow}>
                  <HandBlock seat="W" cards={sub.board.hands.W} />
                  <View style={styles.compassCentre}>
                    <Text style={styles.compassText}>dealer {sub.board.dealer}</Text>
                    <Text style={styles.compassText}>vul {sub.board.vul}</Text>
                  </View>
                  <HandBlock seat="E" cards={sub.board.hands.E} />
                </View>
                <View style={{ alignItems: "center" }}>
                  <HandBlock seat="S" cards={sub.board.hands.S} />
                </View>
              </View>

              {/* The auction, in order. */}
              {sub.board.auction.length > 0 && (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>THE AUCTION</Text>
                  <View style={styles.wrapRow}>
                    {sub.board.auction.map((a, i) => (
                      <Text key={i} style={styles.auctionChip}>
                        {a.seat} {callLabel(a.call)}
                      </Text>
                    ))}
                  </View>
                </View>
              )}

              {/* The play, trick by trick. */}
              {tricks.length > 0 && (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>THE PLAY</Text>
                  {tricks.map((t, i) => (
                    <View key={i} style={styles.trickRow}>
                      <Text style={styles.trickNo}>{i + 1}</Text>
                      <Text style={styles.trickCards}>
                        {t.map((p) => `${p.seat} ${cardLabel(p.card)}`).join("   ")}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* The conversation. */}
              <Text style={styles.panelTitle}>FEEDBACK</Text>
              {thread!.comments.length === 0 && (
                <Text style={styles.empty}>
                  {thread!.viewer.isCoach
                    ? "No feedback yet — your first comment marks this reviewed."
                    : "No feedback yet."}
                </Text>
              )}
              {thread!.comments.map((c) => {
                const mine = c.authorId === meId || c.authorId === "me";
                return (
                  <View
                    key={c.commentId}
                    style={{ marginTop: 12, alignItems: mine ? "flex-end" : "flex-start" }}
                  >
                    {!mine && (
                      <Text style={styles.bubbleLabel}>{c.authorName ?? "Them"}</Text>
                    )}
                    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      <Text style={styles.bubbleText}>{c.body}</Text>
                    </View>
                  </View>
                );
              })}
              {error && thread ? <Text style={styles.errorLine}>{error}</Text> : null}
            </>
          )}
        </ScrollView>

        {sub && (
          <View style={styles.composerRow}>
            <TextInput
              style={styles.composer}
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a comment…"
              placeholderTextColor="rgba(31,31,31,0.4)"
              multiline
            />
            <Pressable
              onPress={send}
              disabled={sending || !draft.trim()}
              style={({ pressed }) => [
                styles.sendButton,
                (sending || !draft.trim()) && { opacity: 0.4 },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** One hand: seat letter above its four suit lines, highest card first. */
function HandBlock({ seat, cards }: { seat: Seat; cards: CardRef[] }) {
  return (
    <View style={styles.hand}>
      <Text style={styles.handSeat}>{seat}</Text>
      {SUIT_ORDER.map((suit) => {
        const ranks = cards
          .filter((c) => c.suit === suit)
          .sort((a, b) => b.rank - a.rank)
          .map((c) => rankLabel(c.rank))
          .join("");
        const red = suit === "H" || suit === "D";
        return (
          <Text key={suit} style={styles.handLine} numberOfLines={1}>
            <Text style={{ color: red ? "#b91c1c" : Brand.ink }}>{SUIT_GLYPH[suit]}</Text>
            {` ${ranks || "—"}`}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 2.6,
    color: "#a49d8e",
    marginTop: 4,
  },
  title: { fontFamily: Fonts.display, fontSize: 24, color: Brand.ink, marginTop: 6 },
  subtitle: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 19, color: "#5e5749", marginTop: 6 },
  note: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: Brand.ink,
    backgroundColor: "#f1ede3",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    overflow: "hidden",
  },

  panel: {
    backgroundColor: "#fffefa",
    borderWidth: 1,
    borderColor: "#e7e1d3",
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  panelTitle: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 2,
    color: "#a49d8e",
    marginTop: 4,
    marginBottom: 8,
  },

  compassRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 6,
  },
  compassCentre: { alignItems: "center", flex: 1 },
  compassText: { fontFamily: Fonts.body, fontSize: 11.5, color: "#a49d8e" },

  hand: { minWidth: 96 },
  handSeat: { fontFamily: Fonts.bodySemibold, fontSize: 11, color: "#a49d8e", marginBottom: 2 },
  handLine: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 19, color: Brand.ink },

  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  auctionChip: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 12.5,
    color: Brand.ink,
    backgroundColor: "#f1ede3",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: "hidden",
  },

  trickRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  trickNo: { width: 22, fontFamily: Fonts.bodySemibold, fontSize: 12, color: "#a49d8e" },
  trickCards: { flex: 1, fontFamily: Fonts.body, fontSize: 13, color: Brand.ink },

  bubbleLabel: { fontFamily: Fonts.body, fontSize: 11.5, color: "#7b7466", marginBottom: 3 },
  bubble: { maxWidth: 280, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleMine: { backgroundColor: Brand.maroon },
  bubbleTheirs: { backgroundColor: Brand.green },
  bubbleText: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 19, color: Brand.white },

  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: Spacing.screen,
    paddingVertical: 10,
    backgroundColor: Brand.cream,
  },
  composer: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Brand.ink,
    backgroundColor: "#fffefa",
    borderWidth: 1,
    borderColor: "#d3ccbb",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxHeight: 110,
  },
  sendButton: {
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  sendButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.white },

  empty: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    color: "#a49d8e",
    textAlign: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d3ccbb",
    borderRadius: 12,
    padding: 16,
    marginTop: 14,
  },
  errorLine: { fontFamily: Fonts.body, fontSize: 12.5, color: "#b91c1c", marginTop: 10 },
});
