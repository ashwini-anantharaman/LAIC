// The deal editor — NATIVE (M3c; authoring lived in the /m/library/new
// WebView). Four hands typed suit by suit, board facts (dealer, vul) when
// authoring a board, and a save that lands the entry in the library.
//
// Validation runs twice, on purpose: live here (per-seat card counts,
// duplicate cards, stray characters — so the Save button is honest), and
// authoritatively on the server (createDeal answers with the action's exact
// copy). ?kind=deal authors a bare pack — the card distribution alone, no
// board facts; the stored discriminator stays "deal", the display noun is
// "pack" (the library's vocabulary).

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
import { useSelectedClubId } from "../lib/club-context";
import { PROGRAM_ID } from "../lib/config";
import { createDeal, refreshLibrary } from "../lib/library";
import { useBridgeMe } from "../lib/use-bridge-can";
import type { Seat } from "../lib/plays";

const SEATS: Seat[] = ["N", "E", "S", "W"];
const SUITS = ["S", "H", "D", "C"] as const;
const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const VULS = ["none", "NS", "EW", "both"] as const;
const VALID_RANKS = new Set("AKQJT98765432".split(""));

type SuitTexts = Record<(typeof SUITS)[number], string>;
type HandsState = Record<Seat, SuitTexts>;

const emptyHands = (): HandsState =>
  Object.fromEntries(
    SEATS.map((seat) => [seat, { S: "", H: "", D: "", C: "" }]),
  ) as HandsState;

/** "ak q2" / "10 9" → ["A","K","Q","2"]… mirroring the server's ranksFromText. */
function ranksOf(text: string): { ranks: string[]; bad?: string } {
  const norm = text.toUpperCase().replaceAll("10", "T").replace(/[\s,.]/g, "");
  const ranks: string[] = [];
  for (const ch of norm) {
    if (!VALID_RANKS.has(ch)) return { ranks, bad: ch };
    ranks.push(ch);
  }
  return { ranks };
}

export default function DealEditorScreen() {
  const { kind: rawKind, flow } = useLocalSearchParams<{ kind?: string; flow?: string }>();
  const kind = rawKind === "deal" ? "deal" : "board";
  const noun = kind === "deal" ? "pack" : "board";
  // The Create Assignment flow: authoring is step one of two, so the save
  // lands on the assign picker for the new entry instead of the library.
  const flowAssign = flow === "assign";
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;
  const me = useBridgeMe();
  const view: "mine" | "program" = me?.library.programScope ? "program" : "mine";

  const [name, setName] = useState("");
  const [hands, setHands] = useState<HandsState>(emptyHands);
  const [dealer, setDealer] = useState<Seat>("N");
  const [vul, setVul] = useState<(typeof VULS)[number]>("none");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const setSuit = useCallback((seat: Seat, suit: (typeof SUITS)[number], text: string) => {
    setHands((prev) => ({ ...prev, [seat]: { ...prev[seat], [suit]: text } }));
  }, []);

  // Live validation: per-seat counts, stray characters, and the same card in
  // two hands (or twice in one). The server re-checks all of it.
  const check = useMemo(() => {
    const counts = {} as Record<Seat, number>;
    const seen = new Map<string, Seat>();
    let problem: string | null = null;
    for (const seat of SEATS) {
      let count = 0;
      for (const suit of SUITS) {
        const { ranks, bad } = ranksOf(hands[seat][suit]);
        if (bad && !problem) problem = `${seat}: "${bad}" is not a card rank`;
        for (const rank of ranks) {
          const card = `${SUIT_GLYPH[suit]}${rank}`;
          const holder = seen.get(card);
          if (holder && !problem) {
            problem =
              holder === seat ? `${seat} holds ${card} twice` : `${holder} and ${seat} both hold ${card}`;
          }
          seen.set(card, holder ?? seat);
          count++;
        }
      }
      counts[seat] = count;
    }
    const complete = SEATS.every((s) => counts[s] === 13);
    return { counts, problem, ready: complete && !problem };
  }, [hands]);

  const save = useCallback(async () => {
    if (!token || saving || !check.ready) return;
    setSaving(true);
    setServerError(null);
    try {
      // The editor's serialized hand form: ♠.♥.♦.♣ joined with dots.
      const serialized = Object.fromEntries(
        SEATS.map((seat) => [seat, SUITS.map((s) => hands[seat][s]).join(".")]),
      ) as Record<Seat, string>;
      const { entryId } = await createDeal(token, programId, {
        kind,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(kind === "board" ? { dealer, vul } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        hands: serialized,
      });
      // The library lists it the moment we land back there.
      void refreshLibrary(token, programId, view).catch(() => {});
      if (flowAssign) {
        router.replace(`/assign?entry=${encodeURIComponent(entryId)}`);
      } else {
        router.replace(`/library?kind=${kind}`);
      }
    } catch (e) {
      setServerError(
        e instanceof BridgeApiError ? e.message : "Couldn't save — try again.",
      );
      setSaving(false);
    }
  }, [token, programId, saving, check.ready, hands, kind, name, dealer, vul, notes, view]);

  return (
    <Screen>
      <ScreenHeader
        title={flowAssign ? "New assignment" : `New ${noun}`}
        backTo={flowAssign ? "/coach" : "/library"}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lede}>
            {flowAssign
              ? "Type each hand suit by suit — after saving you'll pick which learners play it."
              : `Type each hand suit by suit — the saved ${noun} lands in your library, ready to play.`}
          </Text>

          {(serverError ?? check.problem) && (
            <Text style={styles.errorBanner}>{serverError ?? check.problem}</Text>
          )}

          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder={kind === "deal" ? "Authored pack" : "Authored board"}
            placeholderTextColor="rgba(31,31,31,0.35)"
          />

          {SEATS.map((seat) => {
            const count = check.counts[seat];
            const done = count === 13;
            return (
              <View key={seat} style={styles.seatCard}>
                <View style={styles.seatHeader}>
                  <Text style={styles.seatName}>{seat}</Text>
                  <Text style={[styles.seatCount, done ? styles.seatCountDone : count > 13 && styles.seatCountOver]}>
                    {count}/13
                  </Text>
                </View>
                {SUITS.map((suit) => (
                  <View key={suit} style={styles.suitRow}>
                    <Text
                      style={[
                        styles.suitGlyph,
                        { color: suit === "H" || suit === "D" ? "#e2b6b6" : Brand.cream },
                      ]}
                    >
                      {SUIT_GLYPH[suit]}
                    </Text>
                    <TextInput
                      style={styles.suitInput}
                      value={hands[seat][suit]}
                      onChangeText={(t) => setSuit(seat, suit, t)}
                      placeholder="AKQJT98765432"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      spellCheck={false}
                    />
                  </View>
                ))}
              </View>
            );
          })}

          {kind === "board" && (
            <>
              <Text style={styles.fieldLabel}>DEALER</Text>
              <View style={styles.pickRow}>
                {SEATS.map((s) => (
                  <Pick key={s} label={s} on={dealer === s} onPress={() => setDealer(s)} />
                ))}
              </View>
              <Text style={styles.fieldLabel}>VULNERABILITY</Text>
              <View style={styles.pickRow}>
                {VULS.map((v) => (
                  <Pick key={v} label={v} on={vul === v} onPress={() => setVul(v)} />
                ))}
              </View>
            </>
          )}

          <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
          <TextInput
            style={[styles.nameInput, { minHeight: 64 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. focus on the opening lead"
            placeholderTextColor="rgba(31,31,31,0.35)"
            multiline
          />

          <Pressable
            onPress={save}
            disabled={!check.ready || saving}
            style={({ pressed }) => [
              styles.saveButton,
              (!check.ready || saving) && { opacity: 0.4 },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={styles.saveButtonText}>
              {saving
                ? "Saving…"
                : flowAssign
                  ? "Save & pick learners"
                  : kind === "deal"
                    ? "Save pack"
                    : "Save board"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Pick({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pick, on && styles.pickOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.pickText, on && styles.pickTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lede: { fontFamily: Fonts.body, fontSize: 12.5, lineHeight: 19, color: "#7b7466", marginTop: 2 },
  errorBanner: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 12.5,
    backgroundColor: "#fdf1f1",
    borderWidth: 1,
    borderColor: "#f3c2c2",
    color: "#8a2b2b",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    overflow: "hidden",
  },

  fieldLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10.5,
    letterSpacing: 1.9,
    color: "#a49d8e",
    marginTop: 18,
    marginBottom: 7,
  },
  nameInput: {
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

  seatCard: {
    backgroundColor: Brand.green,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  seatHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  seatName: { flex: 1, fontFamily: Fonts.displayMedium, fontSize: 16, color: Brand.white },
  seatCount: { fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: "rgba(255,244,215,0.6)" },
  seatCountDone: { color: Brand.cream },
  seatCountOver: { color: "#ffb4b4" },
  suitRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  suitGlyph: { width: 20, fontSize: 16, textAlign: "center" },
  suitInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14,
    letterSpacing: 1.5,
    color: Brand.white,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

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

  saveButton: {
    backgroundColor: Brand.maroon,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 22,
  },
  saveButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 15, color: Brand.cream },
});
