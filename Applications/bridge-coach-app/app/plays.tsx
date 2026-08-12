// My Games — NATIVE (M3a of the webview→native migration; this screen was a
// BridgeEmbed of /m/plays). The learner's finished boards: view the record,
// replay a fork, send to a coach for feedback, read the feedback threads,
// or remove a game. With ?coach=<id> the same surface narrows to ONE COACH'S
// FEEDBACK — the games that coach holds, plus what's left to send them —
// which is where a coach card on the Coach tab lands.
//
// Data is the /api/bridge/plays read model, painted stale-while-revalidate:
// the last answer renders immediately, a refresh rides behind every focus.

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen, ScreenHeader } from "../components/ui";
import { Brand, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { BridgeApiError } from "../lib/bridge-api";
import { useSelectedClubId } from "../lib/club-context";
import { PROGRAM_ID } from "../lib/config";
import {
  peekMyGames,
  refreshMyGames,
  removeBoard,
  replayBoard,
  sendPlay,
  subscribeToMyGames,
  type CoachRef,
  type MyGames,
  type PlaySubmission,
} from "../lib/plays";

const EDGE = { maroon: Brand.cardShadow, green: Brand.rowShadow } as const;

export default function MyPlaysScreen() {
  const { coach } = useLocalSearchParams<{ coach?: string }>();
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;

  const [games, setGames] = useState<MyGames | null>(() =>
    token ? peekMyGames(token, programId) : null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  /** Which board's destructive confirm is open — one at a time, like the page. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** Which board's coach picker is unfolded. */
  const [picking, setPicking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    if (!token) return;
    setGames(peekMyGames(token, programId));
    refreshMyGames(token, programId)
      .then(() => setLoadError(null))
      .catch((e) => {
        // A stale screen beats an empty one — only report when we have nothing.
        if (!peekMyGames(token, programId)) {
          setLoadError(e instanceof BridgeApiError ? e.message : "Couldn't load your games.");
        }
      });
  }, [token, programId]);

  // Refresh on every focus (coming back from a table is exactly when the list
  // changed) and repaint whenever any refresh lands.
  useFocusEffect(
    useCallback(() => {
      reload();
      return subscribeToMyGames(setGames);
    }, [reload]),
  );

  const bySession = useMemo(() => {
    const map = new Map<string, PlaySubmission[]>();
    for (const sub of games?.submissions ?? []) {
      const list = map.get(sub.sessionId) ?? [];
      list.push(sub);
      map.set(sub.sessionId, list);
    }
    return map;
  }, [games]);

  const wanted = typeof coach === "string" && coach ? coach : null;
  const focus = wanted
    ? ((games?.coaches ?? []).find((co) => co.coach_id === wanted) ?? null)
    : null;
  const staleCoach = games !== null && wanted !== null && focus === null;

  const run = useCallback(
    async (work: () => Promise<void>) => {
      if (!token || busy) return;
      setBusy(true);
      try {
        await work();
      } catch (e) {
        setBanner({
          kind: "error",
          text: e instanceof BridgeApiError ? e.message : "That didn't work — try again.",
        });
      } finally {
        setBusy(false);
      }
    },
    [token, busy],
  );

  const doSend = (sessionId: string, co: CoachRef) =>
    run(async () => {
      await sendPlay(token!, programId, sessionId, co.coach_id);
      setPicking(null);
      setBanner({ kind: "ok", text: `Sent — ${co.name ?? "your coach"} will take a look.` });
      await refreshMyGames(token!, programId);
    });

  const doRemove = (sessionId: string) =>
    run(async () => {
      await removeBoard(token!, programId, sessionId);
      setConfirming(null);
      setBanner({ kind: "ok", text: "Removed." });
      await refreshMyGames(token!, programId);
    });

  const doReplay = (sessionId: string) =>
    run(async () => {
      const next = await replayBoard(token!, programId, sessionId);
      router.push(`/table/${next.sessionId}?from=games`);
    });

  const viewBoard = (sessionId: string) =>
    router.push(`/table/${sessionId}?view=hands&from=games`);

  const openThread = (submissionId: string) => router.push(`/review/${submissionId}`);

  // ── one coach's view ───────────────────────────────────────────────────────
  const body = (() => {
    if (!games) {
      return (
        <Text style={styles.emptyBox}>{loadError ?? "Loading your games…"}</Text>
      );
    }

    if (focus) {
      const focusSubs = games.submissions.filter((x) => x.coachId === focus.coach_id);
      const live = new Set(games.completed.map((s) => s.sessionId));
      const sendable = games.completed.filter(
        (s) => !(bySession.get(s.sessionId) ?? []).some((x) => x.coachId === focus.coach_id),
      );
      const reviewed = focusSubs.filter((x) => x.status === "reviewed").length;
      const name = focus.name ?? focusSubs[0]?.coachName ?? "Your coach";

      return (
        <>
          {/* The coach's name VERBATIM — never split, never initialled. */}
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.lede}>
            {focusSubs.length === 0
              ? `You haven't sent ${name} a game yet.`
              : `${focusSubs.length} game${focusSubs.length === 1 ? "" : "s"} sent · ${reviewed} reviewed. Tap one to read the feedback.`}
          </Text>

          {focusSubs.length > 0 && <Text style={styles.sectionLabel}>WITH {name.toUpperCase()}</Text>}
          {focusSubs.map((sub, i) => (
            <SuitCard key={sub.submissionId} index={i}>
              <Text style={styles.cardTitle}>{sub.board.name}</Text>
              <Text style={styles.cardMeta}>sent {sub.createdAt.slice(0, 10)}</Text>
              <View style={styles.chipRow}>
                <Chip
                  label={sub.status === "reviewed" ? "Read feedback" : "Awaiting review"}
                  variant="filled"
                  onPress={() => openThread(sub.submissionId)}
                />
                {live.has(sub.sessionId) && (
                  <>
                    <Chip label="View board" onPress={() => viewBoard(sub.sessionId)} />
                    <Chip label="Replay" onPress={() => doReplay(sub.sessionId)} />
                  </>
                )}
              </View>
            </SuitCard>
          ))}

          <Text style={styles.sectionLabel}>SEND ANOTHER GAME</Text>
          {sendable.length === 0 ? (
            <Text style={styles.emptyBox}>
              {games.completed.length === 0
                ? "Nothing to send yet — finish a board at the table and it appears here."
                : `${name} already has every game you've finished.`}
            </Text>
          ) : (
            sendable.map((s) => (
              <Pressable
                key={s.sessionId}
                onPress={() => doSend(s.sessionId, focus)}
                disabled={busy}
                style={({ pressed }) => [styles.sendRow, pressed && styles.pressed]}
              >
                <Text style={styles.sendRowName} numberOfLines={1}>
                  {s.boardName}
                </Text>
                <Text style={styles.sendRowChip}>Send</Text>
              </Pressable>
            ))
          )}
        </>
      );
    }

    // ── every game, every coach ────────────────────────────────────────────
    const coaches = games.coaches;
    return (
      <>
        <Text style={styles.title}>My games</Text>
        <Text style={styles.lede}>
          Boards you&apos;ve finished.{" "}
          {coaches.length === 1
            ? `Send one to ${coaches[0]!.name ?? "your coach"} for feedback.`
            : coaches.length > 1
              ? "Send one to any of your coaches for feedback."
              : "Hire a coach in the app to send plays for feedback."}
        </Text>

        {staleCoach && (
          <Text style={[styles.banner, styles.bannerMaroon]}>
            That coach isn&apos;t on your list any more — here is everything instead.
          </Text>
        )}

        {games.completed.length === 0 && (
          <Text style={styles.emptyBox}>
            Nothing here yet — finish a board at the table and it appears here.
          </Text>
        )}
        {games.completed.map((s, i) => {
          const subs = bySession.get(s.sessionId) ?? [];
          // MULTI-COACH: each board can go to any hired coach it hasn't
          // visited yet — the learner PICKS the recipient.
          const sentTo = new Set(subs.map((x) => x.coachId));
          const sendable = coaches.filter((co) => !sentTo.has(co.coach_id));
          return (
            <SuitCard key={s.sessionId} index={i}>
              <Text style={styles.cardTitle}>{s.boardName}</Text>
              <Text style={styles.cardMeta}>completed {s.updatedAt.slice(0, 10)}</Text>
              <View style={styles.chipRow}>
                {/* The full record, not the live table: a finished board opens
                    on the hand-record view. */}
                <Chip label="View board" onPress={() => viewBoard(s.sessionId)} />
                {/* Same deal, fresh table — a fork; the record stays untouched. */}
                <Chip label="Replay" onPress={() => doReplay(s.sessionId)} />
                {confirming !== s.sessionId && (
                  <Chip label="Remove" variant="quiet" onPress={() => setConfirming(s.sessionId)} />
                )}
                {sendable.length === 1 && (
                  <Chip
                    label={`Send to ${sendable[0]!.name ?? "your coach"}`}
                    variant="cream"
                    onPress={() => doSend(s.sessionId, sendable[0]!)}
                  />
                )}
                {sendable.length > 1 && picking !== s.sessionId && (
                  <Chip label="Send to a coach ▾" variant="cream" onPress={() => setPicking(s.sessionId)} />
                )}
              </View>

              {picking === s.sessionId &&
                sendable.map((co) => (
                  <Pressable
                    key={co.coach_id}
                    onPress={() => doSend(s.sessionId, co)}
                    disabled={busy}
                    style={({ pressed }) => [styles.sendRowInset, pressed && styles.pressed]}
                  >
                    <Text style={styles.sendRowName} numberOfLines={1}>
                      {co.name ?? "Coach"}
                    </Text>
                    <Text style={styles.sendRowChip}>Send</Text>
                  </Pressable>
                ))}

              {/* The confirm step: this deletes for BOTH sides and can't be
                  undone, so it's asked in place, on the card being removed,
                  and names what else goes with it. */}
              {confirming === s.sessionId && (
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmText}>
                    {subs.length === 0
                      ? "Remove this game? It won't be recoverable."
                      : subs.length === 1
                        ? `Remove this game? ${subs[0]!.coachName ?? "Your coach"}'s review and feedback on it are deleted too, for both of you. It won't be recoverable.`
                        : `Remove this game? All ${subs.length} coach reviews of it — and any feedback written on them — are deleted too, for both sides. It won't be recoverable.`}
                  </Text>
                  <View style={styles.chipRow}>
                    <Chip label="Yes, remove" variant="danger" onPress={() => doRemove(s.sessionId)} />
                    <Chip label="Keep it" onPress={() => setConfirming(null)} />
                  </View>
                </View>
              )}

              {/* One review thread per coach, each with its own path back. */}
              {subs.map((sub) => (
                <Pressable
                  key={sub.submissionId}
                  onPress={() => openThread(sub.submissionId)}
                  style={({ pressed }) => [styles.threadRow, pressed && styles.pressed]}
                >
                  <Text style={styles.threadName} numberOfLines={1}>
                    {sub.coachName ?? "Coach"}
                  </Text>
                  <Text style={styles.threadStatus}>
                    {sub.status === "reviewed" ? "Read feedback ›" : "Awaiting review ›"}
                  </Text>
                </Pressable>
              ))}
            </SuitCard>
          );
        })}
      </>
    );
  })();

  return (
    <Screen>
      <ScreenHeader
        // Not the coach's name: the header title is centred with no line
        // clamp; the page body carries their name as its own heading.
        title={focus ? "Feedback" : "My Games"}
        backTo={wanted ? "/coach" : "/home"}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
      >
        {banner && (
          <Pressable onPress={() => setBanner(null)}>
            <Text
              style={[
                styles.banner,
                banner.kind === "ok" ? styles.bannerGreen : styles.bannerError,
              ]}
            >
              {banner.text}
            </Text>
          </Pressable>
        )}
        {body}
      </ScrollView>
    </Screen>
  );
}

/** A suit card on its darker stacked edge — the app's dealt-row idiom. */
function SuitCard({ index, children }: { index: number; children: React.ReactNode }) {
  const suit = index % 2 === 0 ? Brand.maroon : Brand.green;
  const edge = index % 2 === 0 ? EDGE.maroon : EDGE.green;
  return (
    <View style={{ backgroundColor: edge, borderRadius: 14, paddingBottom: 3, marginTop: 13 }}>
      <View style={{ backgroundColor: suit, borderRadius: 14, padding: 16 }}>{children}</View>
    </View>
  );
}

function Chip({
  label,
  onPress,
  variant = "outline",
}: {
  label: string;
  onPress: () => void;
  variant?: "outline" | "filled" | "quiet" | "cream" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        variant === "outline" && styles.chipOutline,
        variant === "filled" && styles.chipFilled,
        variant === "quiet" && styles.chipQuiet,
        (variant === "cream" || variant === "danger") && styles.chipCream,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          variant === "filled" && { color: Brand.ink },
          variant === "cream" && { color: Brand.ink },
          variant === "danger" && { color: "#b91c1c" },
          variant === "quiet" && { color: "rgba(255,244,215,0.78)" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: Fonts.display, fontSize: 26, color: Brand.ink, marginTop: 6 },
  lede: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 20, color: "#5e5749", marginTop: 10 },
  sectionLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 2.4,
    color: "#a49d8e",
    marginTop: 22,
  },

  banner: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
    overflow: "hidden",
  },
  bannerGreen: { backgroundColor: Brand.green, color: Brand.cream },
  bannerMaroon: { backgroundColor: Brand.maroon, color: Brand.cream },
  bannerError: { backgroundColor: "#b91c1c", color: Brand.white },

  emptyBox: {
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

  cardTitle: { fontFamily: Fonts.displayMedium, fontSize: 17, color: Brand.white },
  cardMeta: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: "rgba(255,244,215,0.72)",
    marginTop: 3,
    marginBottom: 12,
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipOutline: { borderWidth: 2, borderColor: "rgba(255,244,215,0.8)" },
  chipFilled: { backgroundColor: Brand.cream },
  chipQuiet: { borderWidth: 1, borderColor: "rgba(255,244,215,0.34)" },
  chipCream: { backgroundColor: Brand.cream },
  chipText: { fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: Brand.cream },

  sendRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Brand.green,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  sendRowInset: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  sendRowName: { flex: 1, fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.white },
  sendRowChip: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 12,
    color: Brand.ink,
    backgroundColor: Brand.cream,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: "hidden",
  },

  confirmBox: {
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 10,
  },
  confirmText: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 19, color: Brand.white },

  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  threadName: { flex: 1, fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.white },
  threadStatus: { fontFamily: Fonts.body, fontSize: 12.5, color: Brand.cream },

  pressed: { opacity: 0.75 },
});
