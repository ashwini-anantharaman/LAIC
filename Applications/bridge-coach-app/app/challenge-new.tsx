// New Challenge — NATIVE (M3f; this was a BridgeEmbed of the platform's
// create wizard). Title, what a board asks for (bid & play / bidding only),
// scoring, when standings show, how many boards, and who's invited — the
// core of the platform wizard, one screen. Boards travel as SEEDS; the
// server re-deals identical packs and re-validates the whole draft with the
// same shared rules the web wizard uses.
//
// Deliberately NOT carried over (yet): hand-editing packs, BBO import, and
// the per-control checklist — the draft ships the checklist's scored-play
// defaults (hands hidden, no undo). Those return with the native table work
// if wanted; creating, inviting and playing never needed them.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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

import { Screen, ScreenHeader } from "../components/ui";
import { Brand, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { BridgeApiError } from "../lib/bridge-api";
import {
  createChallenge,
  DEFAULT_CONTROL_OVERRIDES,
  fetchChallengePeople,
  MAX_BOARDS,
  MIN_BOARDS,
  type ChallengeFormat,
  type ChallengePerson,
  type ChallengeScoring,
  type StandingsVisibility,
} from "../lib/challenge-create";
import { useSelectedClubId } from "../lib/club-context";
import { PROGRAM_ID } from "../lib/config";
import type { Seat } from "../lib/plays";

const FORMATS: { key: ChallengeFormat; label: string; note: string }[] = [
  { key: "full", label: "Bid & play", note: "The whole board, scored against the field." },
  {
    key: "bidding-only",
    label: "Bidding only",
    note: "The board ends with the auction — your contract beside BEN's.",
  },
];

const SCORINGS: { key: ChallengeScoring; label: string }[] = [
  { key: "imps", label: "IMPs" },
  { key: "mp", label: "Matchpoints" },
  { key: "total", label: "Total points" },
];

const STANDINGS: { key: StandingsVisibility; label: string; note: string }[] = [
  {
    key: "after-finish",
    label: "After each player finishes",
    note: "Spoiler-safe — nobody sees a score until they've played every board.",
  },
  { key: "always", label: "Always visible", note: "A live race from board one." },
];

/** The standard dealer rotation: board 1 N, 2 E, 3 S, 4 W, repeating. */
const DEALER_CYCLE: Seat[] = ["N", "E", "S", "W"];

export default function ChallengeNewScreen() {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<ChallengeFormat>("full");
  const [scoring, setScoring] = useState<ChallengeScoring>("imps");
  const [standings, setStandings] = useState<StandingsVisibility>("after-finish");
  const [boardCount, setBoardCount] = useState(4);
  const [people, setPeople] = useState<ChallengePerson[] | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [moderators, setModerators] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      fetchChallengePeople(token, programId)
        .then(({ people: list }) => !cancelled && setPeople(list))
        .catch((e) => {
          if (!cancelled) {
            setPeople([]);
            if (e instanceof BridgeApiError && e.status === 404) {
              setError("Creating challenges isn't part of your role in this club.");
            }
          }
        });
      return () => {
        cancelled = true;
      };
    }, [token, programId]),
  );

  const toggleInvite = (userId: string) => {
    const next = new Set(invited);
    if (next.has(userId)) {
      next.delete(userId);
      const mods = new Set(moderators);
      mods.delete(userId);
      setModerators(mods);
    } else {
      next.add(userId);
    }
    setInvited(next);
  };

  const toggleModerator = (userId: string) => {
    if (!invited.has(userId)) return;
    const next = new Set(moderators);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setModerators(next);
  };

  const create = useCallback(async () => {
    if (!token || busy) return;
    if (!title.trim()) {
      setError("Give the challenge a title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createChallenge(token, programId, {
        title: title.trim(),
        description: description.trim(),
        ...(format === "full" ? {} : { format }),
        scoring,
        standingsVisibility: standings,
        boards: Array.from({ length: boardCount }, (_, i) => ({
          boardNo: i + 1,
          seed: Math.floor(Math.random() * 100_000) + 1,
          dealer: DEALER_CYCLE[i % 4]!,
          // The app's convention everywhere: the human sits South.
          humanSeat: "S" as const,
        })),
        controlOverrides: DEFAULT_CONTROL_OVERRIDES,
        invites: [...invited].map((userId) => ({
          userId,
          moderator: moderators.has(userId),
        })),
        editorBadge: false,
      });
      router.replace("/club-challenges");
    } catch (e) {
      setError(e instanceof BridgeApiError ? e.message : "Couldn't create it — try again.");
      setBusy(false);
    }
  }, [token, programId, busy, title, description, format, scoring, standings, boardCount, invited, moderators]);

  return (
    <Screen>
      <ScreenHeader title="New Challenge" backTo="/club-challenges" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {error && (
            <Pressable onPress={() => setError(null)}>
              <Text style={styles.errorBanner}>{error}</Text>
            </Pressable>
          )}

          <Text style={styles.fieldLabel}>TITLE</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Tuesday night slam hunt"
            placeholderTextColor="rgba(31,31,31,0.35)"
            maxLength={120}
          />

          <Text style={styles.fieldLabel}>DESCRIPTION (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, { minHeight: 56 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="A line about what this challenge is for"
            placeholderTextColor="rgba(31,31,31,0.35)"
            multiline
            maxLength={240}
          />

          <Text style={styles.fieldLabel}>WHAT A BOARD ASKS FOR</Text>
          {FORMATS.map((f) => (
            <OptionRow
              key={f.key}
              label={f.label}
              note={f.note}
              on={format === f.key}
              onPress={() => setFormat(f.key)}
            />
          ))}

          {/* Bidding-only has no field maths — the scoring question drops away,
              exactly as it does in the web wizard. */}
          {format === "full" && (
            <>
              <Text style={styles.fieldLabel}>SCORING</Text>
              <View style={styles.pickRow}>
                {SCORINGS.map((s) => (
                  <Pressable
                    key={s.key}
                    onPress={() => setScoring(s.key)}
                    style={[styles.pick, scoring === s.key && styles.pickOn]}
                  >
                    <Text style={[styles.pickText, scoring === s.key && styles.pickTextOn]}>
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.fieldLabel}>STANDINGS</Text>
          {STANDINGS.map((s) => (
            <OptionRow
              key={s.key}
              label={s.label}
              note={s.note}
              on={standings === s.key}
              onPress={() => setStandings(s.key)}
            />
          ))}

          <Text style={styles.fieldLabel}>BOARDS</Text>
          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => setBoardCount((n) => Math.max(MIN_BOARDS, n - 1))}
              style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
            >
              <Text style={styles.stepButtonText}>−</Text>
            </Pressable>
            <Text style={styles.stepValue}>
              {boardCount} board{boardCount === 1 ? "" : "s"}
            </Text>
            <Pressable
              onPress={() => setBoardCount((n) => Math.min(MAX_BOARDS, n + 1))}
              style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
            >
              <Text style={styles.stepButtonText}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Fresh random deals, dealt the moment you create — everyone plays the same
            boards, you South. Hands stay hidden and there&apos;s no undo: scored play.
          </Text>

          <Text style={styles.fieldLabel}>WHO&apos;S IN</Text>
          <Text style={styles.hint}>You&apos;re in automatically, as a moderator.</Text>
          {people === null ? (
            <Text style={styles.emptyBox}>Finding your club…</Text>
          ) : people.length === 0 ? (
            <Text style={styles.emptyBox}>Nobody else to invite in this club yet.</Text>
          ) : (
            people.map((p) => {
              const on = invited.has(p.userId);
              const mod = moderators.has(p.userId);
              return (
                <Pressable
                  key={p.userId}
                  onPress={() => toggleInvite(p.userId)}
                  style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
                >
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on ? <Text style={styles.checkboxTick}>✓</Text> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {p.handle ? (
                      <Text style={styles.personHandle} numberOfLines={1}>
                        {p.handle}
                      </Text>
                    ) : null}
                  </View>
                  {on && (
                    <Pressable onPress={() => toggleModerator(p.userId)} hitSlop={8}>
                      <Text style={[styles.modChip, mod && styles.modChipOn]}>
                        {mod ? "moderator ✓" : "make moderator"}
                      </Text>
                    </Pressable>
                  )}
                </Pressable>
              );
            })
          )}

          <Pressable
            onPress={create}
            disabled={busy || !title.trim()}
            style={({ pressed }) => [
              styles.createButton,
              (busy || !title.trim()) && { opacity: 0.4 },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={styles.createButtonText}>
              {busy ? "Creating…" : "Create challenge"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function OptionRow({
  label,
  note,
  on,
  onPress,
}: {
  label: string;
  note: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <View style={[styles.radio, on && styles.radioOn]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.optionLabel, on && { color: Brand.white }]}>{label}</Text>
        <Text style={[styles.optionNote, on && { color: "rgba(255,244,215,0.8)" }]}>{note}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  errorBanner: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    backgroundColor: "#b91c1c",
    color: Brand.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
    overflow: "hidden",
  },
  fieldLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10.5,
    letterSpacing: 1.9,
    color: "#a49d8e",
    marginTop: 20,
    marginBottom: 7,
  },
  input: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Brand.ink,
    backgroundColor: "#fffefa",
    borderWidth: 1,
    borderColor: "#d3ccbb",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  hint: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18, color: "#7b7466", marginTop: 4 },
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
    marginTop: 8,
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Brand.white,
    borderWidth: 1,
    borderColor: "#d3ccbb",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  optionOn: { backgroundColor: Brand.green, borderColor: Brand.green },
  optionLabel: { fontFamily: Fonts.bodySemibold, fontSize: 14, color: Brand.ink },
  optionNote: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 17, color: "#7b7466", marginTop: 2 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#d3ccbb",
  },
  radioOn: { borderColor: Brand.cream, backgroundColor: Brand.cream },

  pickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pick: {
    borderWidth: 1,
    borderColor: "#d3ccbb",
    backgroundColor: Brand.white,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pickOn: { borderColor: Brand.green, backgroundColor: Brand.green },
  pickText: { fontFamily: Fonts.body, fontSize: 13, color: "#5e5749" },
  pickTextOn: { fontFamily: Fonts.bodySemibold, color: Brand.white },

  stepperRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Brand.green,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 20, lineHeight: 24, color: Brand.white },
  stepValue: { fontFamily: Fonts.displayMedium, fontSize: 17, color: Brand.ink },

  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Brand.green,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  personName: { fontFamily: Fonts.bodySemibold, fontSize: 14, color: Brand.white },
  personHandle: { fontFamily: Fonts.body, fontSize: 11.5, color: "rgba(255,244,215,0.7)", marginTop: 1 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Brand.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: Brand.cream },
  checkboxTick: { fontSize: 13, lineHeight: 15, color: Brand.green, fontFamily: Fonts.bodySemibold },
  modChip: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    color: "rgba(255,244,215,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,244,215,0.45)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  modChipOn: { backgroundColor: Brand.cream, color: Brand.ink, borderColor: Brand.cream },

  createButton: {
    backgroundColor: Brand.maroon,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 24,
  },
  createButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 15, color: Brand.cream },

  pressed: { opacity: 0.8 },
});
