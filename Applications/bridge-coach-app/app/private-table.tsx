// A PRIVATE TABLE: a few boards, a handful of friends, and a leaderboard between
// just you.
//
// WHAT IT IS NOT, said plainly because the name invites the other reading: nobody
// sits down together. The table engine seats ONE person and plays the other three
// seats with the neural engine — there is no presence, no turn-passing and no live
// transport anywhere in the platform — so four people at one table simultaneously is
// a build, not a wiring job. What this does instead is give everyone the SAME deals
// and compare the results, which is the social part, minus the simultaneity.
//
// Underneath it is a challenge, because a challenge already is this: identical boards
// dealt from a shared seed, invites, scoring, standings, resume. The only thing added
// is that it belongs to a PERSON rather than a club — stored unowned with
// scope_level "user" — so friends from another club, or from none, can play, and it
// shows up on no club's list.

import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Avatar } from "../components/avatar";
import { PrimaryButton, Screen, ScreenHeader } from "../components/ui";
import { Brand, Colors, Fonts, Radius, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { useSelectedClubId } from "../lib/club-context";
import { PROGRAM_ID } from "../lib/config";
import {
  createChallenge,
  DEFAULT_CONTROL_OVERRIDES,
  MAX_BOARDS,
  MIN_BOARDS,
} from "../lib/challenge-create";
import { fetchClubChallenges, type ClubChallenge } from "../lib/challenges";
import { getFriends, type FriendPerson } from "../lib/friends";

/** The standard dealer rotation: board 1 N, 2 E, 3 S, 4 W, repeating. */
const DEALER_CYCLE = ["N", "E", "S", "W"] as const;

const BOARD_CHOICES = [1, 2, 4, 8] as const;

export default function PrivateTableScreen() {
  const { token } = useAuth();
  // Sent as the request's program so the platform can resolve the caller at all.
  // It is NOT what the challenge is filed under — `personal` decides that, and the
  // server stores no owning program for it.
  const clubId = useSelectedClubId();

  const [friends, setFriends] = useState<FriendPerson[] | null>(null);
  const [tables, setTables] = useState<ClubChallenge[] | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [boards, setBoards] = useState<number>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [snapshot, existing] = await Promise.all([
        getFriends(token),
        fetchClubChallenges(token, clubId ?? PROGRAM_ID, { personal: true }).catch(() => []),
      ]);
      setFriends(snapshot.friends);
      setTables(existing);
    } catch {
      setError("Couldn't load your friends. Try again.");
      setFriends([]);
    }
  }, [token, clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canCreate = invited.size > 0 && !busy;

  const create = async () => {
    if (!token || !canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const { challengeId } = await createChallenge(token, clubId ?? PROGRAM_ID, {
        title: title.trim() || defaultTitle(friends ?? [], invited),
        description: "",
        scoring: "imps",
        // Everyone can see where they stand from the start: this is a table between
        // friends, not an exam, and hiding the board until the last person finishes
        // is the wrong default for a group of four who already know each other.
        standingsVisibility: "always",
        boards: Array.from({ length: boards }, (_, i) => ({
          boardNo: i + 1,
          // One seed per board, dealt server-side from it, so every player gets the
          // IDENTICAL pack — which is the whole basis of comparing the results.
          seed: Math.floor(Math.random() * 100_000) + 1,
          dealer: DEALER_CYCLE[i % 4]!,
          // The app's convention everywhere: the human sits South.
          humanSeat: "S" as const,
        })),
        controlOverrides: DEFAULT_CONTROL_OVERRIDES,
        // No moderators: a private table has no one to police, and its creator can
        // already archive it.
        invites: [...invited].map((userId) => ({ userId, moderator: false })),
        editorBadge: false,
        personal: true,
      });
      router.replace({ pathname: "/challenge-info", params: { id: challengeId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the table.");
      setBusy(false);
    }
  };

  const sorted = useMemo(
    () => [...(friends ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [friends],
  );

  return (
    <Screen>
      <ScreenHeader title="Private table" />
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
                  onPress={() =>
                    router.push({ pathname: "/challenge-info", params: { id: t.id } })
                  }
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

        <Text style={styles.heading}>Who's playing</Text>

        {!friends ? (
          <ActivityIndicator color={Colors.text} style={{ marginTop: 16 }} />
        ) : sorted.length === 0 ? (
          <View>
            <Text style={styles.empty}>
              No friends yet — a private table needs someone to play against.
            </Text>
            <PrimaryButton label="Find friends" onPress={() => router.push("/friends")} />
          </View>
        ) : (
          <View style={styles.card}>
            {sorted.map((f, i) => {
              const on = invited.has(f.profileId);
              return (
                <Pressable
                  key={f.profileId}
                  onPress={() => toggle(f.profileId)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={f.name}
                  style={({ pressed }) => [
                    styles.row,
                    i === 0 ? null : styles.divided,
                    pressed && styles.pressed,
                  ]}
                >
                  <Avatar uri={f.avatar} width={26} height={25} tint={Brand.cream} />
                  <Text style={[styles.rowName, { marginLeft: 14 }]} numberOfLines={1}>
                    {f.name}
                  </Text>
                  {/* A tick, not a checkbox outline: on a green row the outline reads
                      as a control that is somehow disabled. */}
                  <Text style={[styles.tick, { opacity: on ? 1 : 0.25 }]}>✓</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {sorted.length > 0 ? (
          <>
            <Text style={styles.heading}>How many boards</Text>
            <View style={styles.chips}>
              {BOARD_CHOICES.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setBoards(n)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: boards === n }}
                  accessibilityLabel={`${n} boards`}
                  style={[styles.chip, boards === n && styles.chipOn]}
                >
                  <Text style={[styles.chipText, boards === n && styles.chipTextOn]}>{n}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.heading}>Name it (optional)</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={defaultTitle(sorted, invited)}
              placeholderTextColor="rgba(255,244,215,0.55)"
              style={styles.input}
              maxLength={60}
              accessibilityLabel="Table name"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <PrimaryButton
              label={
                busy
                  ? "Setting the table…"
                  : invited.size === 0
                    ? "Pick someone to play"
                    : `Create table for ${invited.size + 1}`
              }
              onPress={create}
              disabled={!canCreate}
            />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** "Table with Keith" / "Table with 3 friends" — a name nobody has to think about. */
function defaultTitle(friends: FriendPerson[], invited: Set<string>): string {
  const picked = friends.filter((f) => invited.has(f.profileId));
  if (picked.length === 1) return `Table with ${picked[0]!.name}`;
  if (picked.length > 1) return `Table with ${picked.length} friends`;
  return "Private table";
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.screen, paddingBottom: 40, gap: 12 },
  blurb: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: Colors.textMuted,
  },
  heading: { fontFamily: Fonts.heading, fontSize: 17, color: Brand.ink, marginTop: 8 },
  card: { backgroundColor: Brand.green, borderRadius: Radius.field, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", height: 48, paddingHorizontal: 15 },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,244,215,0.22)",
  },
  pressed: { opacity: 0.7 },
  rowName: { flex: 1, fontFamily: Fonts.display, fontSize: 14.4, color: Brand.white },
  rowNote: { fontFamily: Fonts.body, fontSize: 13, color: "rgba(255,244,215,0.75)" },
  tick: { fontFamily: Fonts.bodySemibold, fontSize: 16, color: Brand.cream },
  chips: { flexDirection: "row", gap: 10 },
  chip: {
    minWidth: 52,
    paddingVertical: 9,
    borderRadius: Radius.button,
    alignItems: "center",
    backgroundColor: "rgba(84,16,21,0.08)",
  },
  chipOn: { backgroundColor: Brand.green },
  chipText: { fontFamily: Fonts.bodySemibold, fontSize: 14, color: Brand.ink },
  chipTextOn: { color: Brand.cream },
  input: {
    backgroundColor: Brand.green,
    borderRadius: Radius.field,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Brand.cream,
  },
  empty: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 14,
    lineHeight: 21,
  },
  error: { fontFamily: Fonts.body, fontSize: 13, color: Colors.danger, marginTop: 4 },
});
