// Home — the Bridge Bird tree. Four nests are the four destinations; the top
// app bar carries the wordmark.
//
// The artwork and the nests are laid out in the Figma frame's coordinate space
// (390x848) and scaled to the real screen width, so a nest always lands on its
// branch. That space is now shared by EVERY layer — sky, far canopy, hills,
// trunk, near canopy, nests — so each one is drawn at design coordinates with no
// per-layer offset to keep in sync. The block is anchored to the BOTTOM: the
// tree and hills run to the screen edge, and any extra height on a taller phone
// opens up at the top, which is solid sky.
//
// The tree is IDENTICAL for both roles. Everything coach-specific lives behind
// the Menu drawer's coach-only "Other" section instead of changing the tree or
// the tab bar, so there is one
// home screen to design and one navigation model to reason about.
//
// There is no Analysis nest. Analysis is gone as a destination, and the branch
// it sat on now carries foliage instead.

import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

import { JigglingOwl } from "../../components/jiggling-owl";
import { TabLoading } from "../../components/tab-loading";
import { BrandAppBar } from "../../components/brand-app-bar";
import { CONTENT_TOP_GAP } from "../../components/brand-chrome";
import { Sky } from "../../components/sky";
import { BackFoliage, WindTree } from "../../components/wind-tree";
import { BrandArt } from "../../constants/brand-assets";
import { HILLS_SVG } from "../../constants/brand-vectors";
import { Brand, Fonts, Type } from "../../constants/theme";

const DESIGN = { width: 390, height: 848 };

/**
 * Nest positions, labels and destinations — all in design coordinates, straight
 * from the frame. Play and Learn hang from the upper branches and are drawn
 * larger than Coach and Club, which is why their labels carry their own size:
 * the design sets the two pairs at 23pt and 26pt line boxes respectively.
 */
const NESTS = [
  { key: "play", label: "Play", href: "/play", x: -6, y: 206, w: 188, h: 114, ly: 233, labelSize: 18 },
  { key: "learn", label: "Learn", href: "/learn", x: 179, y: 210, w: 188, h: 114, ly: 236, labelSize: 18 },
  { key: "coach", label: "Coach", href: "/coach", x: 37, y: 411, w: 172, h: 104.3, ly: 432 },
  { key: "club", label: "Club", href: "/club", x: 227, y: 444, w: 158, h: 95.8, ly: 463 },
] as const;

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const s = width / DESIGN.width;
  const artHeight = DESIGN.height * s;
  // Anchor the artwork to the bottom edge.
  const artTop = height - artHeight;

  return (
    <View style={styles.screen}>
      {/* ── Artwork ─────────────────────────────────────────────────────── */}
      <View
        style={[styles.art, { top: artTop, width: DESIGN.width * s, height: artHeight }]}
        pointerEvents="box-none"
      >
        {/* Sky, far canopy, hills + sun, then the tree over all of it — true
            vectors throughout, so they stay sharp at any density and the tree's
            transparency lets the sunset read through the branches.

            The order is what makes the tree read as having depth: the darker
            suits go BEHIND the trunk (and behind the hills, which is where the
            design puts them), the lit ones in front, so the canopy has a far
            side. The trunk is static — the nests are pinned to its branches —
            and only the near leaves catch the wind, which the still far layer
            gives something to move against. */}
        <View style={StyleSheet.absoluteFill}>
          <Sky width={DESIGN.width * s} height={artHeight} />
        </View>
        <View style={StyleSheet.absoluteFill}>
          <BackFoliage scale={s} />
        </View>
        <View style={{ position: "absolute", left: 0, top: 625 * s }}>
          <SvgXml xml={HILLS_SVG} width={390 * s} height={223 * s} />
        </View>
        <View style={StyleSheet.absoluteFill}>
          <WindTree scale={s} />
        </View>

        {NESTS.map((nest) => (
          <Pressable
            key={nest.key}
            onPress={() => router.push(nest.href as never)}
            accessibilityRole="button"
            accessibilityLabel={nest.label}
            style={({ pressed }) => [
              {
                position: "absolute",
                left: nest.x * s,
                top: nest.y * s,
                width: nest.w * s,
                height: nest.h * s,
              },
              pressed && styles.pressed,
            ]}
          >
            <Image source={BrandArt.nest} style={styles.fill} contentFit="fill" />
          </Pressable>
        ))}

        {/* Labels ride above every nest so a wide word is never clipped by the
            nest it belongs to. */}
        {NESTS.map((nest) => (
          <Text
            key={`${nest.key}-label`}
            style={[
              styles.nestLabel,
              {
                // Spans the NEST and centres inside it, rather than being
                // left-anchored at a hand-picked x. Those x values encoded
                // "centre minus half the word", so they only stayed centred for
                // the exact word and font metrics they were measured against —
                // "Club" sat 17pt left of its nest because its number assumed a
                // wider word. This cannot drift: rename a nest and the label
                // stays centred.
                left: nest.x * s,
                width: nest.w * s,
                top: nest.ly * s,
                fontSize: ("labelSize" in nest ? nest.labelSize : Type.nestLabel) * s,
              },
            ]}
            pointerEvents="none"
          >
            {nest.label}
          </Text>
        ))}

        <View style={{ position: "absolute", left: 99 * s, top: 377 * s }}>
          <JigglingOwl width={46 * s} height={58 * s} />
        </View>
      </View>

      {/* ── Chrome ──────────────────────────────────────────────────────────
          Just the wordmark now. The ☰ / gear / avatar are gone: everything they
          opened lives in the tab bar's Menu drawer. With no icon row above it,
          the wordmark rides up into the space they left, the same lift every
          other screen took when the bar went (BrandChrome.CONTENT_TOP_GAP). */}
      <View
        style={[styles.chrome, { paddingTop: insets.top + CONTENT_TOP_GAP }]}
        pointerEvents="box-none"
      >
        <BrandAppBar showActions={false} transparent />
      </View>

      {/* Nothing to wait for here — the veil fades at once, so entering the
          tab reads as the same soft cross-fade as the data-backed tabs. */}
      <TabLoading ready />
    </View>
  );
}

const styles = StyleSheet.create({
  /** Sky, not cream: the artwork is bottom-anchored, so on a tall phone this is
      what fills the band above it — and the top of the design is solid sky. */
  screen: { flex: 1, backgroundColor: Brand.sky, overflow: "hidden" },
  art: { position: "absolute", left: 0 },
  fill: { width: "100%", height: "100%" },
  chrome: { position: "absolute", left: 0, right: 0, top: 0 },
  nestLabel: {
    position: "absolute",
    fontFamily: Fonts.display,
    color: Brand.cream,
    // With the label spanning its nest, this is what does the centring.
    textAlign: "center",
  },
  pressed: { opacity: 0.82 },
});
