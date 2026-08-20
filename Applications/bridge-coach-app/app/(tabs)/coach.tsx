// Coach — the relationship tab: who coaches YOU, and the state of your feedback.
//
// ONE view for everyone, coach included. It used to swap its whole body on
// isCoach, so a mentor who is also a learner could not see their own coach, their
// feedback, or the boards assigned to them — they got a roster instead. Home and
// Play had already dropped that split; this tab was the last one branching the UI
// on a role.
//
// The coach's own surfaces are NOT lost — Learners, Assignments, Create
// assignment and Reviews are rows in the Menu drawer's "Other" section, each
// behind the same capability that gated it here. The Figma 870:699 coach frame
// this file used to render is gone with the split.
//
// The view below is Figma 869:597: "My Coaches" as a row of faces with a green
// + Hire at its end, then two stacked-card tiles — From Coach, and Send for
// Review. It used to be one card stack, four to six rows of title-and-subtitle
// that all looked alike; the faces are what make "who coaches me" answerable at
// a glance, and the two tiles are the only two places anyone actually goes.
//
// TWO DELIBERATE DEPARTURES FROM THE FRAME:
//   - No top app bar. The frame draws the hamburger-and-avatar bar, but the app
//     puts that bar on HOME ALONE (see brand-chrome)
//     and every other tab starts at CONTENT_TOP_GAP. Following the frame here
//     would give one tab chrome its four siblings do not have.
//   - Counts survive as small discs. The frame has none, and the stack it replaces
//     said "3 games awaiting review" in words. Dropping the number to match the
//     picture would cost the learner the one fact the screen is checked for, so it
//     is kept as a badge rather than a line of prose.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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
  ICON_PLUS,
} from "../../constants/brand-vectors";
import { Screen } from "../../components/ui";
import { Brand, Fonts, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { TabLoading } from "../../components/tab-loading";
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
  // Last known summary renders immediately; the focus effect refreshes it.
  const [summary, setSummary] = useState<BridgeSummary | null>(() =>
    token ? peekSummary(token, clubId ?? undefined) : null,
  );

  useFocusEffect(
    useCallback(() => {
      if (!token || clubsLoading) return;
      // Warm the screens reachable from here — this tab's own tiles, and the
      // coaching rows in the Menu drawer. Each is one idempotent GET.
      prewarmBridgePages(
        // /m/assignments was the one door that always opened a cold function.
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
      label: "From Coach",
      icon: ICON_COACH_ASSIGNMENTS,
      glyph: CO.glyph.assignments,
      badge: s && s.assignments_open > 0 ? s.assignments_open : undefined,
      onPress: () => router.push("/assigned"),
    },
    {
      key: "feedback",
      label: "Send for Review",
      icon: ICON_FEEDBACK_BUBBLE,
      glyph: CO.glyph.feedback,
      badge: s && s.plays_reviewed > 0 ? s.plays_reviewed : undefined,
      onPress: () => router.push("/plays"),
    },
  ];

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
      // Two lines reserved, ALWAYS — not measured from the labels. It was
      // justified by the copy once ("Assignments from Coach" wrapped, "Feedback"
      // did not), and that copy has since changed twice; a row whose height
      // depended on the longest label would jog every time the words did.
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
