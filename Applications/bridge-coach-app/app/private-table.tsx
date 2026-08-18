// A PRIVATE TABLE: a few boards, a handful of friends, and a leaderboard between
// just you.
//
// WHAT IT IS NOT, said plainly because the name invites the other reading: nobody
// sits down together. The table engine seats ONE person and plays the other three
// seats with the robots — there is no presence, no turn-passing and no live
// transport anywhere in the platform — so four people at one table simultaneously is
// a build, not a wiring job. What this does instead is give everyone the SAME deals
// and compare the results, which is the social part, minus the simultaneity.
//
// Underneath it is a challenge, because a challenge already is this — and since M4
// the FORM is the same too: the shared wizard (components/challenge-wizard.tsx) in
// its personal mode. Quick create is friends + boards; Advanced opens the same five
// steps the club's New Challenge has; drafts park and resume the same way. The
// invite list is YOUR FRIENDS and only your friends — resolved server-side from the
// caller's identity, so this screen could not widen it if it tried — and a personal
// draft is the creator's own, on no club's shelf.
//
// This screen is as much "where are my tables" as "make another one", so above the
// wizard: the tables you already have, and the drafts you parked.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChallengeWizard } from "../components/challenge-wizard";
import { Screen, ScreenHeader } from "../components/ui";
import { Brand, Fonts } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import {
  deleteChallengeDraft,
  fetchChallengeDrafts,
  type ChallengeDraftRow,
} from "../lib/challenge-create";
import { fetchClubChallenges, type ClubChallenge } from "../lib/challenges";
import { useSelectedClubId } from "../lib/club-context";
import { PROGRAM_ID } from "../lib/config";
import { confirmDestructive } from "../lib/dialogs";

export default function PrivateTableScreen() {
  const { token } = useAuth();
  // Sent as the request's program so the platform can resolve the caller at all.
  // It is NOT what the table is filed under — `personal` decides that, and the
  // server stores no owning program for it.
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;

  const [tables, setTables] = useState<ClubChallenge[] | null>(null);
  const [drafts, setDrafts] = useState<ChallengeDraftRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      fetchClubChallenges(token, clubId ?? PROGRAM_ID, { personal: true })
        .then((rows) => !cancelled && setTables(rows))
        .catch(() => !cancelled && setTables([]));
      fetchChallengeDrafts(token, programId, "personal")
        .then(({ drafts: rows }) => !cancelled && setDrafts(rows))
        .catch(() => !cancelled && setDrafts([]));
      return () => {
        cancelled = true;
      };
    }, [token, clubId, programId]),
  );

  const removeDraft = (d: ChallengeDraftRow) =>
    confirmDestructive("Delete draft?", `"${d.title}" will be gone.`, "Delete", () => {
      if (!token) return;
      deleteChallengeDraft(token, programId, d.entryId)
        .then(() => setDrafts((prev) => prev?.filter((x) => x.entryId !== d.entryId) ?? null))
        .catch(() => {});
    });

  const topContent = (
    <>
      <Text style={styles.blurb}>
        Everyone plays the same boards and the results compare. You each play when it
        suits you — the other three seats are the robots, as usual.
      </Text>

      {/* Existing tables first: the screen is as much "where are my tables" as it
          is "make another one". */}
      {tables && tables.length > 0 ? (
        <>
          <Text style={styles.heading}>Your tables</Text>
          <View style={styles.card}>
            {tables.map((t, i) => (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: "/challenge-info", params: { id: t.id } })}
                accessibilityRole="button"
                accessibilityLabel={t.name}
                style={({ pressed }) => [
                  styles.row,
                  i === 0 ? null : styles.divided,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.rowName} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={styles.rowNote}>{t.boards} boards</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {/* Parked work, beside the tables it will join. YOUR drafts only — a
          personal draft never sits on a club shelf, and nobody else sees it. */}
      {drafts && drafts.length > 0 ? (
        <>
          <Text style={styles.heading}>Drafts</Text>
          <View style={styles.card}>
            {drafts.map((d, i) => (
              <Pressable
                key={d.entryId}
                onPress={() => router.setParams({ draft: d.entryId })}
                accessibilityRole="button"
                accessibilityLabel={`Keep building ${d.title}`}
                style={({ pressed }) => [
                  styles.row,
                  i === 0 ? null : styles.divided,
                  pressed && styles.pressed,
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {d.title}
                  </Text>
                  <Text style={styles.rowNote}>
                    {d.boardCount} board{d.boardCount === 1 ? "" : "s"} · keep building →
                  </Text>
                </View>
                <Pressable
                  onPress={() => removeDraft(d)}
                  hitSlop={10}
                  accessibilityLabel={`Delete draft ${d.title}`}
                >
                  <Text style={styles.deleteMark}>✕</Text>
                </Pressable>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </>
  );

  return (
    <Screen>
      <ScreenHeader title="Private table" />
      <ChallengeWizard personal topContent={topContent} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  blurb: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 19,
    color: "#7b7466",
    marginTop: 14,
  },
  heading: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10.5,
    letterSpacing: 1.9,
    color: "#a49d8e",
    marginTop: 20,
    marginBottom: 7,
  },
  card: {
    backgroundColor: Brand.white,
    borderWidth: 1,
    borderColor: "#d3ccbb",
    borderRadius: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  divided: { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)" },
  rowName: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.ink, flex: 1 },
  rowNote: { fontFamily: Fonts.body, fontSize: 11.5, color: "#7b7466", marginTop: 1 },
  deleteMark: { fontFamily: Fonts.bodySemibold, fontSize: 14, color: "#a49d8e", paddingHorizontal: 4 },
  pressed: { opacity: 0.85 },
});
