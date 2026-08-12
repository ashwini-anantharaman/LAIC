// The landing screen a challenge tile opens — what this challenge IS, before
// any table appears.
//
// The web deliberately has no such page (tapping a challenge goes straight to
// play); in the app the tile leads HERE first: the name, the creator's
// description, boards/scoring/progress, and one button. Start hands over to
// the embed at /bridge/challenges/<id>/play — the platform still decides what
// opening means (resume an unfinished board, results once done), so this
// screen never contradicts it: the button reads Start, Continue or See
// results from the same summary record the carousel showed.
//
// Data arrives via the module cache the Challenges screen already filled; a
// cold open (reload straight onto this route) refetches the summary itself.

import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { BackChevron, BrandChrome } from "../components/brand-chrome";
import { leaveWithFade } from "../components/leave-veil";
import { TabLoading } from "../components/tab-loading";
import { ChallengeTile } from "../components/challenge-tile";
import { Brand, Fonts, TAB_BAR_CLEARANCE, Type } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import {
  fetchClubChallenges,
  getCachedChallenge,
  respondToChallengeInvite,
  setChallengeArchived,
  type ClubChallenge,
} from "../lib/challenges";
import { useSelectedClubId } from "../lib/club-context";
import { confirmDestructive, notify } from "../lib/dialogs";

const DESIGN_WIDTH = 390;
const TILE = 155.47; // the Club home's thumbnail size — a poster, not a carousel
const FACT_GAP = 6;

/** One "Boards    6" line. */
function FactRow({ label, value, scale: s }: { label: string; value: string; scale: number }) {
  return (
    <View style={[styles.factRow, { paddingVertical: FACT_GAP * s }]}>
      <Text style={[styles.factLabel, { fontSize: 14 * s }]}>{label}</Text>
      <Text style={[styles.factValue, { fontSize: 14 * s }]}>{value}</Text>
    </View>
  );
}

export default function ChallengeInfoScreen() {
  const { width } = useWindowDimensions();
  const s = width / DESIGN_WIDTH;
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [challenge, setChallenge] = useState<ClubChallenge | null>(() =>
    id ? getCachedChallenge(id) : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (challenge || !token || !id) return;
    let cancelled = false;
    fetchClubChallenges(token, clubId)
      .then((rows) => {
        if (cancelled) return;
        const found = rows.find((r) => r.id === id);
        if (found) setChallenge(found);
        else setError("This challenge is no longer available.");
      })
      .catch(() => !cancelled && setError("Couldn't load this challenge."));
    return () => {
      cancelled = true;
    };
  }, [challenge, token, clubId, id]);

  // The invite is answered HERE (owner direction 2026-08-11): this screen
  // wears the app's own face, and "Respond to invite" used to hand the reader
  // to the platform's list page for one tap — a different-looking product in
  // the middle of a themed flow. The platform's rule is unchanged (only a
  // pending invite transitions; POST /challenges/:id/invite), so a declined
  // invite reads as declined rather than offering a button that cannot act.
  const invitePending = challenge?.inviteStatus === "pending";
  const inviteDeclined = challenge?.inviteStatus === "declined";
  const [responding, setResponding] = useState<"accept" | "decline" | null>(null);
  const respond = async (action: "accept" | "decline") => {
    if (!token || !challenge || responding) return;
    setResponding(action);
    try {
      const status = await respondToChallengeInvite(token, clubId, challenge.id, action);
      setChallenge({ ...challenge, inviteStatus: status });
    } catch {
      notify("Couldn't send your response", "Please try again.");
    } finally {
      setResponding(null);
    }
  };

  /**
   * Retire this challenge, or bring it back — moderators only.
   *
   * Here rather than on the list, because this is the screen that already knows one
   * challenge and already answers invites for it. The platform's own list card can
   * do the same thing, but the app deliberately never shows that page.
   *
   * Confirms first: archiving changes what everyone invited sees, so it is not a
   * one-tap act. Reversible, and the button says which way it will go.
   */
  const [archiving, setArchiving] = useState(false);
  const toggleArchive = () => {
    if (!token || !challenge || archiving) return;
    const next = !challenge.archived;
    confirmDestructive(
      next ? "Archive this challenge?" : "Reopen this challenge?",
      next
        ? "It stops being playable for everyone invited. Results stay readable, and you can reopen it."
        : "It becomes playable again for everyone invited.",
      next ? "Archive" : "Reopen",
      () => {
        setArchiving(true);
        setChallengeArchived(token, clubId, challenge.id, next)
          .then((status) => setChallenge({ ...challenge, archived: status === "archived" }))
          .catch((e) =>
            notify(
              "Couldn't change that",
              e instanceof Error ? e.message : "Please try again.",
            ),
          )
          .finally(() => setArchiving(false));
      },
    );
  };

  const buttonLabel = !challenge
    ? ""
    : challenge.finished
      ? "See results"
      : challenge.finishedBoards > 0
        ? "Continue"
        : "Start";
  const open = () => {
    if (!challenge) return;
    // A FINISHED challenge has nothing left to play, and the platform would answer
    // with its own results page — the leaderboard the app already draws. Go straight
    // to the app's, with this challenge selected, rather than into the embed just to
    // turn around and leave it.
    if (challenge.finished) {
      router.push({ pathname: "/club-challenges", params: { id: challenge.id } });
      return;
    }
    // Otherwise the platform's entry page decides which board is next.
    router.push({ pathname: "/challenge-play", params: { id: challenge.id } });
  };

  return (
    <BrandChrome>
      <View style={styles.page}>
        <View style={styles.titleRow}>
          <BackChevron
            onPress={() =>
              leaveWithFade(() =>
                router.canGoBack() ? router.back() : router.replace("/club-challenges"),
              )
            }
            style={{ marginRight: 8 * s }}
          />
          <Text style={styles.title} numberOfLines={1}>
            {challenge?.name ?? "Challenge"}
          </Text>
        </View>

        {!challenge ? (
          <View style={styles.center}>
            {error ? (
              <Text style={styles.emptyText}>{error}</Text>
            ) : (
              <ActivityIndicator color={Brand.green} />
            )}
          </View>
        ) : (
          <>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <View style={{ alignSelf: "center", marginTop: 24 * s }}>
                <ChallengeTile size={TILE * s} />
              </View>

              <View style={[styles.facts, { marginTop: 22 * s, marginHorizontal: 25 }]}>
                <FactRow label="Boards" value={`${challenge.boards}`} scale={s} />
                <FactRow label="Scoring" value={challenge.scoringLabel} scale={s} />
                {challenge.createdByName ? (
                  <FactRow label="Set by" value={challenge.createdByName} scale={s} />
                ) : null}
                <FactRow
                  label="Your progress"
                  value={
                    challenge.finished
                      ? "Finished"
                      : `${challenge.finishedBoards} of ${challenge.boards} boards`
                  }
                  scale={s}
                />
                {invitePending ? (
                  <FactRow label="Invite" value="Awaiting your response" scale={s} />
                ) : null}
                {inviteDeclined ? <FactRow label="Invite" value="Declined" scale={s} /> : null}
                {/* Archived is a fact about the challenge, so it is stated whether or
                    not this viewer can change it. */}
                {challenge.archived ? (
                  <FactRow label="Status" value="Archived" scale={s} />
                ) : null}
              </View>

              {/* Moderators only — the platform refuses anyone else, so offering it
                  more widely would only produce a button that fails. */}
              {challenge.moderator ? (
                <Pressable
                  onPress={toggleArchive}
                  disabled={archiving}
                  accessibilityRole="button"
                  accessibilityLabel={challenge.archived ? "Reopen challenge" : "Archive challenge"}
                  style={({ pressed }) => [
                    styles.archiveRow,
                    { marginTop: 14 * s },
                    (pressed || archiving) && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name={challenge.archived ? "refresh-outline" : "archive-outline"}
                    size={15 * s}
                    color={Brand.ink}
                  />
                  <Text style={[styles.archiveText, { fontSize: 13 * s }]}>
                    {archiving
                      ? "Working…"
                      : challenge.archived
                        ? "Reopen challenge"
                        : "Archive challenge"}
                  </Text>
                </Pressable>
              ) : null}

              <Text style={[styles.heading, { paddingTop: 20 * s, paddingBottom: 8 * s }]}>
                About this Challenge
              </Text>
              <Text style={[styles.description, challenge.description ? null : styles.muted]}>
                {challenge.description ||
                  `${challenge.boards} boards, everyone plays the same cards — your score is how you compare with the rest of the field.`}
              </Text>
            </ScrollView>

            {invitePending ? (
              // Accept and Decline, side by side, in place — nothing leaves
              // this screen to answer an invitation.
              <View style={{ flexDirection: "row", gap: 10, marginHorizontal: 25, marginBottom: 14 * s }}>
                <Pressable
                  onPress={() => void respond("accept")}
                  disabled={responding !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Accept challenge"
                  style={({ pressed }) => [
                    styles.start,
                    { flex: 1, paddingVertical: 13 * s },
                    (pressed || responding !== null) && styles.pressed,
                  ]}
                >
                  <Text style={[styles.startText, { fontSize: 15 * s }]}>
                    {responding === "accept" ? "Accepting…" : "Accept challenge"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void respond("decline")}
                  disabled={responding !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Decline challenge"
                  style={({ pressed }) => [
                    styles.decline,
                    { flex: 1, paddingVertical: 13 * s },
                    (pressed || responding !== null) && styles.pressed,
                  ]}
                >
                  <Text style={[styles.declineText, { fontSize: 15 * s }]}>
                    {responding === "decline" ? "Declining…" : "Decline"}
                  </Text>
                </Pressable>
              </View>
            ) : inviteDeclined ? (
              <Text
                style={[
                  styles.emptyText,
                  { marginHorizontal: 25, marginBottom: 18 * s },
                ]}
              >
                You declined this invitation.
              </Text>
            ) : (
              <Pressable
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel={buttonLabel}
                style={({ pressed }) => [
                  styles.start,
                  { marginHorizontal: 25, marginBottom: 14 * s, paddingVertical: 13 * s },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.startText, { fontSize: 15 * s }]}>{buttonLabel}</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      <TabLoading ready={challenge !== null || error !== null} />
    </BrandChrome>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingBottom: TAB_BAR_CLEARANCE },
  titleRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 25 },
  title: {
    flex: 1,
    fontFamily: Fonts.display,
    fontSize: Type.screenTitle,
    color: Brand.ink,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: "rgba(31,31,31,0.55)",
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 32,
  },
  facts: {
    borderRadius: 12,
    backgroundColor: "rgba(31,31,31,0.05)",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  factRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  factLabel: { fontFamily: Fonts.body, color: "rgba(31,31,31,0.6)" },
  factValue: { fontFamily: Fonts.bodySemibold, color: Brand.ink },
  heading: {
    fontFamily: Fonts.heading,
    fontSize: Type.sectionHeading,
    color: Brand.ink,
    paddingHorizontal: 25,
  },
  description: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Brand.ink,
    lineHeight: 23,
    paddingHorizontal: 25,
  },
  muted: { color: "rgba(31,31,31,0.55)" },
  start: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: Brand.green,
  },
  startText: { fontFamily: Fonts.bodySemibold, color: Brand.cream },
  /** Decline: the quiet twin — outlined, never louder than Accept. */
  decline: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.green,
    backgroundColor: "transparent",
  },
  declineText: { fontFamily: Fonts.bodySemibold, color: Brand.green },
  /** A quiet, secondary control — an outline row, not a filled button: retiring a
   *  challenge is deliberate but it is not the screen's main action. */
  archiveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginHorizontal: 25,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(31,31,31,0.28)",
  },
  archiveText: { fontFamily: Fonts.body, color: Brand.ink },
  pressed: { opacity: 0.6 },
});
