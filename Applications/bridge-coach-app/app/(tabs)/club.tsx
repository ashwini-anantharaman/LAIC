// Club — the club's front door (Figma 630:4732; members 630:4982).
//
// The club name and blurb stay put; a small "Members" pill on the same line
// opens the roster, and the back arrow in the chrome comes back. The pill fills
// green with a card behind it while you are on the roster, and is a plain ink
// outline while you are not.
//
//   Home     the pinned challenge cards, then Challenges / Chat
//   Members  the club roster, filtered by All Users / Members / Mentors
//
// The roster is REAL: /api/programs/:id/members is readable by any member of the
// program, so a learner can see who else is in their club. The program is the
// caller's own (a partner club like Club 1), not the app-wide PROGRAM_ID — that
// constant points at the LAIC Bridge Program, which a Club 1 member is not in.
// Every row carries the person's standing on the right, so "All Users" needs no
// extra grouping to stay readable. A club calls its two standings Members and
// Mentors; "learner" and "coach" remain the words the API and the role checks
// use, and the translation happens here at the edge. Challenges are still placeholder content (the
// API has no clubs yet).

import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActivityCarousel, type Activity } from "../../components/activity-carousel";
import { BackChevron, BrandChrome, CONTENT_TOP_GAP } from "../../components/brand-chrome";
import { BrandSheet } from "../../components/brand-sheet";
import { MyClubs } from "../../components/my-clubs";
import { PERSON_ROW, PersonRow } from "../../components/person-row";
import { Brand, Fonts, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { TabLoading } from "../../components/tab-loading";
import { useAuth } from "../../lib/auth-context";
import { loadAvatars, loadClubHeader, subscribeToClubHeader } from "../../lib/avatar-store";
import {
  fetchClubChallenges,
  pickPinned,
  type ClubChallenge,
} from "../../lib/challenges";
import { useClubs } from "../../lib/club-context";
import { useCan } from "../../lib/use-can";
import type { LearningObject } from "../../lib/nexus";
import {
  canAuthorLearning,
  getLearningContext,
  getLearningObjects,
  splitByOwner,
} from "../../lib/learning";
import {
  fetchAppMembers,
  fetchProgramMembers,
  type AppMemberRow,
  type ProgramMemberRow,
} from "../../lib/nexus";

const DESIGN_WIDTH = 390;

/** Header: title, blurb, and the Members pill on the title's line. */
const HEAD = { left: 25, blurbGap: 13, pillTop: 5, pillRight: 24 };
/**
 * How far a club's header image reaches below the safe area.
 *
 * It is the sum of what sits above its edge, not a round number: the top gap
 * (28) + the title's line (~34) + the gap to the blurb (13) + the blurb's line
 * (~22), and then 6 of air. It ended 24 below the blurb at first, which left the
 * band running almost into "Activities"; cutting it close to the text puts
 * that whitespace on the cream side of the edge, where it reads as breathing
 * room rather than as dead photograph.
 *
 * Measured rather than laid out because the image sits behind BrandChrome's gap
 * as well as the text — a wrapper around the text alone could not reach up
 * under the status bar.
 */
const BANNER_DEPTH = 103;
/**
 * Both switch pills share one size (58.5 x 27.4, radius 6.44). Active = a green
 * face with a darker card 3 down-and-right; inactive = a 1pt ink outline.
 */
const PILL = { width: 58.504, height: 27.374, radius: 6.441, font: 10.261, offset: 3 };
/** The three roster filters, centred as a row 71.5 apart. */
const FILTER = { top: 32, pitch: 71, font: 10.261 };
/** Home view, measured from the blurb. */
const HOME = { headingTop: 40, tile: 155.469, tileGap: 12, buttonsTop: 43 };
/** The 2x2 grid: 172 x 48 faces with a darker one behind at (+3, +5). */
const BTN = {
  width: 172,
  height: 48,
  radius: 12,
  offset: { x: 3, y: 5 },
  left: 16,
  columnPitch: 184,
  rowPitch: 70,
};

type View2 = "home" | "members";
/**
 * The roster's filter. "all" is the only fixed entry; every other value is the
 * NAME of a role a club has authored, because a club's roles are its own
 * ("Club Mentor", "Strange Mentor") rather than two fixed buckets.
 */
type Filter = string;
const ALL: Filter = "all";

/** Membership roles that make someone staff of the club — the label for anyone
 *  holding no app role yet, so the roster is never blank. */
const STAFF_ROLES = new Set(["owner", "administrator", "instructor", "teacher", "coach"]);
const FALLBACK_STANDING = { staff: "Mentor", learner: "Member" };

function personName(row: ProgramMemberRow): string {
  return row.display_name?.trim() || row.username?.trim() || row.email?.trim() || "Member";
}

function isStaff(row: ProgramMemberRow): boolean {
  return STAFF_ROLES.has(row.membership_role.toLowerCase());
}

/** What shows beside a person: the role they hold, else their standing. */
function standingOf(row: AppMemberRow): string {
  return (
    row.app_role_name?.trim() ||
    (isStaff(row) ? FALLBACK_STANDING.staff : FALLBACK_STANDING.learner)
  );
}

/** One switch or filter pill — green when you are on it, outlined when not. */
function Pill({
  label,
  active,
  onPress,
  /** Outline and label colour while inactive — white over a banner, else ink. */
  ink = Brand.ink,
  scale: s,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  ink?: string;
  scale: number;
}) {
  const w = PILL.width * s;
  const h = PILL.height * s;
  const r = PILL.radius * s;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        { width: w + PILL.offset * s, height: h + PILL.offset * s },
        pressed && styles.pressed,
      ]}
    >
      {active ? (
        <View
          style={{
            position: "absolute",
            left: PILL.offset * s,
            top: PILL.offset * s,
            width: w,
            height: h,
            borderRadius: r,
            backgroundColor: Brand.rowShadow,
          }}
        />
      ) : null}
      <View
        style={[
          styles.pillFace,
          {
            width: w,
            height: h,
            borderRadius: r,
            backgroundColor: active ? Brand.green : "transparent",
            borderWidth: active ? 0 : Math.max(1, 0.921 * s),
            borderColor: ink,
          },
        ]}
      >
        <Text
          style={[
            styles.pillLabel,
            { fontSize: PILL.font * s, color: active ? Brand.white : ink },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function ClubScreen() {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const s = width / DESIGN_WIDTH;

  // Each button is its own grant, so a role can have challenges without deals.
  const canChat = useCan("app.chat.view", true);
  // Creating a CHALLENGE is a club-app capability; creating CONTENT is a learning
  // one, from the Studio's own catalogue — two catalogues, so two questions.
  const canCreateChallenge = useCan("app.challenge.create", true);
  const [canAuthor, setCanAuthor] = useState(false);
  /** The club's OWN authored content, which the Activities row lists after the
   *  pinned challenges. The curriculum above the club is the Learn tab's, not this
   *  row's — a club's row is about the club. */
  const [clubContent, setClubContent] = useState<LearningObject[]>([]);
  /** Which "add" options to offer; null while closed. */
  const [addOpen, setAddOpen] = useState(false);
  const canChallenges = useCan("app.challenge.view", true);
  const canMembers = useCan("app.club.members.view", true);

  const [view, setView] = useState<View2>("home");
  const [filter, setFilter] = useState<Filter>(ALL);
  /** Which roles the filter sheet has ticked; empty means "no filter". */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  /** The roster search. Trimmed and lowercased where it is used, not here, so the
   *  field shows exactly what was typed. */
  const [query, setQuery] = useState("");

  // The club is whichever one is selected; My Clubs picks it when there are
  // several, and it is automatic when there is only one.
  const { clubs, selected, loading: clubsLoading, select, clearSelection, otherClub } = useClubs();
  // Memoised: it feeds effect dependencies, and a fresh object each render would
  // refetch the roster and the header on every paint.
  const club = useMemo(
    () =>
      selected
        ? { id: selected.programId, name: selected.name, org: selected.orgName }
        : null,
    [selected],
  );
  /** Open when there are 3+ clubs and the switcher is tapped. */
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [roster, setRoster] = useState<AppMemberRow[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  /** profile_id -> picture, for the faces on the roster. */
  const [avatars, setAvatars] = useState<Map<string, string | null>>(new Map());
  /** The club's banner, if its coaches have set one. */
  const [header, setHeader] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !club) return;
    let cancelled = false;
    setRosterError(null);
    // The app-aware roster carries each person's role name; if that endpoint is
    // not deployed yet, the plain member list still renders (without labels).
    fetchAppMembers(token, club.id)
      .catch(() => fetchProgramMembers(token, club.id) as Promise<AppMemberRow[]>)
      .then(async (rows) => {
        if (cancelled) return;
        setRoster(rows);
        // One request for the whole roster's faces, not one per row.
        const found = await loadAvatars(token, rows.map((r) => r.profile_id));
        if (!cancelled) setAvatars(new Map(found));
      })
      .catch(() => !cancelled && setRosterError("Couldn't load the club roster."));
    return () => {
      cancelled = true;
    };
  }, [token, club]);

  useEffect(() => {
    if (!token || !club) return;
    let cancelled = false;
    loadClubHeader(token, club.id).then((uri) => !cancelled && setHeader(uri));
    // A coach can set the banner from the Menu drawer while this tab is mounted.
    const stop = subscribeToClubHeader((id, uri) => {
      if (!cancelled && id === club.id) setHeader(uri);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [token, club]);

  /** Every role present in this club, in a stable order — the carousel. */
  const roleNames = useMemo(() => {
    const seen = new Set<string>();
    for (const r of roster ?? []) seen.add(standingOf(r));
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [roster]);

  const people = useMemo(() => {
    const rows = roster ?? [];
    // The checkbox filter wins when anything is ticked; otherwise the carousel's
    // single selection governs. Two ways to ask the same question, and the more
    // specific one is the one you just used.
    const byRole =
      checked.size > 0
        ? rows.filter((r) => checked.has(standingOf(r)))
        : filter === ALL
          ? rows
          : rows.filter((r) => standingOf(r) === filter);

    // Search NARROWS whatever the role filter left, rather than replacing it: the
    // two answer different questions ("which kind of person" and "which person"),
    // and a search that silently cleared the filter would explain neither result.
    // Alphabetical in EVERY view — All Users, a single role, a checkbox set, a search.
    // The API returns whatever order the join produced, which is stable but arbitrary,
    // so a roster you are scanning for one name had no order to scan by. Sorted here
    // rather than per filter so no view can be the exception.
    const byName = [...byRole].sort((a, b) =>
      personName(a).localeCompare(personName(b), undefined, { sensitivity: "base" }),
    );

    const q = query.trim().toLowerCase();
    if (!q) return byName;
    return byName.filter((r) =>
      // Name, email and role, because all three are on screen — searching for what
      // you can see and getting nothing is the failure to avoid. Email is included
      // even though the row shows only a name: it is how an admin knows two people
      // with the same name apart.
      [personName(r), r.email ?? "", standingOf(r)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [roster, filter, checked, query]);

  /**
   * The two challenges the carousel pins: the newest playable one, and the one this
   * viewer was last in the middle of. pickPinned decides which is which — see it for
   * why "latest" and "resume" are different questions.
   *
   * A failed read leaves both null: the cards still appear, uncaptioned, and fall
   * back to the app's own Challenges screen rather than captioning a tile with an
   * invention.
   */
  const [loaded, setPinned] = useState<{
    /** WHICH CLUB these two belong to. */
    clubId: string | null;
    latest: ClubChallenge | null;
    resume: ClubChallenge | null;
  }>({ clubId: null, latest: null, resume: null });

  /**
   * Only ever render cards belonging to the club on screen.
   *
   * This tab does not unmount on a club switch, so the previous club's cards used to
   * stay up — and because a failed read left them alone (the old comment claimed
   * otherwise), a club whose Bridge access is switched off showed the OTHER club's
   * challenge, which then failed to open. It read as scoping working when it was
   * really one club's data leaking into another's screen.
   *
   * Checking the owner here rather than clearing on switch means a stale club's cards
   * cannot render even for a frame, whatever order the effects run in.
   */
  const pinned =
    loaded.clubId && loaded.clubId === club?.id
      ? { latest: loaded.latest, resume: loaded.resume }
      : { latest: null, resume: null };

  const loadPinned = useCallback(() => {
    if (!token || !club) return () => {};
    const forClub = club.id;
    let cancelled = false;
    fetchClubChallenges(token, forClub)
      .then((rows) => {
        if (!cancelled) setPinned({ clubId: forClub, ...pickPinned(rows) });
      })
      .catch(() => {
        // The cards fall back to the app's own Challenges screen, which reports WHY
        // (see describeChallengesError) — better than a caption from another club.
        if (!cancelled) setPinned({ clubId: forClub, latest: null, resume: null });
      });
    return () => {
      cancelled = true;
    };
  }, [token, club]);

  useEffect(() => loadPinned(), [loadPinned]);

  /**
   * Re-read on every return to the tab.
   *
   * These two cards are decided from the challenge list, and that list changes
   * elsewhere: archiving happens on a challenge's info screen, a new one is created in
   * the platform's wizard, and finishing a board changes what "resume" means. Without
   * this the tab kept pinning a challenge that had just been retired.
   */
  useFocusEffect(useCallback(() => loadPinned(), [loadPinned]));

  /**
   * What the Activities carousel shows, in order.
   *
   * The first two slots are always challenges, and that is the point. One card said
   * "latest", so a person mid-way through an older challenge could not see a new one
   * — and once a new one arrived, could not get back to the game they had started.
   * Two cards answer both:
   *
   *   1. NEW CHALLENGE — the newest playable one, however far ahead of you it is.
   *   2. RESUME — the board you actually left, however far behind.
   *
   * The second is omitted when there is nothing to resume, or when it would be the
   * same challenge as the first. Everything else in the club's library lives on the
   * Challenges screen; these two are the entry points, not the index.
   *
   * Nothing else is pinned. A "Tutorial 1" card used to follow them, wired to one
   * hardcoded Content Studio object — it demonstrated the shape of a non-challenge
   * activity, but there is no flow behind it yet, and a card that opens the same fixed
   * page for every club is a prototype rather than a feature. Real activity types join
   * this list when they carry their own ids.
   */
// The club's own authored content, and whether this person may add more. Both
  // are per club, so both re-resolve on a club switch.
  useEffect(() => {
    if (!token || !club?.id) {
      setCanAuthor(false);
      setClubContent([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [ctx, objects] = await Promise.all([
        getLearningContext(token, club.id),
        getLearningObjects(token, { programId: club.id }).catch(() => []),
      ]);
      if (cancelled) return;
      setCanAuthor(canAuthorLearning(ctx));
      // Only the club's half: the parent's curriculum belongs to the Learn tab.
      setClubContent(splitByOwner(objects, club.id).club);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, club?.id]);

  const activities: Activity[] = [
    {
      id: "latest-challenge",
      kind: "challenge",
      // Uncaptioned until the summary answers; the tap then falls back to the app's
      // OWN Challenges screen — never the embed, whose entry page bounces an
      // unaccepted invite onto the platform's list (a screen the app never shows).
      title: pinned.latest?.name ?? "Challenge",
      ...(pinned.latest
        ? {
            detail: pinned.latest.inviteStatus === "pending"
              ? "Invited"
              : `${pinned.latest.boards} Boards`,
          }
        : {}),
      onPress: () =>
        pinned.latest
          ? router.push({ pathname: "/challenge-info", params: { id: pinned.latest.id } })
          : router.push("/club-challenges"),
    },
    ...(pinned.resume
      ? [
          {
            id: "resume-challenge",
            kind: "challenge" as const,
            title: "Resume",
            // Which challenge, and how far in — "Resume" alone would not say what
            // you are returning to.
            detail: `${pinned.resume.name} · ${pinned.resume.finishedBoards}/${pinned.resume.boards}`,
            onPress: () =>
              router.push({ pathname: "/challenge-info", params: { id: pinned.resume!.id } }),
          },
        ]
      : []),
    // The club's OWN content, after the pinned pair. Deliberately after: those two
    // boxes exist so a new challenge and one you are mid-way through are always
    // both visible, and content filling the front of the row would push the thing
    // you were doing out of sight — the exact problem the pinning solved.
    ...clubContent.map((o) => ({
      id: `content-${o.id}`,
      kind: "document" as const,
      title: o.title,
      ...(o.estimated_time ? { detail: o.estimated_time } : {}),
      onPress: () => router.push({ pathname: "/learn-object/[id]", params: { id: o.id } }),
    })),
  ];

  /**
   * Two buttons, one row: Challenges on the left, Chat on the right.
   *
   * Practice Deal and Feedback are gone rather than dimmed. Dimming was the honest
   * treatment while they were coming; a row of two live buttons and two that never do
   * anything is just a smaller promise repeated twice. Practice Deal's screen and route
   * are untouched — restoring it is an entry in this list.
   *
   * A button its role cannot open is ABSENT, not dimmed: dimming says "not now", and
   * this is "not yours". The row closes up around what is left, so a member without
   * chat sees one button rather than a gap.
   */
  const buttons = [
    canChallenges && {
      key: "challenges",
      label: "Challenges",
      onPress: () => router.push("/club-challenges"),
      disabled: false,
    },
    canChat && {
      key: "chat",
      label: "Chat",
      onPress: () => router.push("/club-chat"),
      disabled: false,
    },
  ].filter(Boolean) as { key: string; label: string; onPress: () => void; disabled: boolean }[];

  const onHome = view === "home";
  // Over a photograph the ink text and the ink outline both disappear.
  const onBanner = header != null;
  const headText = onBanner ? Brand.white : Brand.ink;

  // More than one club and none chosen yet: pick first. The tab bar stays, so
  // Play and Learn are still reachable without choosing.
  if (!clubsLoading && !selected && clubs.length > 1) {
    return (
      <BrandChrome>
        <MyClubs clubs={clubs} onPick={select} scale={s} />
        {/* Clubs are already known here — the veil is just the entrance fade. */}
        <TabLoading ready />
      </BrandChrome>
    );
  }

  return (
    <BrandChrome banner={header ? { uri: header, height: BANNER_DEPTH * s } : null}>
      {/* A light status bar reads over the banner; cream needs the dark one. */}
      <StatusBar style={onBanner ? "light" : "dark"} />
      <View style={styles.page}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={[styles.titleRow, { marginLeft: HEAD.left * s }]}>
              {/* Members view only — Home is the tab's root, nothing to go back to. */}
              {onHome ? null : (
                <BackChevron
                  onPress={() => setView("home")}
                  color={headText}
                  style={{ marginRight: 8 * s }}
                />
              )}
              <Text style={[styles.title, { color: headText }]} numberOfLines={1}>
                {club?.name ?? "Club"}
              </Text>
              {/* Only meaningful with somewhere to switch TO. Two clubs toggle
                  straight over; three or more open the list. */}
              {clubs.length > 1 ? (
                <Pressable
                  onPress={() => {
                    if (otherClub) select(otherClub.programId);
                    else setSwitcherOpen(true);
                  }}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={
                    otherClub ? `Switch to ${otherClub.name}` : "Switch club"
                  }
                  style={({ pressed }) => [
                    { marginLeft: 10 * s },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="swap-horizontal" size={20 * s} color={headText} />
                </Pressable>
              ) : null}
            </View>
            <Text
              style={[
                styles.blurb,
                { marginLeft: HEAD.left * s, marginTop: HEAD.blurbGap * s, color: headText },
              ]}
            >
              {/* The organisation's name on its own. It read "Under Life in AI Center"
                  before — the preposition added nothing a reader needed, and the line
                  is a label rather than a sentence. Still suppressed when the club and
                  the org share a name, where it would just repeat the title, and the
                  space keeps the header's height fixed either way. */}
              {club && club.org !== club.name ? club.org : " "}
            </Text>
          </View>

          <View
            style={{
              marginTop: HEAD.pillTop * s,
              marginRight: HEAD.pillRight * s,
              opacity: canMembers ? 1 : 0,
            }}
            pointerEvents={canMembers ? "auto" : "none"}
          >
            <Pill
              label="Members"
              active={!onHome}
              onPress={() => setView(onHome ? "members" : "home")}
              ink={headText}
              scale={s}
            />
          </View>
        </View>

        {onHome ? (
          <View style={styles.body}>
            <Text style={[styles.heading, { marginTop: HOME.headingTop * s }]}>
              Activities
            </Text>

            <View style={{ marginTop: HOME.tileGap * s }}>
              <ActivityCarousel
                activities={activities}
                scale={s}
                // No + at all for someone who may create neither: an inert button
                // that opens an empty sheet is worse than no button.
                {...(canCreateChallenge || canAuthor ? { onAdd: () => setAddOpen(true) } : {})}
              />
            </View>

            <View
              style={[
                styles.grid,
                {
                  marginTop: HOME.buttonsTop * s,
                  // Derived from the buttons present, not fixed at two rows: with a
                  // single row the old height left a button's worth of dead space
                  // between the grid and whatever follows.
                  height:
                    (Math.max(0, Math.ceil(buttons.length / 2) - 1) * BTN.rowPitch +
                      BTN.height +
                      BTN.offset.y) *
                    s,
                },
              ]}
            >
              {buttons.map((b, i) => (
                <Pressable
                  key={b.key}
                  onPress={b.onPress}
                  disabled={b.disabled}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: b.disabled }}
                  style={({ pressed }) => [
                    {
                      position: "absolute",
                      left: BTN.left * s + (i % 2) * BTN.columnPitch * s,
                      top: Math.floor(i / 2) * BTN.rowPitch * s,
                      width: (BTN.width + BTN.offset.x) * s,
                      height: (BTN.height + BTN.offset.y) * s,
                      opacity: b.disabled ? 0.45 : 1,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.btnShadow,
                      {
                        left: BTN.offset.x * s,
                        top: BTN.offset.y * s,
                        width: BTN.width * s,
                        height: BTN.height * s,
                        borderRadius: BTN.radius * s,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.btnFace,
                      { width: BTN.width * s, height: BTN.height * s, borderRadius: BTN.radius * s },
                    ]}
                  >
                    <Text
                      style={[styles.btnLabel, { fontSize: Type.sectionHeading * s }]}
                      numberOfLines={1}
                    >
                      {b.label}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.body}>
            {/* All Users, then one pill per role the club actually has. It
                SCROLLS: a club may author a dozen roles, and three fixed pills
                could not hold them. */}
            <View style={[styles.filterBar, { marginTop: FILTER.top * s }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0 }}
                contentContainerStyle={{
                  gap: (FILTER.pitch - PILL.width) * s,
                  paddingHorizontal: 12 * s,
                  alignItems: "center",
                }}
              >
                <Pill
                  label="All Users"
                  active={checked.size === 0 && filter === ALL}
                  onPress={() => {
                    setFilter(ALL);
                    setChecked(new Set());
                  }}
                  scale={s}
                />
                {roleNames.map((name) => (
                  <Pill
                    key={name}
                    label={name}
                    active={checked.size === 0 && filter === name}
                    onPress={() => {
                      setFilter(name);
                      setChecked(new Set());
                    }}
                    scale={s}
                  />
                ))}
              </ScrollView>

              {/* Tick several roles at once — the carousel picks exactly one. */}
              <Pressable
                onPress={() => setFilterOpen(true)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={
                  checked.size ? `Filter roles (${checked.size} selected)` : "Filter roles"
                }
                style={({ pressed }) => [
                  styles.filterButton,
                  {
                    width: PILL.height * s,
                    height: PILL.height * s,
                    borderRadius: PILL.radius * s,
                    marginRight: 14 * s,
                    backgroundColor: checked.size ? Brand.green : "transparent",
                    borderWidth: checked.size ? 0 : Math.max(1, 0.921 * s),
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="funnel-outline"
                  size={14 * s}
                  color={checked.size ? Brand.white : Brand.ink}
                />
              </Pressable>
            </View>

            {/* Search sits BELOW the role pills and above the list: it narrows what
                the pills selected, and reading top-to-bottom is the order the two
                are applied in. */}
            <View style={[styles.searchRow, { marginTop: 12 * s }]}>
              <Ionicons name="search-outline" size={15 * s} color={Brand.ink} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search members"
                placeholderTextColor="rgba(31,31,31,0.45)"
                style={[styles.searchInput, { fontSize: Type.clubDetail * s }]}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                // The list updates as you type, so the keyboard's Search key has
                // nothing left to do but dismiss it.
                onSubmitEditing={() => {}}
                clearButtonMode="while-editing"
                accessibilityLabel="Search members"
              />
              {/* Android has no clearButtonMode, so the clear is explicit — and on
                  both platforms it only exists when there is something to clear. */}
              {query.length > 0 ? (
                <Pressable
                  onPress={() => setQuery("")}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close-circle" size={15 * s} color="rgba(31,31,31,0.45)" />
                </Pressable>
              ) : null}
            </View>

            <Roster
              people={people}
              avatars={avatars}
              searching={query.trim().length > 0}
              loading={roster == null && rosterError == null}
              error={rosterError}
              scale={s}
            />
          </View>
        )}
      </View>

      {/* Three or more clubs: choose from the list rather than cycling. */}
      {/* What this person may ADD here. Each entry is its own capability, from its
          own catalogue — a club can be allowed to run challenges but not author
          content, or the reverse — so the sheet lists what is actually available
          rather than dimming what is not. */}
      <BrandSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add to Activities"
        top={insets.top + CONTENT_TOP_GAP}
      >
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {canCreateChallenge ? (
            <Pressable
              onPress={() => {
                setAddOpen(false);
                router.push("/challenge-new");
              }}
              accessibilityRole="button"
              accessibilityLabel="New challenge"
              style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
            >
              <Ionicons name="trophy-outline" size={20} color={Brand.cream} />
              <Text style={styles.checkLabel}>Challenge</Text>
            </Pressable>
          ) : null}
          {canAuthor ? (
            <Pressable
              onPress={() => {
                setAddOpen(false);
                router.push("/studio");
              }}
              accessibilityRole="button"
              accessibilityLabel="New content in the Content Studio"
              style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
            >
              <Ionicons name="document-text-outline" size={20} color={Brand.cream} />
              <Text style={styles.checkLabel}>Tutorial or other content</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </BrandSheet>

      <BrandSheet
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        title="Switch club"
        top={insets.top + CONTENT_TOP_GAP}
      >
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {clubs.map((c) => (
            <Pressable
              key={c.programId}
              onPress={() => {
                select(c.programId);
                setSwitcherOpen(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: c.programId === selected?.programId }}
              style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
            >
              <Ionicons
                name={c.programId === selected?.programId ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={Brand.cream}
              />
              <Text style={styles.checkLabel}>{c.name}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              clearSelection();
              setSwitcherOpen(false);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.clearRow, pressed && styles.pressed]}
          >
            <Text style={styles.clearText}>Back to My Clubs</Text>
          </Pressable>
        </ScrollView>
      </BrandSheet>

      {/* Tick the roles to show. Nothing ticked = no filter, and the carousel's
          single selection governs instead. */}
      <BrandSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter by role"
        top={insets.top + CONTENT_TOP_GAP}
      >
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {roleNames.length === 0 ? (
            <Text style={styles.sheetEmpty}>No roles in this club yet.</Text>
          ) : (
            roleNames.map((name) => {
              const on = checked.has(name);
              return (
                <Pressable
                  key={name}
                  onPress={() => {
                    const next = new Set(checked);
                    if (on) next.delete(name);
                    else next.add(name);
                    setChecked(next);
                    setFilter(ALL);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
                >
                  <Ionicons
                    name={on ? "checkbox" : "square-outline"}
                    size={20}
                    color={Brand.cream}
                  />
                  <Text style={styles.checkLabel}>{name}</Text>
                  <Text style={styles.checkCount}>
                    {(roster ?? []).filter((r) => standingOf(r) === name).length}
                  </Text>
                </Pressable>
              );
            })
          )}

          {checked.size > 0 ? (
            <Pressable
              onPress={() => setChecked(new Set())}
              accessibilityRole="button"
              style={({ pressed }) => [styles.clearRow, pressed && styles.pressed]}
            >
              <Text style={styles.clearText}>Clear filter</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </BrandSheet>

      {/* Ready once the clubs context has resolved which club this is —
          the banner and title arrive together instead of correcting. */}
      <TabLoading ready={!clubsLoading} />
    </BrandChrome>
  );
}

/** The roster list — every row states the person's standing on the right. */
/**
 * The A–Z index down the right edge of the roster.
 *
 * Tapping a letter jumps to the first person under it. Worth having because the list
 * is now alphabetical AND can run to a club's whole membership — an index is only
 * meaningful over a sorted list, which is why this arrives with the sort and not before.
 *
 * "#" collects everything that does not start with a letter (a name beginning with a
 * digit, a symbol, or an email standing in for a missing name), so every row is
 * reachable from the strip rather than most of them.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const INDEX_STRIP = { width: 16, font: 9.5, gap: 1.5, right: 3 };

/** Which bucket a name belongs to: its first letter, or "#". */
function bucketOf(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}

function IndexStrip({
  people,
  onJump,
  scale: s,
}: {
  people: ProgramMemberRow[];
  /** The row index to scroll to. */
  onJump: (index: number) => void;
  scale: number;
}) {
  // First row per bucket. Built from the LIST as displayed, so it follows the current
  // filter and search rather than the whole club.
  const firstIndex = new Map<string, number>();
  people.forEach((p, i) => {
    const b = bucketOf(personName(p));
    if (!firstIndex.has(b)) firstIndex.set(b, i);
  });

  return (
    <View style={[styles.indexStrip, { width: INDEX_STRIP.width * s, right: INDEX_STRIP.right * s }]}>
      {[...ALPHABET, "#"].map((letter) => {
        const target = firstIndex.get(letter);
        const present = target !== undefined;
        return (
          <Pressable
            key={letter}
            disabled={!present}
            onPress={() => present && onJump(target)}
            hitSlop={{ left: 8, right: 8, top: 2, bottom: 2 }}
            accessibilityRole="button"
            accessibilityLabel={present ? `Jump to ${letter}` : `${letter}, nobody`}
          >
            <Text
              style={[
                styles.indexLetter,
                {
                  fontSize: INDEX_STRIP.font * s,
                  marginVertical: INDEX_STRIP.gap * s,
                  // A letter nobody is filed under is shown but quiet: hiding it would
                  // make the strip's length change as you filter, and a moving index is
                  // harder to aim at than a dim one.
                  opacity: present ? 1 : 0.28,
                },
              ]}
            >
              {letter}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Roster({
  people,
  avatars,
  loading,
  searching,
  error,
  scale: s,
}: {
  people: ProgramMemberRow[];
  avatars: Map<string, string | null>;
  loading: boolean;
  /** True when a search is narrowing the list — changes what "empty" means. */
  searching: boolean;
  error: string | null;
  scale: number;
}) {
  const list = useRef<ScrollView>(null);
  /**
   * Rows are a uniform pitch, so a row's offset is exact arithmetic rather than a
   * measured guess — index * pitch, less the list's own top padding so the row lands
   * at the top edge instead of just below it.
   */
  const jumpTo = (index: number) =>
    list.current?.scrollTo({ y: Math.max(0, index * PERSON_ROW.pitch * s), animated: true });

  if (error) return <Text style={styles.stateText}>{error}</Text>;
  if (loading) return <Text style={styles.stateText}>Loading the club roster…</Text>;
  // An empty list means two different things now, and saying the wrong one is a
  // small lie: "nobody here yet" about a full club that simply has no match for
  // what was typed would read as the roster having failed to load.
  if (people.length === 0) {
    return (
      <Text style={styles.stateText}>
        {searching ? "Nobody matches that search." : "Nobody here yet."}
      </Text>
    );
  }

  return (
    <View style={styles.rosterWrap}>
    <ScrollView
      ref={list}
      style={styles.roster}
      contentContainerStyle={{
        paddingLeft: 22 * s,
        // Room for the index strip, so a long name never runs under the letters.
        paddingRight: (20 + INDEX_STRIP.width) * s,
        paddingTop: 18 * s,
      }}
      showsVerticalScrollIndicator={false}
    >
      {people.map((p, i) => (
        <PersonRow
          key={p.membership_id ?? p.invitation_id ?? `${p.email}-${i}`}
          name={personName(p)}
          standing={standingOf(p)}
          avatar={p.profile_id ? avatars.get(p.profile_id) : null}
          scale={s}
        />
      ))}
      <View style={{ height: PERSON_ROW.pitch * s }} />
    </ScrollView>

    <IndexStrip people={people} onJump={jumpTo} scale={s} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingBottom: TAB_BAR_CLEARANCE },
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  titleRow: { flexDirection: "row", alignItems: "center" },
  title: { fontFamily: Fonts.display, fontSize: Type.screenTitle, color: Brand.ink },
  blurb: { fontFamily: Fonts.body, fontSize: Type.clubDetail, color: Brand.ink },
  pillFace: {
    position: "absolute",
    left: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
    borderColor: Brand.ink,
  },
  pillLabel: { fontFamily: Fonts.displayMedium },
  body: { flex: 1 },
  filterRow: { flexDirection: "row", justifyContent: "center" },
  /** An outlined field on cream, matching the inactive filter pills rather than the
   *  green-on-maroon inputs the sheets use — this sits on the page, not in a sheet. */
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(31,31,31,0.28)",
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    color: Brand.ink,
    // The platform's own padding would make the row taller than its border.
    padding: 0,
  },
  filterBar: { flexDirection: "row", alignItems: "center" },
  filterButton: { alignItems: "center", justifyContent: "center", borderColor: Brand.ink },
  heading: {
    fontFamily: Fonts.displayMedium,
    fontSize: Type.sectionHeading,
    color: Brand.ink,
    textAlign: "center",
  },
  grid: { position: "relative" },
  btnShadow: { position: "absolute", backgroundColor: Brand.rowShadow },
  btnFace: {
    position: "absolute",
    left: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.green,
  },
  btnLabel: { fontFamily: Fonts.displayMedium, color: Brand.white },
  rosterWrap: { flex: 1, position: "relative" },
  /** Down the right edge, over the list, centred vertically. */
  indexStrip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  indexLetter: {
    fontFamily: Fonts.heading,
    color: Brand.green,
    textAlign: "center",
  },
  roster: { flex: 1 },
  stateText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: "rgba(31,31,31,0.55)",
    textAlign: "center",
    paddingTop: 40,
    paddingHorizontal: 24,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,244,215,0.14)",
  },
  checkLabel: { flex: 1, fontFamily: Fonts.body, fontSize: 15, color: Brand.cream },
  checkCount: { fontFamily: Fonts.body, fontSize: 14, color: "rgba(255,244,215,0.6)" },
  clearRow: { paddingVertical: 18, paddingHorizontal: 22 },
  clearText: { fontFamily: Fonts.bodySemibold, fontSize: 14, color: Brand.cream, opacity: 0.85 },
  sheetEmpty: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: "rgba(255,244,215,0.7)",
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  pressed: { opacity: 0.75 },
});
