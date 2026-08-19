// Play — one big New Play card, two small buttons, and the friends stack
// (Figma 894:337).
//
// WHAT WENT, and where it went:
//   Curated Deals   coaches only (curated v2, 2026-08-18): a maroon row under
//                   Resume/History opening /curate-new (the studio's deal
//                   picker, embedded). Everyone else
//                   never sees it — hidden, not dimmed, even while the role is
//                   still resolving.
//   From Coach      already on the Learn tab, so a second door to it was noise.
//   Resume Board  → Resume    (same behaviour, shorter word)
//   My Plays      → History   (same screen)
//   Private Table → Play with Friends
//
// The previous layout was six equal playing cards in a grid, which said every
// door here is the same size. They are not: New Play is what most people open,
// and Resume and History are what you reach for after it. So New Play is wide and
// maroon, those two are small and green beside each other, and the friends stack
// sits on its own further down with the suit band running behind it.
//
// Geometry is the design's, in its 390-wide space, multiplied by `s = width / 390`
// like every other screen here.

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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SvgXml } from "react-native-svg";

import { BrandChrome } from "../../components/brand-chrome";
import { JigglingOwl } from "../../components/jiggling-owl";
import { tintSvg } from "../../components/svg-tint";
import {
  ICON_CARD_HISTORY,
  ICON_CARD_PLAY,
  ICON_CARD_PLUS,
  ICON_PEOPLE_PAIR,
  ICON_SUIT_CLUB,
  ICON_SUIT_DIAMOND,
  ICON_SUIT_HEART,
  ICON_SUIT_SPADE,
} from "../../constants/brand-vectors";
import { Brand, Fonts, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { TabLoading } from "../../components/tab-loading";
import { useAuth } from "../../lib/auth-context";
import { getBridgeContextCached, isCoach, peekRoleContext } from "../../lib/bridge-role";
import { useClubs } from "../../lib/club-context";
import { peekBridgeOrigin, prefetchLaunch } from "../../lib/launch-cache";
import { type BridgeSummary } from "../../lib/nexus";
import { prewarmBridgePages } from "../../lib/prewarm";
import { peekSummary, refreshSummary } from "../../lib/summary-cache";

const DESIGN_WIDTH = 390;

/** The dark card behind a maroon face, and behind a green one. */
const BEHIND_MAROON = "#220a0b";
const BEHIND_GREEN = "#06140d";

/** The card faces, their shadow cards, and where the type sits on them. */
const D = {
  titleLeft: 23,
  /** The title's line box, pinned so a font metric cannot move the layout. */
  titleLine: 34,

  newPlay: {
    left: 65,
    width: 252,
    height: 97,
    radius: 9.887,
    /** The card behind, down and to the right. */
    offset: { x: 4, y: 8 },
    /** From the title's line box to this card's face. */
    gap: 56,
    glyph: { size: 37, left: 34, top: 30 },
    label: { left: 112, top: 32, size: 24 },
  },

  /** Resume and History: one box, two x's. */
  small: {
    width: 122,
    height: 56,
    radius: 9.887,
    offset: { x: 3, y: 3 },
    left: [67, 200],
    /** From the New Play SHADOW's bottom to these faces. */
    gap: 15,
    labelTop: 15,
    labelSize: 18.4,
    /** Each glyph at its own box — a play triangle and a clock are not the same
     *  shape, and forcing one box on both stretches whichever loses. */
    resumeGlyph: { w: 11.8, h: 14.1, left: 12, top: 21 },
    historyGlyph: { w: 19, h: 19, left: 11, top: 19 },
  },

  /** Curated Deals (coaches only): one wider small button, centred on the small
   *  row's span, maroon like the other authoring door (New Play). Wider because
   *  "Curated Deals" does not fit the two-slot width at the row's type size. */
  curated: {
    width: 180,
    left: 103,
    gap: 15,
    glyph: { w: 16, h: 16, left: 13, top: 20 },
  },

  /**
   * The friends stack: three cards on one optical centre, two of them turned.
   *
   * Positioned by CENTRE, not by corner. A rotation in the frame turns a card
   * about its middle, so matching the frame means placing the middle and letting
   * the corners fall where they fall. Placing corners and then rotating slides
   * every card sideways by an amount that changes with the angle — which is
   * exactly how a fanned stack ends up looking accidental rather than dealt.
   */
  friends: {
    card: { width: 119.355, height: 171.617, radius: 9.887 },
    /** The 15° card's bounding box: h·cos15 + w·sin15. */
    rowHeight: 196.661,
    /** From the small buttons' shadow bottom to the top of this row. */
    gap: 59,
    stack: [
      { cx: 207.85, cy: 98.33, rotate: 15 },
      { cx: 199.79, cy: 96.24, rotate: 5.62 },
    ],
    face: { cx: 194.14, cy: 96.24 },
    label: { top: 64.57, size: 18.4 },
    glyph: { w: 24, h: 17.455, left: 9.54, top: 13.57 },
    /** The mirrored index, bottom-right — same glyph, flipped. */
    glyphAlt: { left: 82.54, top: 141.57 },
  },
} as const;

/**
 * The suit band, at the frame's own x with y relative to the friends row.
 *
 * A flat table rather than a tiled pattern, because the frame's spacing is not
 * quite periodic: the run reads as continuous only because the stack covers the
 * middle of it. A clean repeat would put glyphs behind the card where nobody sees
 * them and leave visible gaps at the edges instead. Nineteen entries are cheaper
 * to read than the arithmetic that would almost reproduce them.
 */
const BAND: { xml: string; x: number; y: number; w: number; h: number; turn?: number }[] = [
  { xml: ICON_SUIT_SPADE, x: -2, y: 66.9, w: 21.757, h: 20.976 },
  { xml: ICON_SUIT_SPADE, x: -2, y: 127.4, w: 21.757, h: 20.976 },
  { xml: ICON_SUIT_HEART, x: 24, y: 102, w: 22.141, h: 20.314 },
  { xml: ICON_SUIT_CLUB, x: 46, y: 69, w: 19.81, h: 21.225 },
  { xml: ICON_SUIT_CLUB, x: 46, y: 129, w: 19.81, h: 21.225 },
  { xml: ICON_SUIT_DIAMOND, x: 70, y: 103, w: 17.625, h: 19.228, turn: 180 },
  { xml: ICON_SUIT_SPADE, x: 94, y: 68.4, w: 21.757, h: 20.976 },
  { xml: ICON_SUIT_SPADE, x: 94, y: 129.5, w: 21.757, h: 20.976 },
  { xml: ICON_SUIT_HEART, x: 112, y: 103, w: 22.141, h: 20.314 },
  // 134–254 is where the stack sits; the frame draws nothing under it.
  { xml: ICON_SUIT_HEART, x: 257, y: 102, w: 22.141, h: 20.314 },
  { xml: ICON_SUIT_CLUB, x: 279, y: 69, w: 19.81, h: 21.225 },
  { xml: ICON_SUIT_CLUB, x: 279, y: 129, w: 19.81, h: 21.225 },
  { xml: ICON_SUIT_DIAMOND, x: 303, y: 103, w: 17.625, h: 19.228, turn: 180 },
  { xml: ICON_SUIT_SPADE, x: 330.4, y: 68.4, w: 21.757, h: 20.976 },
  { xml: ICON_SUIT_SPADE, x: 330.4, y: 129.5, w: 21.757, h: 20.976 },
  { xml: ICON_SUIT_HEART, x: 345, y: 103, w: 22.141, h: 20.314 },
  { xml: ICON_SUIT_CLUB, x: 374, y: 70, w: 19.81, h: 21.225 },
  { xml: ICON_SUIT_CLUB, x: 374, y: 130, w: 19.81, h: 21.225 },
  { xml: ICON_SUIT_DIAMOND, x: 398, y: 104, w: 17.625, h: 19.228, turn: 180 },
];

/** The owl's box, and how far above the card's face it shows. */
const OWL = { left: 254, width: 46.186, height: 58.27, rise: 26 };

export default function PlayScreen() {
  const { token } = useAuth();
  // The selected club scopes every bridge read here (null = app-wide). While
  // clubs are LOADING the scope is unknown, so the effect below fetches nothing
  // yet: firing early asked about the app-wide program, a guaranteed 403 for a
  // club-only account, paid in full before the real fetch could start.
  const { selected, loading: clubsLoading } = useClubs();
  const clubId = selected?.programId ?? null;
  const { width } = useWindowDimensions();
  const s = width / DESIGN_WIDTH;

  // Last known summary renders immediately; the focus effect refreshes it.
  const [summary, setSummary] = useState<BridgeSummary | null>(() =>
    token ? peekSummary(token, clubId ?? undefined) : null,
  );
  const [error, setError] = useState<string | null>(null);
  // Coaches get the Curated Deals door (owner design 2026-08-15). Same
  // role discipline as the Coach tab: unknown (null) shows no card rather
  // than flashing one in or out once the context resolves.
  const [coach, setCoach] = useState<boolean | null>(() => {
    const peeked = token ? peekRoleContext(token, clubId ?? undefined) : null;
    return peeked ? isCoach(peeked) : null;
  });
  useFocusEffect(
    useCallback(() => {
      if (!token || clubsLoading) return;
      let cancelled = false;
      const peeked = peekRoleContext(token, clubId ?? undefined);
      setCoach(peeked ? isCoach(peeked) : null);
      getBridgeContextCached(token, clubId ?? undefined).then((ctx) => {
        if (!cancelled) setCoach(isCoach(ctx));
      });
      return () => {
        cancelled = true;
      };
    }, [token, clubId, clubsLoading]),
  );

  // Refresh on every visit: what is resumable changes as boards are played.
  useFocusEffect(
    useCallback(() => {
      if (!token || clubsLoading) return;
      prefetchLaunch(token, "bridge"); // keep a launch warm — one tap away
      // Warm the screens these buttons open, so tapping one lands on a warm
      // function instead of a cold start. THE TABLE ITSELF is on the list: each
      // route is its own serverless function and the table's is the heaviest — a
      // bogus id 404s cheaply while still paying its module init and DB pool.
      // quick-play is NOT warmable (a GET there deals a real board). /m/assigned
      // came off the list with From Coach: nothing here opens it any more.
      prewarmBridgePages(
        ["/m/plays", "/welcome", "/bridge/table2/prewarm"],
        peekBridgeOrigin(token),
      );
      let cancelled = false;
      setError(null);
      refreshSummary(token, clubId ?? undefined)
        .then((sum) => !cancelled && setSummary(sum))
        // A failed refresh with stale data on screen stays silent — the stale
        // summary beats an error banner.
        .catch(
          () =>
            !cancelled &&
            !peekSummary(token, clubId ?? undefined) &&
            setError("Couldn't load your boards."),
        );
      return () => {
        cancelled = true;
      };
    }, [token, clubId, clubsLoading]),
  );

  const inProgress = summary?.in_progress ?? [];
  const canResume = inProgress.length > 0;

  async function resume() {
    if (!token || !canResume) return;
    // Decide from FRESH data: the cached summary can be a beat old right after a
    // save (the refresh races the tap), and deciding from the stale list opened
    // the wrong board. refreshSummary shares the in-flight focus refresh, so this
    // usually resolves instantly.
    const fresh = await refreshSummary(token, clubId ?? undefined).catch(() => null);
    const list = fresh?.in_progress ?? inProgress;
    if (fresh) setSummary(fresh);
    if (list.length === 0) return;
    // ONE unfinished board opens straight at the table; several open the picker
    // (owner direction 2026-08-13: never auto-pick among many).
    if (list.length === 1) {
      router.push({ pathname: "/table/[sessionId]", params: { sessionId: list[0]!.session_id } });
    } else {
      router.push("/resume");
    }
  }

  return (
    <BrandChrome>
      <ScrollView
        style={styles.page}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
      >
        <Text style={[styles.title, { marginLeft: D.titleLeft * s, lineHeight: D.titleLine }]}>
          Play
        </Text>

        {/* ── New Play, with the owl behind it ───────────────────────────── */}
        <View
          style={{
            height: (D.newPlay.height + D.newPlay.offset.y) * s,
            marginTop: D.newPlay.gap * s,
          }}
        >
          <PeekingOwl scale={s} />

          <Pressable
            onPress={() => router.push("/new-board")}
            accessibilityRole="button"
            accessibilityLabel="New play"
            style={({ pressed }) => [
              {
                position: "absolute",
                left: D.newPlay.left * s,
                top: 0,
                width: (D.newPlay.width + D.newPlay.offset.x) * s,
                height: (D.newPlay.height + D.newPlay.offset.y) * s,
              },
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.behind,
                {
                  left: D.newPlay.offset.x * s,
                  top: D.newPlay.offset.y * s,
                  width: D.newPlay.width * s,
                  height: D.newPlay.height * s,
                  borderRadius: D.newPlay.radius * s,
                  backgroundColor: BEHIND_MAROON,
                },
              ]}
            />
            <View
              style={[
                styles.face,
                {
                  width: D.newPlay.width * s,
                  height: D.newPlay.height * s,
                  borderRadius: D.newPlay.radius * s,
                  backgroundColor: Brand.maroon,
                },
              ]}
            >
              <View
                style={{
                  position: "absolute",
                  left: D.newPlay.glyph.left * s,
                  top: D.newPlay.glyph.top * s,
                }}
              >
                <SvgXml
                  xml={tintSvg(ICON_CARD_PLUS, Brand.white)}
                  width={D.newPlay.glyph.size * s}
                  height={D.newPlay.glyph.size * s}
                />
              </View>
              <Text
                style={[
                  styles.cardLabel,
                  {
                    position: "absolute",
                    left: D.newPlay.label.left * s,
                    top: D.newPlay.label.top * s,
                    fontSize: D.newPlay.label.size * s,
                  },
                ]}
                numberOfLines={1}
              >
                New Play
              </Text>
            </View>
          </Pressable>
        </View>

        {/* ── Resume · History ───────────────────────────────────────────── */}
        <View
          style={{
            height: (D.small.height + D.small.offset.y) * s,
            marginTop: D.small.gap * s,
          }}
        >
          <SmallButton
            scale={s}
            left={D.small.left[0]}
            label="Resume"
            glyph={{ xml: ICON_CARD_PLAY, ...D.small.resumeGlyph }}
            onPress={resume}
            // Nothing to resume — dimmed rather than opening an empty picker.
            // Only once the summary has loaded, so it does not flicker on arrival.
            disabled={summary != null && !canResume}
            badge={inProgress.length}
          />
          <SmallButton
            scale={s}
            left={D.small.left[1]}
            label="History"
            glyph={{ xml: ICON_CARD_HISTORY, ...D.small.historyGlyph }}
            onPress={() => router.push("/plays")}
          />
        </View>

        {/* ── Curated Deals — COACHES ONLY (curated v2, owner design
            2026-08-18): the STUDIO. Build the board card by card, play all
            four seats, publish the line, assign from Assignments. (v1 —
            deal a random board and annotate your own sitting — was this
            card's old door, /new-board?curate=1.)
            Hidden (not dimmed) for everyone else; while the role is UNKNOWN it
            stays hidden rather than flashing in — TabLoading holds the veil
            until the role resolves, so nobody watches the row appear. */}
        {coach === true ? (
          <View
            style={{
              height: (D.small.height + D.small.offset.y) * s,
              marginTop: D.curated.gap * s,
            }}
          >
            <SmallButton
              scale={s}
              left={D.curated.left}
              width={D.curated.width}
              tone="maroon"
              label="Curated Deals"
              glyph={{ xml: ICON_CARD_PLUS, ...D.curated.glyph }}
              onPress={() => router.push("/curate-new")}
            />
          </View>
        ) : null}

        {/* ── Play with Friends, on its band of suits ────────────────────── */}
        <View style={{ height: D.friends.rowHeight * s, marginTop: D.friends.gap * s }}>
          {/* Behind everything, and inert: wallpaper, not a control. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {BAND.map((g, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: g.x * s,
                  top: g.y * s,
                  ...(g.turn ? { transform: [{ rotate: `${g.turn}deg` }] } : {}),
                }}
              >
                <SvgXml xml={g.xml} width={g.w * s} height={g.h * s} />
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => router.push("/private-table")}
            accessibilityRole="button"
            accessibilityLabel="Play with friends"
            style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}
          >
            {/* The turned cards, furthest back first. */}
            {D.friends.stack.map((c, i) => (
              <View
                key={i}
                style={[
                  styles.stackCard,
                  {
                    left: (c.cx - D.friends.card.width / 2) * s,
                    top: (c.cy - D.friends.card.height / 2) * s,
                    width: D.friends.card.width * s,
                    height: D.friends.card.height * s,
                    borderRadius: D.friends.card.radius * s,
                    transform: [{ rotate: `${c.rotate}deg` }],
                  },
                ]}
              />
            ))}

            <View
              style={[
                styles.stackCard,
                styles.stackFace,
                {
                  left: (D.friends.face.cx - D.friends.card.width / 2) * s,
                  top: (D.friends.face.cy - D.friends.card.height / 2) * s,
                  width: D.friends.card.width * s,
                  height: D.friends.card.height * s,
                  borderRadius: D.friends.card.radius * s,
                },
              ]}
            >
              <View
                style={{
                  position: "absolute",
                  left: D.friends.glyph.left * s,
                  top: D.friends.glyph.top * s,
                }}
              >
                <SvgXml
                  xml={tintSvg(ICON_PEOPLE_PAIR, Brand.white)}
                  width={D.friends.glyph.w * s}
                  height={D.friends.glyph.h * s}
                />
              </View>

              <Text
                style={[
                  styles.cardLabel,
                  {
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: D.friends.label.top * s,
                    textAlign: "center",
                    fontSize: D.friends.label.size * s,
                    lineHeight: D.friends.label.size * 1.25 * s,
                  },
                ]}
                numberOfLines={2}
              >
                Play with Friends
              </Text>

              {/* The mirrored index a real card carries. */}
              <View
                style={{
                  position: "absolute",
                  left: D.friends.glyphAlt.left * s,
                  top: D.friends.glyphAlt.top * s,
                  transform: [{ scaleY: -1 }],
                }}
              >
                <SvgXml
                  xml={tintSvg(ICON_PEOPLE_PAIR, Brand.white)}
                  width={D.friends.glyph.w * s}
                  height={D.friends.glyph.h * s}
                />
              </View>
            </View>
          </Pressable>
        </View>

        {error ? <Text style={styles.stateText}>{error}</Text> : null}
      </ScrollView>

      {/* Ready once the club is known, the summary (or its error) is in, AND
          the role has resolved — the buttons' state and the page's SHAPE
          arrive with the content, not after it. Without the role in that
          list a coach watched the page paint and then grow the Curated Deals
          row; the sign-in prime warms it, so this waits on nothing.
          (TabLoading has its own failsafe, and lifts for good once lifted.) */}
      <TabLoading
        ready={!clubsLoading && (summary !== null || error !== null) && coach !== null}
      />
    </BrandChrome>
  );
}

/**
 * The owl, peeking over the New Play card.
 *
 * The same three-frame jiggle as the nest on Home — the same component, the same
 * 8fps loop — so it is recognisably the same bird rather than a second animation
 * that nearly matches. What is added here is the PEEK: a slow rise and fall of a
 * few points, which reads as an owl bobbing behind the card precisely because
 * most of it is hidden. Only the head shows, so a small vertical move is the
 * largest gesture available and the only one that would be legible.
 *
 * Drawn BEFORE the card and given a negative top, so the card covers its body.
 * Inert: it sits inside New Play's row, and a bird that swallowed taps meant for
 * the card would be a bug rather than a feature.
 */
function PeekingOwl({ scale: s }: { scale: number }) {
  const lift = useSharedValue(0);

  useEffect(() => {
    // Sinusoidal in and out, so there is no flat pause at either end — a linear
    // bob reads as mechanical, the opposite of the hand-drawn frames.
    lift.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [lift]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value * -5 * s }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[style, { position: "absolute", left: OWL.left * s, top: -OWL.rise * s }]}
    >
      <JigglingOwl width={OWL.width * s} height={OWL.height * s} />
    </Animated.View>
  );
}

/** Resume or History: a green stacked card with a glyph and a word beside it.
 *  Curated Deals borrows the shape in maroon (`tone`), wider (`width`) because
 *  its label is longer than the two-slot row allows. */
function SmallButton({
  scale: s,
  left,
  label,
  glyph,
  onPress,
  disabled = false,
  badge,
  tone = "green",
  width = D.small.width,
}: {
  scale: number;
  left: number;
  label: string;
  glyph: { xml: string; w: number; h: number; left: number; top: number };
  onPress: () => void;
  disabled?: boolean;
  badge?: number;
  tone?: "green" | "maroon";
  width?: number;
}) {
  const behindColor = tone === "maroon" ? BEHIND_MAROON : BEHIND_GREEN;
  const faceColor = tone === "maroon" ? Brand.maroon : Brand.green;
  // Only past one: "Resume 1" says nothing the word does not, and the picker only
  // appears above one board anyway.
  const showBadge = !disabled && badge != null && badge > 1;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={showBadge ? `${label}, ${badge} boards` : label}
      style={({ pressed }) => [
        {
          position: "absolute",
          left: left * s,
          top: 0,
          width: (width + D.small.offset.x) * s,
          height: (D.small.height + D.small.offset.y) * s,
          opacity: disabled ? 0.45 : 1,
        },
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.behind,
          {
            left: D.small.offset.x * s,
            top: D.small.offset.y * s,
            width: width * s,
            height: D.small.height * s,
            borderRadius: D.small.radius * s,
            backgroundColor: behindColor,
          },
        ]}
      />
      <View
        style={[
          styles.face,
          {
            width: width * s,
            height: D.small.height * s,
            borderRadius: D.small.radius * s,
            backgroundColor: faceColor,
          },
        ]}
      >
        <View style={{ position: "absolute", left: glyph.left * s, top: glyph.top * s }}>
          <SvgXml xml={tintSvg(glyph.xml, Brand.white)} width={glyph.w * s} height={glyph.h * s} />
        </View>
        <Text
          style={[
            styles.cardLabel,
            {
              position: "absolute",
              // Centred on the space RIGHT of the glyph, not on the card —
              // centring on the card would sit the word under the icon.
              left: (glyph.left + glyph.w) * s,
              right: 0,
              top: D.small.labelTop * s,
              textAlign: "center",
              fontSize: D.small.labelSize * s,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>

      {showBadge ? (
        <View
          style={[
            styles.badge,
            {
              right: -6 * s,
              top: -6 * s,
              minWidth: 20 * s,
              height: 20 * s,
              borderRadius: 10 * s,
              paddingHorizontal: 5 * s,
              borderWidth: Math.max(1, s),
            },
          ]}
        >
          <Text style={[styles.badgeText, { fontSize: 11.5 * s }]}>
            {badge! > 99 ? "99+" : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  /** The tab bar floats over the content, so its clearance is paid at the END of
   *  the scroll body — scrollable room rather than a permanent dead band. */
  scrollBody: { paddingBottom: TAB_BAR_CLEARANCE + 24 },
  title: { fontFamily: Fonts.display, fontSize: Type.screenTitle, color: Brand.ink },
  behind: { position: "absolute" },
  face: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  cardLabel: { fontFamily: Fonts.displayMedium, color: Brand.white },
  /** The friends stack's cards: cream-edged, as the frame draws them, which is
   *  what separates one card from the next where they overlap. */
  stackCard: {
    position: "absolute",
    backgroundColor: BEHIND_MAROON,
    borderWidth: 0.706,
    borderColor: Brand.cream,
  },
  stackFace: { backgroundColor: Brand.maroon, overflow: "hidden" },
  badge: {
    position: "absolute",
    backgroundColor: Brand.cream,
    borderColor: BEHIND_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: Fonts.displayMedium, color: Brand.green },
  stateText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: "rgba(31,31,31,0.55)",
    textAlign: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  pressed: { opacity: 0.85 },
});
