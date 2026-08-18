// The challenge wizard — ONE component, TWO tables (M4).
//
// `personal={false}` is the club's New Challenge; `personal` is the private
// table ("play with friends"). The five steps, the drafts, the robot picker and
// the review are identical; what differs is exactly what SHOULD differ and
// nothing else:
//   · the invite directory — the club's members vs YOUR FRIENDS. Both lists
//     are resolved server-side from the caller's own identity (challenges/
//     people vs the friends API), so neither screen can name someone it has no
//     business naming, whatever this client renders;
//   · moderators — a private table has none (nobody to police; the creator can
//     already archive), so the chip never renders there;
//   · defaults — friends see standings from board one (a table between friends
//     is not an exam); clubs stay spoiler-safe;
//   · drafts — club drafts are the club's shared shelf; personal drafts are
//     the creator's own (?scope=personal) and never appear on any club list.
//
// QUICK CREATE IS THE SCREEN: how many boards, who's in, Create — everything
// else takes the default the advanced form would have given it. "Advanced
// settings" opens the platform's five steps — Basics, Boards, Table, Invites,
// Review — one step at a time, gated by the platform's challenge.advanced key
// exactly as the web wizard gates it.
//
// DRAFTS: a challenge being built can be parked ("Save draft") and picked up
// later by ANY of the club's challenge-creators — the rows are club-level on
// the platform and also appear on the web library's Challenges shelf. This
// screen re-opens one via ?draft=<entryId>; publishing promotes that same row
// rather than leaving a stale draft beside the challenge it became.
//
// Boards still travel as SEEDS (the server re-deals identical packs), but each
// board now carries its own dealer, vulnerability and seat, as on the web.
// Still deliberately not carried over: hand-editing packs and BBO import —
// those need the native deal editor wired per-board, a separate piece.

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
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

import { TabLoading } from "./tab-loading";
import { Brand, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { getFriends } from "../lib/friends";
import { BridgeApiError } from "../lib/bridge-api";
import {
  CHALLENGE_CONTROLS,
  controlOverridesOf,
  createChallenge,
  defaultControlStates,
  fetchChallengeDraft,
  fetchChallengePeople,
  MAX_BOARDS,
  MIN_BOARDS,
  saveChallengeDraft,
  type ChallengeBoardDraft,
  type ChallengeDraft,
  type ChallengeEngine,
  type ChallengeFormat,
  type ChallengePerson,
  type ChallengeScoring,
  type ControlState,
  type StandingsVisibility,
  type Vul,
} from "../lib/challenge-create";
import { useSelectedClubId } from "../lib/club-context";
import { PROGRAM_ID } from "../lib/config";
import type { Seat } from "../lib/plays";
import { useBridgeCan, useBridgeMe } from "../lib/use-bridge-can";

const FORMATS: { key: ChallengeFormat; label: string; note: string }[] = [
  { key: "full", label: "Bid & play", note: "The whole board, scored against the field." },
  {
    key: "bidding-only",
    label: "Bidding only",
    note: "The board ends with the auction — your contract beside the robot's.",
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

const ENGINES: { key: ChallengeEngine; label: string; note: string }[] = [
  {
    key: "dd",
    label: "Solver",
    note: "Plays a card in milliseconds and never misplays — a board takes seconds.",
  },
  {
    key: "ben",
    label: "BEN · neural",
    note: "Plays like a person, mistakes included — but takes seconds per card.",
  },
];

/** The standard dealer rotation: board 1 N, 2 E, 3 S, 4 W, repeating. */
const DEALER_CYCLE: Seat[] = ["N", "E", "S", "W"];
const SEAT_CYCLE: Seat[] = ["N", "E", "S", "W"];
/** undefined = the standard cycle for the board's position. */
const VUL_CYCLE: (Vul | undefined)[] = [undefined, "none", "ns", "ew", "both"];
const VUL_LABEL: Record<Vul, string> = { none: "None", ns: "NS", ew: "EW", both: "Both" };

const BOARD_PRESETS = [4, 8, 12, 16];
const DEFAULT_BOARDS = 4;

const STEPS = [
  { key: "basics", label: "Basics", num: "01" },
  { key: "boards", label: "Boards", num: "02" },
  { key: "controls", label: "Table", num: "03" },
  { key: "invites", label: "Invites", num: "04" },
  { key: "review", label: "Review", num: "05" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];
/** Quick create, or one page of the advanced form. */
type ViewKey = "quick" | StepKey;

const freshSeed = () => Math.floor(Math.random() * 100_000) + 1;

const makeBoard = (boardNo: number): ChallengeBoardDraft => ({
  boardNo,
  seed: freshSeed(),
  dealer: DEALER_CYCLE[(boardNo - 1) % 4]!,
  // The app's convention everywhere: the human sits South.
  humanSeat: "S",
});

/** Left blank, the challenge still needs a shelf name — the web's rule. */
const clubAutoTitle = () =>
  `Club challenge · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

export function ChallengeWizard({
  personal = false,
  topContent,
}: {
  /** A private table between friends, rather than a club challenge. */
  personal?: boolean;
  /** Rendered above Quick create — the host screen's blurb, lists, shelves. */
  topContent?: ReactNode;
}) {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;
  const params = useLocalSearchParams<{ draft?: string }>();
  const me = useBridgeMe();
  // Pre-gate, everyone had the whole form — the honest offline fallback.
  const canAdvanced = useBridgeCan("challenge.advanced", true);
  const benOffered = me?.engines?.ben === true;

  const [view, setView] = useState<ViewKey>("quick");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<ChallengeFormat>("full");
  const [scoring, setScoring] = useState<ChallengeScoring>("imps");
  // A table between friends is not an exam — everyone watches from board one.
  const [standings, setStandings] = useState<StandingsVisibility>(
    personal ? "always" : "after-finish",
  );
  const [engine, setEngine] = useState<ChallengeEngine>("dd");
  const [boards, setBoards] = useState<ChallengeBoardDraft[]>(() =>
    Array.from({ length: DEFAULT_BOARDS }, (_, i) => makeBoard(i + 1)),
  );
  const [controls, setControls] = useState<Record<string, ControlState>>(defaultControlStates);
  const [people, setPeople] = useState<ChallengePerson[] | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [moderators, setModerators] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The parked row this screen is working on: set by ?draft=…, by the first
  // save, and carried into create so publishing promotes the row in place.
  const [draftEntryId, setDraftEntryId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const loadedDraftRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      // THE DIRECTORY IS THE MODE. Friends for a private table, the club for a
      // club challenge — and in both cases the server resolves the list from
      // the caller's identity, so this screen cannot widen either one.
      const loading = personal
        ? getFriends(token).then(({ friends }) =>
            friends.map((f) => ({
              userId: f.profileId,
              name: f.name,
              ...(f.username ? { handle: `@${f.username}` } : {}),
            })),
          )
        : fetchChallengePeople(token, programId).then(({ people: list }) => list);
      loading
        .then((list) => !cancelled && setPeople(list))
        .catch((e) => {
          if (!cancelled) {
            setPeople([]);
            if (!personal && e instanceof BridgeApiError && e.status === 404) {
              setError("Creating challenges isn't part of your role in this club.");
            }
          }
        });
      return () => {
        cancelled = true;
      };
    }, [token, programId, personal]),
  );

  // PICKING PARKED WORK BACK UP. ?draft=<entryId> seeds every field from the
  // stored draft and opens the advanced form — that is where the work was
  // done, and dropping someone back on Quick create would hide it. Loaded
  // once per entryId; a re-focus must not stomp edits made since.
  useFocusEffect(
    useCallback(() => {
      const wanted = typeof params.draft === "string" ? params.draft : null;
      if (!token || !wanted || loadedDraftRef.current === wanted) return;
      loadedDraftRef.current = wanted;
      setDraftLoading(true);
      let cancelled = false;
      fetchChallengeDraft(token, programId, wanted)
        .then(({ entryId, draft }) => {
          if (cancelled) return;
          setDraftEntryId(entryId);
          setTitle(draft.title === "Untitled challenge" ? "" : draft.title);
          setDescription(draft.description ?? "");
          setFormat(draft.format ?? "full");
          setScoring(draft.scoring);
          setStandings(draft.standingsVisibility);
          setEngine(draft.engine === "ben" ? "ben" : "dd");
          if (draft.boards.length) setBoards(draft.boards);
          setControls({ ...defaultControlStates(), ...draft.controlOverrides });
          setInvited(new Set(draft.invites.map((i) => i.userId)));
          setModerators(new Set(draft.invites.filter((i) => i.moderator).map((i) => i.userId)));
          setView("basics");
        })
        .catch(() => {
          if (!cancelled) setError("That draft couldn't be opened — it may have been deleted.");
        })
        .finally(() => !cancelled && setDraftLoading(false));
      return () => {
        cancelled = true;
      };
    }, [token, programId, params.draft]),
  );

  const setBoardCount = (n: number) => {
    const count = Math.max(MIN_BOARDS, Math.min(MAX_BOARDS, n));
    setBoards((prev) =>
      count <= prev.length
        ? prev.slice(0, count)
        : [...prev, ...Array.from({ length: count - prev.length }, (_, i) => makeBoard(prev.length + i + 1))],
    );
  };

  const patchBoard = (boardNo: number, patch: Partial<ChallengeBoardDraft>) =>
    setBoards((prev) => prev.map((b) => (b.boardNo === boardNo ? { ...b, ...patch } : b)));

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

  /** Everyone currently in the club, or nobody — computed, never stored. */
  const everyoneIn =
    people !== null && people.length > 0 && people.every((p) => invited.has(p.userId));

  const toggleEveryone = () => {
    if (!people) return;
    if (everyoneIn) {
      setInvited(new Set());
      setModerators(new Set());
      return;
    }
    setInvited(new Set(people.map((p) => p.userId)));
  };

  const toggleModerator = (userId: string) => {
    if (!invited.has(userId)) return;
    const next = new Set(moderators);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setModerators(next);
  };

  const autoTitle = useCallback(() => {
    if (!personal) return clubAutoTitle();
    const picked = (people ?? []).filter((p) => invited.has(p.userId));
    if (picked.length === 1) return `Table with ${picked[0]!.name}`;
    if (picked.length > 1) return `Table with ${picked.length} friends`;
    return "Private table";
  }, [personal, people, invited]);
  const effectiveTitle = title.trim() || autoTitle();

  const draftOf = useCallback(
    (): ChallengeDraft => ({
      title: effectiveTitle,
      description: description.trim(),
      ...(format === "full" ? {} : { format }),
      scoring,
      standingsVisibility: standings,
      boards,
      controlOverrides: controlOverridesOf(controls),
      invites: [...invited].map((userId) => ({
        // No moderators at a private table: nobody to police, and the creator
        // can already archive it.
        userId,
        moderator: personal ? false : moderators.has(userId),
      })),
      editorBadge: false,
      ...(engine === "ben" ? { engine } : {}),
      ...(personal ? { personal: true } : {}),
    }),
    [effectiveTitle, description, format, scoring, standings, boards, controls, invited, moderators, engine, personal],
  );

  const saveDraft = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { entryId } = await saveChallengeDraft(
        token,
        programId,
        draftOf(),
        draftEntryId ?? undefined,
      );
      setDraftEntryId(entryId);
      setSavedAt(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(e instanceof BridgeApiError ? e.message : "Couldn't save the draft — try again.");
    } finally {
      setBusy(false);
    }
  }, [token, programId, busy, draftOf, draftEntryId]);

  const create = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { challengeId } = await createChallenge(
        token,
        programId,
        draftOf(),
        draftEntryId ?? undefined,
      );
      if (personal) router.replace({ pathname: "/challenge-info", params: { id: challengeId } });
      else router.replace("/club-challenges");
    } catch (e) {
      setError(e instanceof BridgeApiError ? e.message : "Couldn't create it — try again.");
      setBusy(false);
    }
  }, [token, programId, busy, draftOf, draftEntryId, personal]);

  const stepAt = STEPS.findIndex((s) => s.key === view);
  const prevStep = stepAt > 0 ? STEPS[stepAt - 1] : null;
  const nextStep = stepAt >= 0 && stepAt < STEPS.length - 1 ? STEPS[stepAt + 1] : null;

  const controlsSummary = useMemo(() => {
    const overrides = controlOverridesOf(controls);
    const n = Object.keys(overrides).length;
    return n === 0 ? "Table defaults" : `${n} control${n === 1 ? "" : "s"} overridden`;
  }, [controls]);

  const saveDraftButton = (
    <Pressable
      onPress={saveDraft}
      disabled={busy}
      style={({ pressed }) => [styles.draftButton, (busy || pressed) && { opacity: 0.6 }]}
    >
      <Text style={styles.draftButtonText}>
        {savedAt ? `Saved to drafts · ${savedAt}` : "Save draft"}
      </Text>
    </Pressable>
  );

  const invitesBlock = (
    <>
      <Text style={styles.fieldLabel}>{personal ? "WHO'S PLAYING" : "WHO'S IN"}</Text>
      <Text style={styles.hint}>
        {personal ? "You're in automatically." : "You're in automatically, as a moderator."}
      </Text>
      {people === null ? (
        <Text style={styles.emptyBox}>{personal ? "Finding your friends…" : "Finding your club…"}</Text>
      ) : people.length === 0 ? (
        <Text style={styles.emptyBox}>
          {personal
            ? "No friends yet — add some from the Friends screen first."
            : "Nobody else to invite in this club yet."}
        </Text>
      ) : (
        <>
          {/* A SNAPSHOT of today's members, not a standing rule. */}
          <Pressable
            onPress={toggleEveryone}
            style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: everyoneIn }}
            accessibilityLabel="Invite everyone in the club now"
          >
            <View style={[styles.checkbox, everyoneIn && styles.checkboxOn]}>
              {everyoneIn ? <Text style={styles.checkboxTick}>✓</Text> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.personName} numberOfLines={1}>
                Everyone in the club now
              </Text>
              <Text style={styles.personHandle} numberOfLines={1}>
                {people.length} {people.length === 1 ? "member" : "members"}
              </Text>
            </View>
          </Pressable>
          {people.map((p) => {
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
                {on && !personal && (
                  <Pressable onPress={() => toggleModerator(p.userId)} hitSlop={8}>
                    <Text style={[styles.modChip, mod && styles.modChipOn]}>
                      {mod ? "moderator ✓" : "make moderator"}
                    </Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </>
      )}
    </>
  );

  const boardCountBlock = (
    <>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => setBoardCount(boards.length - 1)}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
          accessibilityLabel="One board fewer"
        >
          <Text style={styles.stepButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>
          {boards.length} board{boards.length === 1 ? "" : "s"}
        </Text>
        <Pressable
          onPress={() => setBoardCount(boards.length + 1)}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
          accessibilityLabel="One board more"
        >
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
      </View>
      <View style={[styles.pickRow, { marginTop: 8 }]}>
        {BOARD_PRESETS.map((n) => (
          <Pressable
            key={n}
            onPress={() => setBoardCount(n)}
            style={[styles.pick, boards.length === n && styles.pickOn]}
          >
            <Text style={[styles.pickText, boards.length === n && styles.pickTextOn]}>{n}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  const createButton = (label: string) => (
    <Pressable
      onPress={create}
      disabled={busy}
      style={({ pressed }) => [styles.createButton, busy && { opacity: 0.4 }, pressed && { opacity: 0.75 }]}
    >
      <Text style={styles.createButtonText}>{busy ? "Creating…" : label}</Text>
    </Pressable>
  );

  return (
    <>
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

          {/* ── the advanced form's step chips ── */}
          {view !== "quick" && (
            <View style={styles.chipsRow}>
              {STEPS.map((s) => (
                <Pressable
                  key={s.key}
                  onPress={() => setView(s.key)}
                  style={[styles.stepChip, view === s.key && styles.stepChipOn]}
                >
                  <Text style={[styles.stepChipText, view === s.key && styles.stepChipTextOn]}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Quick create: the whole screen until Advanced opens ── */}
          {view === "quick" && (
            <>
              {topContent}
              <Text style={styles.quickNote}>
                {personal
                  ? "Pick the boards and the friends — everything else takes its default: bid & play, IMPs, solver robots, standings visible from board one."
                  : "Pick the boards and who's in — everything else takes its default: bid & play, IMPs, solver robots, spoiler-safe standings."}
              </Text>
              <Text style={styles.fieldLabel}>BOARDS</Text>
              {boardCountBlock}
              {invitesBlock}
              {createButton(personal ? "Create table" : "Create challenge")}
              {saveDraftButton}
              {canAdvanced && (
                <Pressable onPress={() => setView("basics")} hitSlop={8}>
                  <Text style={styles.advancedLink}>Advanced settings →</Text>
                </Pressable>
              )}
            </>
          )}

          {/* ── 01 · Basics ── */}
          {view === "basics" && (
            <>
              <Text style={styles.fieldLabel}>TITLE</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={autoTitle()}
                placeholderTextColor="rgba(31,31,31,0.35)"
                maxLength={120}
              />
              <Text style={styles.hint}>Left blank it&apos;s named for you.</Text>

              <Text style={styles.fieldLabel}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, { minHeight: 56 }]}
                value={description}
                onChangeText={setDescription}
                placeholder="A line players see before joining"
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

              <Text style={styles.fieldLabel}>ROBOT PLAYERS</Text>
              {ENGINES.map((e) => {
                const off = e.key === "ben" && !benOffered;
                return (
                  <OptionRow
                    key={e.key}
                    label={off ? `${e.label} — not available` : e.label}
                    note={off ? "This server has no BEN configured; the solver plays." : e.note}
                    on={engine === e.key}
                    disabled={off}
                    onPress={() => setEngine(e.key)}
                  />
                );
              })}

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
            </>
          )}

          {/* ── 02 · Boards ── */}
          {view === "boards" && (
            <>
              <Text style={styles.fieldLabel}>BOARDS</Text>
              {boardCountBlock}
              <Text style={styles.hint}>
                Fresh random deals, dealt the moment you create — everyone plays the same
                boards. Tap a board&apos;s chips to change its dealer, vulnerability or your
                seat.
              </Text>
              {boards.map((b) => (
                <View key={b.boardNo} style={styles.boardRow}>
                  <Text style={styles.boardNo}>Board {b.boardNo}</Text>
                  <View style={styles.boardChips}>
                    <CycleChip
                      label={`Dealer ${b.dealer}`}
                      onPress={() =>
                        patchBoard(b.boardNo, {
                          dealer: DEALER_CYCLE[(DEALER_CYCLE.indexOf(b.dealer) + 1) % 4]!,
                        })
                      }
                    />
                    <CycleChip
                      label={`Vul ${b.vul ? VUL_LABEL[b.vul] : "Standard"}`}
                      onPress={() =>
                        patchBoard(b.boardNo, {
                          vul: VUL_CYCLE[(VUL_CYCLE.indexOf(b.vul) + 1) % VUL_CYCLE.length],
                        })
                      }
                    />
                    <CycleChip
                      label={`You ${b.humanSeat}`}
                      onPress={() =>
                        patchBoard(b.boardNo, {
                          humanSeat: SEAT_CYCLE[(SEAT_CYCLE.indexOf(b.humanSeat) + 1) % 4]!,
                        })
                      }
                    />
                  </View>
                </View>
              ))}
            </>
          )}

          {/* ── 03 · Table controls ── */}
          {view === "controls" && (
            <>
              <Text style={styles.fieldLabel}>AT THE TABLE</Text>
              <Text style={styles.hint}>
                Leave a control on Default and each player&apos;s own access decides; Show or
                Hide forces it for everyone on every board.
              </Text>
              {CHALLENGE_CONTROLS.map((c) => {
                const st = controls[c.key] ?? "default";
                const next: ControlState =
                  st === "default" ? "show" : st === "show" ? "hide" : "default";
                return (
                  <View key={c.key} style={styles.controlRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.controlLabel}>{c.label}</Text>
                      <Text style={styles.controlSub}>{c.sub}</Text>
                    </View>
                    <Pressable
                      onPress={() => setControls((prev) => ({ ...prev, [c.key]: next }))}
                      style={[
                        styles.pick,
                        st === "show" && styles.pickOn,
                        st === "hide" && styles.pickHide,
                      ]}
                    >
                      <Text
                        style={[
                          styles.pickText,
                          (st === "show" || st === "hide") && styles.pickTextOn,
                        ]}
                      >
                        {st === "default" ? "Default" : st === "show" ? "Show" : "Hide"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </>
          )}

          {/* ── 04 · Invites ── */}
          {view === "invites" && invitesBlock}

          {/* ── 05 · Review ── */}
          {view === "review" && (
            <>
              <Text style={styles.fieldLabel}>REVIEW</Text>
              <ReviewLine k="Title" v={effectiveTitle} />
              <ReviewLine
                k="Format"
                v={FORMATS.find((f) => f.key === format)?.label ?? format}
              />
              {format === "full" && (
                <ReviewLine
                  k="Scoring"
                  v={SCORINGS.find((s) => s.key === scoring)?.label ?? scoring}
                />
              )}
              <ReviewLine k="Robots" v={engine === "ben" ? "BEN · neural" : "Solver"} />
              <ReviewLine
                k="Standings"
                v={STANDINGS.find((s) => s.key === standings)?.label ?? standings}
              />
              <ReviewLine k="Boards" v={String(boards.length)} />
              <ReviewLine k="Table" v={controlsSummary} />
              <ReviewLine k="Invited" v={`You + ${invited.size}`} />
              {createButton(personal ? "Create table" : "Create challenge")}
            </>
          )}

          {/* ── the advanced form's footer: the path through the steps ── */}
          {view !== "quick" && (
            <>
              <View style={styles.footerRow}>
                <Pressable
                  onPress={() => setView(prevStep ? prevStep.key : "quick")}
                  style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}
                >
                  <Text style={styles.footerButtonText}>
                    ← {prevStep ? prevStep.label : "Quick create"}
                  </Text>
                </Pressable>
                <Text style={styles.footerCount}>
                  {stepAt + 1} of {STEPS.length}
                </Text>
                {nextStep ? (
                  <Pressable
                    onPress={() => setView(nextStep.key)}
                    style={({ pressed }) => [styles.footerButton, styles.footerNext, pressed && styles.pressed]}
                  >
                    <Text style={[styles.footerButtonText, { color: Brand.white }]}>
                      {nextStep.label} →
                    </Text>
                  </Pressable>
                ) : (
                  <View style={{ width: 90 }} />
                )}
              </View>
              {saveDraftButton}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <TabLoading ready={(people !== null || error !== null) && !draftLoading} />
    </>
  );
}

function OptionRow({
  label,
  note,
  on,
  onPress,
  disabled,
}: {
  label: string;
  note: string;
  on: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.option,
        on && styles.optionOn,
        disabled && { opacity: 0.5 },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: disabled === true }}
    >
      <View style={[styles.radio, on && styles.radioOn]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.optionLabel, on && { color: Brand.white }]}>{label}</Text>
        <Text style={[styles.optionNote, on && { color: "rgba(255,244,215,0.8)" }]}>{note}</Text>
      </View>
    </Pressable>
  );
}

function CycleChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
      <Text style={styles.pickText}>{label}</Text>
    </Pressable>
  );
}

function ReviewLine({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.reviewLine}>
      <Text style={styles.reviewKey}>{k}</Text>
      <Text style={styles.reviewValue} numberOfLines={2}>
        {v}
      </Text>
    </View>
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
  quickNote: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 19,
    color: "#7b7466",
    marginTop: 14,
  },
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

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  stepChip: {
    borderWidth: 1,
    borderColor: "#d3ccbb",
    backgroundColor: Brand.white,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  stepChipOn: { borderColor: Brand.maroon, backgroundColor: Brand.maroon },
  stepChipText: { fontFamily: Fonts.bodySemibold, fontSize: 12, color: "#5e5749" },
  stepChipTextOn: { color: Brand.cream },

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
  pickHide: { borderColor: Brand.maroon, backgroundColor: Brand.maroon },
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

  boardRow: {
    backgroundColor: Brand.white,
    borderWidth: 1,
    borderColor: "#d3ccbb",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
  },
  boardNo: { fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.ink },
  boardChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },

  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Brand.white,
    borderWidth: 1,
    borderColor: "#d3ccbb",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
  },
  controlLabel: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.ink },
  controlSub: { fontFamily: Fonts.body, fontSize: 11.5, color: "#7b7466", marginTop: 1 },

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

  reviewLine: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    paddingVertical: 9,
  },
  reviewKey: { fontFamily: Fonts.body, fontSize: 12.5, color: "#7b7466", width: 84 },
  reviewValue: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.ink, flex: 1 },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
    paddingTop: 14,
  },
  footerButton: {
    borderWidth: 1,
    borderColor: "#d3ccbb",
    backgroundColor: Brand.white,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  footerNext: { backgroundColor: Brand.green, borderColor: Brand.green },
  footerButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.ink },
  footerCount: { fontFamily: Fonts.body, fontSize: 11.5, color: "#a49d8e" },

  createButton: {
    backgroundColor: Brand.maroon,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 24,
  },
  createButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 15, color: Brand.cream },

  draftButton: {
    borderWidth: 1,
    borderColor: "rgba(84,16,21,0.35)",
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 10,
  },
  draftButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.maroon },

  advancedLink: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    color: Brand.green,
    textAlign: "center",
    marginTop: 16,
    textDecorationLine: "underline",
  },

  pressed: { opacity: 0.8 },
});
