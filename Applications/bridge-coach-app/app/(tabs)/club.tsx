// Club — the club's front door (Figma 630:4732; members 630:4982).
//
// The club name and blurb stay put; a home glyph and a small "Members" pill on
// the same line switch between the two views. Green means you are on it, dark
// grey means you are not — the pill fills green and gains a card behind it when
// active, and is a plain outline when not.
//
//   Home     the latest challenge, then Practice Deal / Challenges / Feedback / Chat
//   Members  the club roster, filtered by All Users / Learners / Coaches
//
// The roster is REAL: /api/programs/:id/members is readable by any member of the
// program, so a learner can see who else is in their club. The program is the
// caller's own (a partner club like Club 1), not the app-wide PROGRAM_ID — that
// constant points at the LAIC Bridge Program, which a Club 1 member is not in.
// Every row carries the person's standing on the right, so "All Users" needs no
// extra grouping to stay readable. Challenges are still placeholder content (the
// API has no clubs yet).

import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SvgXml } from "react-native-svg";

import { BrandChrome } from "../../components/brand-chrome";
import {
  ChallengeCaption,
  ChallengeTile,
  SEED_CHALLENGES,
} from "../../components/challenge-tile";
import { PERSON_ROW, PersonRow } from "../../components/person-row";
import { tintSvg } from "../../components/svg-tint";
import { ICON_HOME } from "../../constants/brand-vectors";
import { Brand, Fonts, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { getRoleContext, primaryMembership } from "../../lib/bridge-role";
import {
  fetchBridgeSummary,
  fetchProgramMembers,
  type ProgramMemberRow,
} from "../../lib/nexus";

const DESIGN_WIDTH = 390;

/** Header: title, blurb, and the two view switches on the title's line. */
const HEAD = {
  left: 25,
  blurbGap: 13,
  homeIcon: { w: 18.125, h: 20, right: 390 - 267 - 18.125, top: 8 },
};
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
type Filter = "all" | "learners" | "coaches";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All Users" },
  { key: "learners", label: "Learners" },
  { key: "coaches", label: "Coaches" },
];

/** Membership roles that make someone staff of the club rather than a learner. */
const STAFF_ROLES = new Set(["owner", "administrator", "instructor", "teacher", "coach"]);

const HOME_GREEN = tintSvg(ICON_HOME, Brand.green);
const HOME_GREY = tintSvg(ICON_HOME, Brand.iconDark);

function personName(row: ProgramMemberRow): string {
  return row.display_name?.trim() || row.username?.trim() || row.email?.trim() || "Member";
}

function isStaff(row: ProgramMemberRow): boolean {
  return STAFF_ROLES.has(row.membership_role.toLowerCase());
}

/** One switch or filter pill — green when you are on it, outlined when not. */
function Pill({
  label,
  active,
  onPress,
  scale: s,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
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
          },
        ]}
      >
        <Text
          style={[
            styles.pillLabel,
            { fontSize: PILL.font * s, color: active ? Brand.white : Brand.ink },
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
  const s = width / DESIGN_WIDTH;

  const [view, setView] = useState<View2>("home");
  const [filter, setFilter] = useState<Filter>("all");

  // The club is the caller's own program — a partner club wins over the default.
  const [club, setClub] = useState<{ id: string; name: string; org: string } | null>(null);
  const [roster, setRoster] = useState<ProgramMemberRow[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [dealEntryId, setDealEntryId] = useState<string | null>(null);

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
    fetchProgramMembers(token, club.id)
      .then((rows) => !cancelled && setRoster(rows))
      .catch(() => !cancelled && setRosterError("Couldn't load the club roster."));
    return () => {
      cancelled = true;
    };
  }, [token, club]);

  // The Practice Deal is one board a day; re-check on each visit.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      fetchBridgeSummary(token)
        .then((sum) => !cancelled && setDealEntryId(sum.deal_of_the_day?.entry_id ?? null))
        .catch(() => !cancelled && setDealEntryId(null));
      return () => {
        cancelled = true;
      };
    }, [token]),
  );

  const people = useMemo(() => {
    const rows = roster ?? [];
    if (filter === "learners") return rows.filter((r) => !isStaff(r));
    if (filter === "coaches") return rows.filter(isStaff);
    return rows;
  }, [roster, filter]);

  const latest = SEED_CHALLENGES[SEED_CHALLENGES.length - 1]!;

  const buttons = [
    {
      key: "deal",
      label: "Practice Deal",
      onPress: () =>
        dealEntryId &&
        router.push({ pathname: "/play-board/[entryId]", params: { entryId: dealEntryId } }),
      disabled: !dealEntryId,
    },
    {
      key: "challenges",
      label: "Challenges",
      onPress: () => router.push("/club-challenges"),
      disabled: false,
    },
    // Feedback is drawn but not built yet — dimmed so the grid still matches.
    { key: "feedback", label: "Feedback", onPress: () => {}, disabled: true },
    { key: "chat", label: "Chat", onPress: () => router.push("/club-chat"), disabled: false },
  ];

  const onHome = view === "home";

  return (
    <BrandChrome>
      <View style={styles.page}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { marginLeft: HEAD.left * s }]}>
              {club?.name ?? "My Club"}
            </Text>
            <Text style={[styles.blurb, { marginLeft: HEAD.left * s, marginTop: HEAD.blurbGap * s }]}>
              {club && club.org !== club.name ? `Under ${club.org}` : " "}
            </Text>
          </View>

          <Pressable
            onPress={() => setView("home")}
            hitSlop={14}
            accessibilityRole="tab"
            accessibilityState={{ selected: onHome }}
            accessibilityLabel="Club home"
            style={({ pressed }) => [
              { marginTop: HEAD.homeIcon.top * s, marginRight: 14 * s },
              pressed && styles.pressed,
            ]}
          >
            <SvgXml
              xml={onHome ? HOME_GREEN : HOME_GREY}
              width={HEAD.homeIcon.w * s}
              height={HEAD.homeIcon.h * s}
            />
          </Pressable>

          <View style={{ marginTop: (HEAD.homeIcon.top - 3) * s, marginRight: 24 * s }}>
            <Pill
              label="Members"
              active={!onHome}
              onPress={() => setView("members")}
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
            <View style={[styles.filterRow, { marginTop: FILTER.top * s, gap: (FILTER.pitch - PILL.width) * s }]}>
              {FILTERS.map((f) => (
                <Pill
                  key={f.key}
                  label={f.label}
                  active={filter === f.key}
                  onPress={() => setFilter(f.key)}
                  scale={s}
                />
              ))}
            </View>

            <Roster
              people={people}
              loading={roster == null && rosterError == null}
              error={rosterError}
              scale={s}
            />
          </View>
        )}
      </View>
    </BrandChrome>
  );
}

/** The roster list — every row states the person's standing on the right. */
function Roster({
  people,
  loading,
  error,
  scale: s,
}: {
  people: ProgramMemberRow[];
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
          standing={isStaff(p) ? "Coach" : "Learner"}
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
  pressed: { opacity: 0.75 },
});
