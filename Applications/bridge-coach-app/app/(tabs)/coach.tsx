// Coach — the relationship tab, role-aware like Home. A learner sees who
// coaches them and the state of their feedback; a coach sees who needs them.
// Both are launchers into the platform surfaces that already exist.
//
// The LEARNER view is Figma 869:597: "My Coaches" as a row of faces with a green
// + Hire at its end, then two stacked-card tiles — Assignments from Coach, and
// Feedback. It used to be one card stack, four to six rows of title-and-subtitle
// that all looked alike; the faces are what make "who coaches me" answerable at
// a glance, and the two tiles are the only two places anyone actually goes.
//
// The COACH view is Figma 870:699: one wide My Learners tile, then Assignments
// and Reviews side by side, on the same stacked-card idiom. Both of the small
// tiles carry a cream disc on the corner, and the two discs are DIFFERENT KINDS
// of thing — Reviews' is a count (how many plays are waiting) and Assignments' is
// a BUTTON (a + that deals a new one). The + is its own tap target, so the tile
// still opens the list; it is where the "+ Create Assignment" pill used to be.
//
// TWO DELIBERATE DEPARTURES FROM THE FRAMES:
//   - No top app bar. The frame draws the hamburger-and-avatar bar every frame in
//     this file draws, but the app puts that bar on HOME ALONE (see brand-chrome)
//     and every other tab starts at CONTENT_TOP_GAP. Following the frame here
//     would give one tab chrome its four siblings do not have.
//   - Counts survive as small discs. The frame has none, and the stack it replaces
//     said "3 games awaiting review" in words. Dropping the number to match the
//     picture would cost the learner the one fact the screen is checked for, so it
//     is kept as a badge rather than a line of prose.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SvgXml } from "react-native-svg";

import { CONTENT_TOP_GAP } from "../../components/brand-chrome";
import { tintSvg } from "../../components/svg-tint";
import {
  ICON_AVATAR,
  ICON_COACH_ASSIGNMENTS,
  ICON_FEEDBACK_BUBBLE,
  ICON_GRAD_CAP,
  ICON_PLUS,
  ICON_PLUS_CIRCLE,
  ICON_REVIEWS_DOC,
} from "../../constants/brand-vectors";
import { Screen } from "../../components/ui";
import { Brand, Fonts, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { TabLoading } from "../../components/tab-loading";
import { getBridgeContextCached, isCoach, peekRoleContext } from "../../lib/bridge-role";
import { peekBridgeOrigin } from "../../lib/launch-cache";
import { type BridgeSummary, type SummaryCoach } from "../../lib/nexus";
import { prewarmBridgePages } from "../../lib/prewarm";
import { peekSummary, refreshSummary } from "../../lib/summary-cache";
import { useClubs } from "../../lib/club-context";

const DESIGN_WIDTH = 390;

/**
 * The learner view's measurements (Figma 869:597), in the 390-wide design space.
 *
 * Vertical values are GAPS between blocks rather than the frame's absolute tops,
 * because the frame's y=107 title includes a 54pt app bar this app does not draw —
 * absolute tops would push everything a bar's height too low.
 */
const CO = {
  /** "Coach" title to "My Coaches". */
  headingGap: 30,
  /** "My Coaches" to the row of faces. */
  rowGap: 18,
  avatar: 41.388,
  /** The frame's first face sits at x=25, two units left of the text — the glyph
   *  carries a little air the type does not. */
  rowLeft: 25,
  /** Face left to face left: 25 → 86.4 → 146.1. */
  pitch: 60.55,
  nameGap: 2,
  nameSize: 13.041,
  /** Faces to the tiles. */
  tilesGap: 35,
  tile: {
    width: 143,
    height: 71,
    radius: 20,
    /** The darker card behind, down and to the right (33/305 face, 38/308 shadow). */
    offset: { x: 5, y: 3 },
    left: 33,
    pitch: 174,
  },
  tileLabelGap: 9,
  tileLabelSize: 12.826,
  /** Each glyph at its own export's proportions, so neither is stretched. */
  glyph: { assignments: { w: 43, h: 40.85 }, feedback: { w: 39, h: 39 } },
  /** The + inside the Hire circle, and the circle itself. */
  plus: 13.796,
};

/**
 * The coach's view (Figma 870:699), in the same 390-wide design space.
 *
 * Both rows are the stacked-card idiom: a `Brand.rowShadow` card behind and below
 * a green face. The wide tile's shadow drops 6 and the small pair's 4, which is
 * the frame's own difference and reads as the bigger card sitting higher.
 */
const CV = {
  /** "Coach" title to the wide tile. */
  headGap: 49,
  /** The wide tile's box ends at its SHADOW (293 in the frame, not the face's
   *  287); from there to the pair's face top at 326. */
  rowGap: 33,
  wide: {
    width: 219,
    height: 100,
    radius: 20,
    offset: { x: 5, y: 6 },
    left: 81,
    /** The cap sits left of the label rather than above it — the only tile here
     *  laid out as a row. */
    glyph: { w: 41, h: 39.51, left: 24 },
    labelLeft: 83,
    labelSize: 20.288,
  },
  tile: {
    width: 143,
    height: 100,
    radius: 20,
    offset: { x: 5, y: 4 },
    left: 33,
    /** 205 − 33. */
    pitch: 172,
    glyphTop: 19,
    labelTop: 64,
    labelSize: 18.4,
  },
  glyph: { assignments: { w: 43, h: 40.85 }, reviews: { w: 35, h: 40.38 } },
  /**
   * The disc on a tile's top-right corner, overhanging on both sides.
   *
   * One set of numbers for both, though the frame draws them a unit or two apart
   * (23 vs 25 across, −10 vs −12 up): they sit side by side at the same height,
   * and two corners that nearly match read as a mistake where two that match read
   * as a pair.
   */
  badge: { size: 24, right: -5.5, top: -11, textSize: 16.09 },
};

export default function CoachScreen() {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  // `sc`, not `s` — `s` is this file's long-standing name for the summary.
  const sc = width / DESIGN_WIDTH;
  // The selected club scopes every bridge read here (null = app-wide). While
  // clubs are LOADING the scope is unknown, so the effects below fetch nothing
  // yet: firing early asked about the app-wide program, a guaranteed 403 for a
  // club-only account, paid in full before the real fetch could start.
  const { selected, loading: clubsLoading } = useClubs();
  const clubId = selected?.programId ?? null;
  // Role UNKNOWN (null) until the context resolves. Seeding a boolean painted
  // the learner view over a coach's first sign-in (peek misses on a cold
  // cache, isCoach(null) is false) and then flipped it to the coach view in
  // front of them — NEITHER view may claim the screen until we know which one
  // is true. The sign-in prime usually answers the peek synchronously, so the
  // known case still paints the real view with no fetch in front.
  const [coach, setCoach] = useState<boolean | null>(() => {
    const peeked = token ? peekRoleContext(token, clubId ?? undefined) : null;
    return peeked ? isCoach(peeked) : null;
  });
  // Last known summary renders immediately; the focus effect refreshes it.
  const [summary, setSummary] = useState<BridgeSummary | null>(() =>
    token ? peekSummary(token, clubId ?? undefined) : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!token || clubsLoading) return;
    // Re-seed on a club switch: this club's role may be cached (answer now) or
    // not (back to unknown — never the previous club's answer).
    const peeked = peekRoleContext(token, clubId ?? undefined);
    setCoach(peeked ? isCoach(peeked) : null);
    getBridgeContextCached(token, clubId ?? undefined).then((ctx) => {
      if (!cancelled) setCoach(isCoach(ctx));
    });
    return () => {
      cancelled = true;
    };
  }, [token, clubId, clubsLoading]);

  useFocusEffect(
    useCallback(() => {
      if (!token || clubsLoading) return;
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
    }, [token, clubId, clubsLoading]),
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

  /**
   * The learner's two destinations, in the frame's order: assignments on the
   * left, feedback on the right.
   *
   * The badge is the count the old subtitle used to spell out, and it is only
   * present when there is something to count — a 0 would paint an empty disc,
   * and "nothing waiting" is better said by the absence of the disc than by the
   * digit zero. Unknown (`s === null`) shows no badge either: a first paint that
   * asserts a number and then corrects it is the bug this file keeps guarding
   * against.
   */
  const tiles: TileSpec[] = [
    {
      key: "assignments",
      label: "Assignments from Coach",
      icon: ICON_COACH_ASSIGNMENTS,
      glyph: CO.glyph.assignments,
      badge: s && s.assignments_open > 0 ? s.assignments_open : undefined,
      onPress: () => router.push("/assigned"),
    },
    {
      key: "feedback",
      label: "Feedback",
      icon: ICON_FEEDBACK_BUBBLE,
      glyph: CO.glyph.feedback,
      badge: s && s.plays_reviewed > 0 ? s.plays_reviewed : undefined,
      onPress: () => router.push("/plays"),
    },
  ];

  // Unknown role: the tab veil, not a guessed view that corrects itself. The
  // main return below mounts its own veil at full opacity, so the swap from
  // this branch to the real view reads as one continuous cover that fades.
  if (coach === null) {
    return (
      <Screen>
        <TabLoading ready={false} />
      </Screen>
    );
  }

  // ── The coach's own view — Figma 870:699 ─────────────────────────────────
  if (coach) {
    return (
      <Screen>
        {/* SCROLLS, like every tab here: the tab bar floats over the content, so
            its clearance is paid at the end of the scroll body — where it is
            room to scroll into rather than a permanent dead band, and where a
            third row added later lands on screen instead of behind the bar. */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollBody}
        >
          <View style={styles.headerBlockLearner}>
            <Text style={[styles.titleLearner, { marginLeft: 23 * sc }]}>Coach</Text>
          </View>

          {/* My Learners — wide, and first, because everything else on this
              screen is a queue belonging to someone on that list. */}
          <View style={{ marginTop: CV.headGap * sc, height: (CV.wide.height + CV.wide.offset.y) * sc }}>
            <StackTile
              left={CV.wide.left}
              width={CV.wide.width}
              height={CV.wide.height}
              offset={CV.wide.offset}
              scale={sc}
              onPress={() => router.push("/learners")}
              accessibilityLabel={
                s === null
                  ? "My Learners"
                  : `My Learners, ${s.roster_count} learner${s.roster_count === 1 ? "" : "s"}`
              }
            >
              <View
                style={{ position: "absolute", left: CV.wide.glyph.left * sc, top: 0, bottom: 0, justifyContent: "center" }}
              >
                <SvgXml
                  xml={tintSvg(ICON_GRAD_CAP, Brand.cream)}
                  width={CV.wide.glyph.w * sc}
                  height={CV.wide.glyph.h * sc}
                />
              </View>
              <View
                style={{ position: "absolute", left: CV.wide.labelLeft * sc, top: 0, bottom: 0, justifyContent: "center" }}
              >
                <Text style={[styles.tileLabelCream, { fontSize: CV.wide.labelSize * sc }]}>
                  My Learners
                </Text>
              </View>
            </StackTile>
          </View>

          <View
            style={{
              marginTop: CV.rowGap * sc,
              height: (CV.tile.height + CV.tile.offset.y) * sc,
            }}
          >
            {/* Assignments. The + is a SEPARATE tap target on the same tile: the
                tile opens what you have delegated, the disc deals a new one.
                Drawn after the tile so it wins the press where they overlap. */}
            <StackTile
              left={CV.tile.left}
              width={CV.tile.width}
              height={CV.tile.height}
              offset={CV.tile.offset}
              scale={sc}
              onPress={() => router.push("/assignments")}
              accessibilityLabel="Assignments"
            >
              <SquareTileContent
                icon={ICON_COACH_ASSIGNMENTS}
                glyph={CV.glyph.assignments}
                label="Assignments"
                scale={sc}
              />
            </StackTile>
            <Pressable
              onPress={() => router.push("/create-assignment")}
              accessibilityRole="button"
              accessibilityLabel="Create assignment"
              // The disc is visually small; the finger's target is not.
              hitSlop={12}
              style={({ pressed }) => [
                {
                  position: "absolute",
                  left: (CV.tile.left + CV.tile.width - CV.badge.size - CV.badge.right) * sc,
                  top: CV.badge.top * sc,
                },
                pressed && styles.pressed,
              ]}
            >
              <View
                style={{
                  width: CV.badge.size * sc,
                  height: CV.badge.size * sc,
                  borderRadius: (CV.badge.size / 2) * sc,
                  backgroundColor: Brand.cream,
                }}
              >
                {/* Over a cream disc, not on its own: the glyph is a ring and a
                    plus with nothing between them, so unbacked it would show the
                    tile's green through the middle. */}
                <SvgXml
                  xml={tintSvg(ICON_PLUS_CIRCLE, Brand.ink)}
                  width={CV.badge.size * sc}
                  height={CV.badge.size * sc}
                />
              </View>
            </Pressable>

            {/* Reviews, and how many are still waiting on this coach. The disc is
                a FACT here rather than a control — absent at zero, and absent
                while the summary is unknown, so it never states a number it then
                has to correct. */}
            <StackTile
              left={CV.tile.left + CV.tile.pitch}
              width={CV.tile.width}
              height={CV.tile.height}
              offset={CV.tile.offset}
              scale={sc}
              onPress={() => router.push("/reviews")}
              accessibilityLabel={
                s && s.reviews_pending > 0
                  ? `Reviews, ${s.reviews_pending} waiting`
                  : "Reviews"
              }
            >
              <SquareTileContent
                icon={ICON_REVIEWS_DOC}
                glyph={CV.glyph.reviews}
                label="Reviews"
                scale={sc}
              />
            </StackTile>
            {s && s.reviews_pending > 0 ? (
              <View
                style={[
                  styles.countDisc,
                  {
                    left:
                      (CV.tile.left + CV.tile.pitch + CV.tile.width - CV.badge.size - CV.badge.right) *
                      sc,
                    top: CV.badge.top * sc,
                    width: CV.badge.size * sc,
                    height: CV.badge.size * sc,
                    borderRadius: (CV.badge.size / 2) * sc,
                    borderWidth: Math.max(1, sc),
                  },
                ]}
                pointerEvents="none"
              >
                <Text style={[styles.countDiscText, { fontSize: CV.badge.textSize * sc }]}>
                  {s.reviews_pending > 99 ? "99+" : s.reviews_pending}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <TabLoading ready />
      </Screen>
    );
  }

  // ── The learner's view — Figma 869:597 ───────────────────────────────────
  //
  // Full bleed rather than the screen's padding: every x in the frame is measured
  // from the phone's edge, and paying the padding as well would shift the whole
  // layout in by a second, invisible margin.
  //
  // The faces row scrolls SIDEWAYS on its own. A club that hires six coaches puts
  // six faces on a 390pt line; letting the row scroll keeps the tiles where the
  // design puts them instead of pushing them off the screen.
  const tilesRowHeight =
    (CO.tile.height +
      CO.tile.offset.y +
      CO.tileLabelGap +
      // Two lines reserved: "Assignments from Coach" wraps at this width and
      // "Feedback" does not, and a row whose height depended on the longest
      // label would jog as the copy changed.
      2 * CO.tileLabelSize * 1.25) *
    sc;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
      >
        <View style={styles.headerBlockLearner}>
          {/* The tab's own name, like every sibling tab — so the H1 never states
              a fact (a count, a name) that has to correct itself a moment later. */}
          <Text style={[styles.titleLearner, { marginLeft: 23 * sc }]}>Coach</Text>
        </View>

        <Text
          style={[
            styles.sectionHeading,
            { marginLeft: 23 * sc, marginTop: CO.headingGap * sc, fontSize: 20.288 * sc },
          ]}
        >
          My Coaches
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingLeft: CO.rowLeft * sc,
            paddingRight: CO.rowLeft * sc,
            gap: (CO.pitch - CO.avatar) * sc,
          }}
          style={{ marginTop: CO.rowGap * sc }}
        >
          {coachList.map((co) => (
            // Keyed by coach id, not position: hiring reorders the (name-sorted)
            // list, and a positional key would recycle the wrong face's state.
            <CoachFace key={co.coach_id} coach={co} scale={sc} />
          ))}
          {/* Withheld while the summary is UNKNOWN: until it lands we cannot tell
              a first coach from another one, and the button is the same either
              way — but a Hire that appears before the faces do reads as "you have
              nobody", which is exactly the wrong first impression. */}
          {s ? <HireFace scale={sc} hasCoaches={coachList.length > 0} /> : null}
        </ScrollView>

        <View style={[styles.tileRow, { marginTop: CO.tilesGap * sc, height: tilesRowHeight }]}>
          {tiles.map((t, i) => (
            <TileButton key={t.key} tile={t} index={i} scale={sc} />
          ))}
        </View>
      </ScrollView>

      <TabLoading ready />
    </Screen>
  );
}

/**
 * The stacked card both of the coach's rows are made of: a darker card behind and
 * below, and a green face carrying whatever the caller draws.
 *
 * Positioned absolutely by its design x, so a row is a plain box and the tiles sit
 * at the frame's own coordinates. The face is the touch target; the card behind is
 * allowed to overflow it, as it does everywhere else in the deck.
 */
function StackTile({
  left,
  width,
  height,
  offset,
  scale: sc,
  onPress,
  accessibilityLabel,
  children,
}: {
  left: number;
  width: number;
  height: number;
  offset: { x: number; y: number };
  scale: number;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          position: "absolute",
          left: left * sc,
          top: 0,
          width: (width + offset.x) * sc,
          height: (height + offset.y) * sc,
        },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.tileShadow,
          {
            left: offset.x * sc,
            top: offset.y * sc,
            width: width * sc,
            height: height * sc,
            borderRadius: 20 * sc,
          },
        ]}
      />
      <View
        style={[
          styles.tileFaceFilled,
          { width: width * sc, height: height * sc, borderRadius: 20 * sc },
        ]}
      >
        {children}
      </View>
    </Pressable>
  );
}

/** The square tiles' inside: glyph over label, both at the frame's own tops. */
function SquareTileContent({
  icon,
  glyph,
  label,
  scale: sc,
}: {
  icon: string;
  glyph: { w: number; h: number };
  label: string;
  scale: number;
}) {
  return (
    <>
      <View style={{ position: "absolute", top: CV.tile.glyphTop * sc, left: 0, right: 0, alignItems: "center" }}>
        <SvgXml xml={tintSvg(icon, Brand.cream)} width={glyph.w * sc} height={glyph.h * sc} />
      </View>
      <Text
        style={[
          styles.tileLabelCream,
          {
            position: "absolute",
            top: CV.tile.labelTop * sc,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: CV.tile.labelSize * sc,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );
}

/** One coach: their face, their name, and what they are holding. */
function CoachFace({ coach, scale: sc }: { coach: SummaryCoach; scale: number }) {
  const pending = count(coach.pending) ?? 0;
  // The name VERBATIM. Never a first name, never initials: coaches called
  // "Coach One" and "Coach Anna" both reduce to "Coach", which is exactly the
  // bug this screen used to show.
  const name = coach.name?.trim() || "Your coach";
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/plays", params: { coach: coach.coach_id } })}
      accessibilityRole="button"
      accessibilityLabel={`${name} — ${coachStatus(coach)}`}
      style={({ pressed }) => [styles.face, pressed && styles.pressed]}
    >
      <View>
        <SvgXml
          xml={tintSvg(ICON_AVATAR, Brand.ink)}
          width={CO.avatar * sc}
          height={CO.avatar * sc}
        />
        {pending > 0 ? (
          <View
            style={[
              styles.faceBadge,
              {
                minWidth: 17 * sc,
                height: 17 * sc,
                borderRadius: 8.5 * sc,
                paddingHorizontal: 4 * sc,
                right: -3 * sc,
                top: -2 * sc,
              },
            ]}
          >
            <Text style={[styles.faceBadgeText, { fontSize: 10.5 * sc }]}>{pending}</Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[
          styles.faceName,
          { marginTop: CO.nameGap * sc, fontSize: CO.nameSize * sc, maxWidth: CO.pitch * sc },
        ]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </Pressable>
  );
}

/** The green + at the end of the row. Same footprint as a face, so the row's
 *  rhythm does not break where the people stop. */
function HireFace({ scale: sc, hasCoaches }: { scale: number; hasCoaches: boolean }) {
  return (
    <Pressable
      onPress={() => router.push("/coaches")}
      accessibilityRole="button"
      accessibilityLabel={hasCoaches ? "Hire another coach" : "Hire a coach"}
      style={({ pressed }) => [styles.face, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.hireDisc,
          { width: CO.avatar * sc, height: CO.avatar * sc, borderRadius: (CO.avatar / 2) * sc },
        ]}
      >
        <SvgXml
          xml={tintSvg(ICON_PLUS, Brand.cream)}
          width={CO.plus * sc}
          height={CO.plus * sc}
        />
      </View>
      <Text
        style={[styles.faceName, { marginTop: CO.nameGap * sc, fontSize: CO.nameSize * sc }]}
        numberOfLines={1}
      >
        Hire
      </Text>
    </Pressable>
  );
}

/** One of the two destinations: the stacked-card idiom the club buttons and the
 *  playing cards use — a darker green sitting behind and below the face. */
function TileButton({ tile, index, scale: sc }: { tile: TileSpec; index: number; scale: number }) {
  return (
    <Pressable
      onPress={tile.onPress}
      accessibilityRole="button"
      accessibilityLabel={tile.badge ? `${tile.label}, ${tile.badge}` : tile.label}
      style={({ pressed }) => [
        {
          position: "absolute",
          left: (CO.tile.left + index * CO.tile.pitch) * sc,
          top: 0,
          width: (CO.tile.width + CO.tile.offset.x) * sc,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={{ height: (CO.tile.height + CO.tile.offset.y) * sc }}>
        <View
          style={[
            styles.tileShadow,
            {
              left: CO.tile.offset.x * sc,
              top: CO.tile.offset.y * sc,
              width: CO.tile.width * sc,
              height: CO.tile.height * sc,
              borderRadius: CO.tile.radius * sc,
            },
          ]}
        />
        <View
          style={[
            styles.tileFace,
            {
              width: CO.tile.width * sc,
              height: CO.tile.height * sc,
              borderRadius: CO.tile.radius * sc,
            },
          ]}
        >
          <SvgXml
            xml={tintSvg(tile.icon, Brand.cream)}
            width={tile.glyph.w * sc}
            height={tile.glyph.h * sc}
          />
        </View>
        {tile.badge ? (
          <View
            style={[
              styles.tileBadge,
              {
                minWidth: 20 * sc,
                height: 20 * sc,
                borderRadius: 10 * sc,
                paddingHorizontal: 5 * sc,
                left: (CO.tile.width - 12) * sc,
                top: -6 * sc,
              },
            ]}
          >
            <Text style={[styles.tileBadgeText, { fontSize: 11.5 * sc }]}>{tile.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[
          styles.tileLabel,
          {
            marginTop: CO.tileLabelGap * sc,
            fontSize: CO.tileLabelSize * sc,
            lineHeight: CO.tileLabelSize * 1.25 * sc,
          },
        ]}
      >
        {tile.label}
      </Text>
    </Pressable>
  );
}

/** One of the learner's two tiles. */
type TileSpec = {
  key: string;
  label: string;
  /** The glyph's SVG source, tinted cream over the green face. */
  icon: string;
  /** Its own export's box — neither glyph is square, and forcing one would
   *  stretch it. */
  glyph: { w: number; h: number };
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
  // Both views wear the same measurements as Play, Learn and Club: BrandChrome's
  // own top gap, and the shared screen-title size — so every tab's first line
  // lands on one baseline.
  headerBlockLearner: { paddingTop: CONTENT_TOP_GAP },
  titleLearner: {
    fontFamily: Fonts.display,
    fontSize: Type.screenTitle,
    lineHeight: 31,
    color: Brand.ink,
  },
  /** "My Coaches" — Neco Medium, the size every other section heading uses. */
  sectionHeading: { fontFamily: Fonts.displayMedium, color: Brand.ink },

  /** A face and its name, centred on each other. */
  face: { alignItems: "center" },
  faceName: { fontFamily: Fonts.body, color: Brand.ink, textAlign: "center" },
  /** How many games this coach is holding — the number the old subtitle spelled
   *  out, kept because it is the reason the tab gets opened. */
  faceBadge: {
    position: "absolute",
    backgroundColor: Brand.maroon,
    alignItems: "center",
    justifyContent: "center",
  },
  faceBadgeText: { fontFamily: Fonts.bodySemibold, color: Brand.cream },
  hireDisc: { backgroundColor: Brand.green, alignItems: "center", justifyContent: "center" },

  /** Positioned children, so the two tiles sit at the frame's own x's. */
  tileRow: { position: "relative" },
  tileShadow: { position: "absolute", backgroundColor: Brand.rowShadow },
  /** The coach tiles' face: a plain green ground its children position onto,
   *  unlike the learner tiles' face, which centres a single glyph. */
  tileFaceFilled: {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "hidden",
    backgroundColor: Brand.green,
  },
  tileLabelCream: { fontFamily: Fonts.displayMedium, color: Brand.cream },
  /** The Reviews count — cream, edged in the shadow card's own colour so it
   *  belongs to the tile it overhangs. */
  countDisc: {
    position: "absolute",
    backgroundColor: Brand.cream,
    borderColor: Brand.rowShadow,
    alignItems: "center",
    justifyContent: "center",
  },
  countDiscText: { fontFamily: Fonts.displayMedium, color: Brand.ink },
  tileFace: {
    position: "absolute",
    left: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.green,
  },
  tileLabel: {
    fontFamily: Fonts.displayMedium,
    color: Brand.ink,
    textAlign: "center",
    width: "100%",
  },
  tileBadge: {
    position: "absolute",
    backgroundColor: Brand.maroon,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadgeText: { fontFamily: Fonts.bodySemibold, color: Brand.cream },
  pressed: { opacity: 0.6 },
  // No flex:1 inside a ScrollView — content sizes itself and the scroll view
  // measures it; the tab bar's clearance rides the scroll body's end.
  scrollBody: { paddingBottom: TAB_BAR_CLEARANCE + 24 },
});
