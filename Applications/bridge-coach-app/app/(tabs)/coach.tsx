// Coach — the relationship tab, role-aware like Home. A learner sees who
// coaches them and the state of their feedback; a coach sees who needs them.
// Both are launchers into the platform surfaces that already exist.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CONTENT_TOP_GAP } from "../../components/brand-chrome";
import { OptionCard, Screen } from "../../components/ui";
import { Brand, Colors, Fonts, Spacing, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { getBridgeContextCached, isCoach, peekRoleContext } from "../../lib/bridge-role";
import { peekBridgeOrigin } from "../../lib/launch-cache";
import { type BridgeSummary, type SummaryCoach } from "../../lib/nexus";
import { prewarmBridgePages } from "../../lib/prewarm";
import { peekSummary, refreshSummary } from "../../lib/summary-cache";
import { useSelectedClubId } from "../../lib/club-context";

export default function CoachScreen() {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  // Both caches are primed at sign-in — seed from them so the first focus
  // shows the real view (and the coach's name below) with no fetch in front.
  const [coach, setCoach] = useState(() => isCoach(token ? peekRoleContext(token, clubId ?? undefined) : null));
  // Last known summary renders immediately; the focus effect refreshes it.
  const [summary, setSummary] = useState<BridgeSummary | null>(() =>
    token ? peekSummary(token, clubId ?? undefined) : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    getBridgeContextCached(token, clubId ?? undefined).then((ctx) => {
      if (!cancelled) setCoach(isCoach(ctx));
    });
    return () => {
      cancelled = true;
    };
  }, [token, clubId]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      // Warm the screens this tab's cards open (role decides which are shown,
      // but warming both costs one idempotent GET each).
      prewarmBridgePages(
        // /m/assignments is on this screen's own cards (both roles) and was the
        // one card that always opened a cold function.
        ["/m/reviews", "/m/plays", "/m/library/new", "/m/assignments"],
        peekBridgeOrigin(token),
      );
      let cancelled = false;
      refreshSummary(token, clubId ?? undefined)
        .then((s) => !cancelled && setSummary(s))
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [token, clubId]),
  );

  const s = summary;

  // A null summary is UNKNOWN, not "no coach": the first resolve may still be
  // on the wire (sign-in primes it, but a fast tap can beat the round-trip).
  // Asserting "No coach yet" during that window shows a wrong fact that then
  // corrects itself in front of the learner — say nothing until we know.
  //
  // `coaches` ABSENT (rather than empty) means an older API or a summary cached
  // before multi-coach shipped — fall back to the legacy single coach so one
  // true card paints instead of an empty screen.
  const coachList: SummaryCoach[] = s ? (s.coaches ?? (s.coach ? [s.coach] : [])) : [];

  // The learner's whole stack, as data: coaches, then hiring, then the two
  // shared destinations. Built as an array so the suit alternation is simply
  // the array position — no hand-counted offsets to drift out of step.
  const learnerCards: CardSpec[] = [
    ...coachList.map((co) => ({
      key: co.coach_id,
      // The name VERBATIM. Never a first name, never initials: coaches called
      // "Coach One" and "Coach Anna" both reduce to "Coach", which is exactly
      // the bug this screen used to show.
      title: co.name?.trim() || "Your coach",
      subtitle: coachStatus(co),
      // The cream circle's designed job: how many things wait behind the card.
      // Only when there IS something — OptionCard renders the badge whenever it
      // is defined, so a 0 would paint an empty disc.
      ...((count(co.pending) ?? 0) > 0 ? { badge: count(co.pending)! } : {}),
      onPress: () => router.push({ pathname: "/plays", params: { coach: co.coach_id } }),
    })),
    // Withheld while the summary is unknown: we cannot yet tell "a coach" from
    // "another coach", and guessing is the class of bug being fixed here.
    ...(s
      ? [
          {
            key: "hire",
            title: coachList.length > 0 ? "+ Hire another coach" : "+ Hire a coach",
            subtitle:
              coachList.length > 0
                ? "Browse coaches, or part ways with one"
                : "Browse the program's coaches",
            onPress: () => router.push("/coaches"),
          },
        ]
      : []),
    {
      key: "feedback",
      title: "Feedback",
      subtitle:
        s === null
          ? "…"
          : s.plays_reviewed > 0
            ? `${s.plays_reviewed} game${s.plays_reviewed === 1 ? "" : "s"} reviewed`
            : "Reviewed games appear here",
      onPress: () => router.push("/plays"),
    },
    {
      key: "assignments",
      title: "Assignments",
      subtitle:
        s === null
          ? "…"
          : s.assignments_open > 0
            ? `${s.assignments_open} waiting for you`
            : "Boards your coach sent you",
      onPress: () => router.push("/assigned"),
    },
  ];

  return (
    <Screen style={styles.screen}>
      {coach ? (
        <View style={styles.headerBlock}>
          <Text style={styles.eyebrow}>Coaching</Text>
          <Text style={styles.title}>
            {s === null
              ? "…"
              : `${s.roster_count} learner${s.roster_count === 1 ? "" : "s"}`}
          </Text>
          <Text style={styles.subtitle}>
            {s === null
              ? "Loading…"
              : "Review their plays, delegate boards, and follow each learner."}
          </Text>
          {/* Coach-only quick action, riding the header's top-right corner —
              the full flow (deal a board → pick learners) lives one tap in.
              LAST child + zIndex ON PURPOSE: the header texts are full-width
              boxes that overlap this corner, and whichever sibling stacks
              higher wins the click — as an earlier sibling this button was
              losing presses to invisible text (reported 2026-08-07 as "have to
              click different places before it works"). */}
          <Pressable
            onPress={() => router.push("/create-assignment")}
            accessibilityRole="button"
            accessibilityLabel="Create assignment"
            // The pill is visually small; the finger's target is not — the
            // press area extends well past the paint on every side.
            hitSlop={14}
            style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed]}
          >
            <Text style={styles.createBtnText}>+ Create Assignment</Text>
          </Pressable>
        </View>
      ) : (
        // The tab's own name, like every sibling tab — so the H1 never states
        // a fact (a count, a name) that has to correct itself a moment later.
        // Who the coaches are, and what each is holding, is the card stack's
        // job below.
        <View style={styles.headerBlockLearner}>
          <Text style={styles.titleLearner}>Coach</Text>
          {/* Two lines reserved: the copy below is 1–2 lines depending on the
              answer, and without a floor the whole stack jogs when it lands. */}
          <Text style={styles.subtitleLearner} numberOfLines={2}>
            {s === null
              ? "Loading…"
              : coachList.length > 1
                ? "Tap a coach to see their feedback. You pick who reviews each game."
                : coachList.length === 1
                  ? "Tap your coach to see their feedback on your games."
                  : "Hire a coach and they'll review the boards you play."}
          </Text>
        </View>
      )}

      <View style={styles.options}>
        {coach ? (
          <>
            <OptionCard
              title="Reviews"
              subtitle={
                s === null
                  ? "…"
                  : s.reviews_pending > 0
                    ? `${s.reviews_pending} play${s.reviews_pending === 1 ? "" : "s"} awaiting review`
                    : "No plays waiting"
              }
              onPress={() => router.push("/reviews")}
            />
            <OptionCard
              title="My Learners"
              subtitle="Open a learner's history and feedback"
              onPress={() => router.push("/learners")}
            />
            <OptionCard
              title="Assignments"
              subtitle="Boards you've delegated, and ones you help review"
              onPress={() => router.push("/assignments")}
            />
          </>
        ) : (
          // The index IS the array position: OptionCard deals the suits from it
          // (maroon, green, maroon…), so the rhythm can never fall out of step
          // with the list. Never pass a colour from here.
          learnerCards.map(({ key, ...card }, i) => (
            // Keyed by coach id, not position: hiring reorders the (name-sorted)
            // list, and a positional key would recycle the wrong card's state.
            <OptionCard key={key} index={i} {...card} />
          ))
        )}
      </View>
    </Screen>
  );
}

/** One card in the learner's stack. */
type CardSpec = {
  key: string;
  title: string;
  subtitle: string;
  badge?: number;
  onPress: () => void;
};

/** A tally that is really there, else null for UNKNOWN. Cannot be a truthiness
 *  test: zero is a real, sayable answer. */
function count(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null;
}

/** What one coach's card says under their name. "Game" not "play" — the noun
 *  the learner's own surfaces use ("My games"); "plays" is the library shelf. */
function coachStatus(co: SummaryCoach): string {
  const pending = count(co.pending);
  const reviewed = count(co.reviewed);
  // An older backend sends no tallies. Say what we know — that they coach you —
  // rather than inventing a zero.
  if (pending === null && reviewed === null) return "Your coach";
  const p = pending ?? 0;
  const r = reviewed ?? 0;
  if (p > 0 && r > 0) return `${p} awaiting review · ${r} reviewed`;
  if (p > 0) return `${p} game${p === 1 ? "" : "s"} awaiting review`;
  if (r > 0) return `${r} game${r === 1 ? "" : "s"} reviewed`;
  return "No games sent yet";
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: Spacing.screen },
  headerBlock: { paddingTop: 32, gap: 4 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.textMuted,
    fontFamily: Fonts.heading,
  },
  title: { fontSize: 26, color: Colors.text, fontFamily: Fonts.display, },
  // The learner header wears the same measurements as Play, Learn and Club:
  // BrandChrome's own top gap, and the shared screen-title size — so the four
  // tabs' first lines land on one baseline. (This block stays separate from the
  // coach one above so the Create Assignment pill's stacking context, and the
  // 2026-08-07 fix for it losing presses, is untouched.)
  headerBlockLearner: { paddingTop: CONTENT_TOP_GAP, gap: 4 },
  titleLearner: {
    fontFamily: Fonts.display,
    fontSize: Type.screenTitle,
    color: Brand.ink,
  },
  subtitleLearner: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
    fontFamily: Fonts.body,
    minHeight: 40,
  },
  createBtn: {
    position: "absolute",
    right: 0,
    top: 30,
    zIndex: 10,
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  createBtnPressed: { opacity: 0.75 },
  createBtnText: { fontSize: 13, color: Brand.cream, fontFamily: Fonts.heading },
  subtitle: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, fontFamily: Fonts.body, },
  options: { flex: 1, paddingTop: 24, gap: 12, paddingBottom: TAB_BAR_CLEARANCE },
});
