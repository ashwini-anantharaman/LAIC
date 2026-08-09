// Club — the club's front door (Figma 630:4732; members 630:4982).
//
// The club name and blurb stay put; a small "Members" pill on the same line
// opens the roster, and the back arrow in the chrome comes back. The pill fills
// green with a card behind it while you are on the roster, and is a plain ink
// outline while you are not.
//
//   Home     the latest challenge, then Practice Deal / Challenges / Feedback / Chat
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
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandChrome, CONTENT_TOP_GAP } from "../../components/brand-chrome";
import { BrandSheet } from "../../components/brand-sheet";
import {
  ChallengeCaption,
  ChallengeTile,
  SEED_CHALLENGES,
} from "../../components/challenge-tile";
import { PERSON_ROW, PersonRow } from "../../components/person-row";
import { Brand, Fonts, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { loadAvatars, loadClubHeader, subscribeToClubHeader } from "../../lib/avatar-store";
import { getRoleContext, primaryMembership } from "../../lib/bridge-role";
import { useCan } from "../../lib/use-can";
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
 * band running almost into "Latest Challenge"; cutting it close to the text puts
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
  const canChallenges = useCan("app.challenge.view", true);
  const canDeals = useCan("app.deal.view", true);
  const canMembers = useCan("app.club.members.view", true);

  const [view, setView] = useState<View2>("home");
  const [filter, setFilter] = useState<Filter>(ALL);
  /** Which roles the filter sheet has ticked; empty means "no filter". */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  // The club is the caller's own program — a partner club wins over the default.
  const [club, setClub] = useState<{ id: string; name: string; org: string } | null>(null);
  const [roster, setRoster] = useState<AppMemberRow[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  /** profile_id -> picture, for the faces on the roster. */
  const [avatars, setAvatars] = useState<Map<string, string | null>>(new Map());
  /** The club's banner, if its coaches have set one. */
  const [header, setHeader] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getRoleContext(token).then((ctx) => {
      const primary = primaryMembership(ctx);
      if (cancelled || !primary?.program_id) return;
      setClub({
        id: primary.program_id,
        name: primary.program_name ?? primary.org_name,
        org: primary.org_name,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

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
    if (checked.size > 0) return rows.filter((r) => checked.has(standingOf(r)));
    if (filter === ALL) return rows;
    return rows.filter((r) => standingOf(r) === filter);
  }, [roster, filter, checked]);

  const latest = SEED_CHALLENGES[SEED_CHALLENGES.length - 1]!;

  // A button its role cannot open is not dimmed but ABSENT: dimming says "not
  // now", and this is "not yours". The grid closes up around what is left.
  const buttons = [
    canDeals && {
      key: "deal",
      label: "Practice Deal",
      onPress: () => router.push("/practice-deals"),
      disabled: false,
    },
    canChallenges && {
      key: "challenges",
      label: "Challenges",
      onPress: () => router.push("/club-challenges"),
      disabled: false,
    },
    // Feedback is drawn but not built yet — dimmed so the grid still matches.
    { key: "feedback", label: "Feedback", onPress: () => {}, disabled: true },
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

  return (
    <BrandChrome
      onBack={onHome ? undefined : () => setView("home")}
      banner={header ? { uri: header, height: BANNER_DEPTH * s } : null}
    >
      {/* A light status bar reads over the banner; cream needs the dark one. */}
      <StatusBar style={onBanner ? "light" : "dark"} />
      <View style={styles.page}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { marginLeft: HEAD.left * s, color: headText }]}>
              {club?.name ?? "My Club"}
            </Text>
            <Text
              style={[
                styles.blurb,
                { marginLeft: HEAD.left * s, marginTop: HEAD.blurbGap * s, color: headText },
              ]}
            >
              {club && club.org !== club.name ? `Under ${club.org}` : " "}
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
              Latest Challenge
            </Text>

            <View style={{ marginTop: HOME.tileGap * s, alignSelf: "center" }}>
              <ChallengeTile
                size={HOME.tile * s}
                onPress={() => router.push("/club-challenges")}
              />
              <ChallengeCaption
                challenge={latest}
                width={HOME.tile * s}
                fontSize={13.633 * s}
                dot={5.029 * s}
                gap={8 * s}
                paddingTop={2 * s}
              />
            </View>

            <View
              style={[
                styles.grid,
                {
                  marginTop: HOME.buttonsTop * s,
                  height: (BTN.rowPitch + BTN.height + BTN.offset.y) * s,
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

            <Roster
              people={people}
              avatars={avatars}
              loading={roster == null && rosterError == null}
              error={rosterError}
              scale={s}
            />
          </View>
        )}
      </View>

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
    </BrandChrome>
  );
}

/** The roster list — every row states the person's standing on the right. */
function Roster({
  people,
  avatars,
  loading,
  error,
  scale: s,
}: {
  people: ProgramMemberRow[];
  avatars: Map<string, string | null>;
  loading: boolean;
  error: string | null;
  scale: number;
}) {
  if (error) return <Text style={styles.stateText}>{error}</Text>;
  if (loading) return <Text style={styles.stateText}>Loading the club roster…</Text>;
  if (people.length === 0) return <Text style={styles.stateText}>Nobody here yet.</Text>;

  return (
    <ScrollView
      style={styles.roster}
      contentContainerStyle={{ paddingLeft: 22 * s, paddingRight: 20 * s, paddingTop: 18 * s }}
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
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingBottom: TAB_BAR_CLEARANCE },
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
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
