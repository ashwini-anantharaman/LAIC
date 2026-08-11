// Home — the Bridge Bird tree. Five nests are the five destinations; the top
// app bar carries the menu, settings, cards and profile.
//
// The artwork and the nests are laid out in the Figma frame's coordinate space
// (390x852) and scaled to the real screen width, so a nest always lands on its
// branch. The block is anchored to the BOTTOM: the tree and hills run to the
// screen edge, and any extra height on a taller phone opens up at the top,
// where only the cream app bar sits.
//
// The tree is IDENTICAL for both roles. Everything coach-specific lives behind
// the Menu drawer's coach-only "Other" section instead of changing the tree or
// the tab bar, so there is one
// home screen to design and one navigation model to reason about.

import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

import { JigglingOwl } from "../../components/jiggling-owl";
import { BrandAppBar } from "../../components/brand-app-bar";
import { CONTENT_TOP_GAP } from "../../components/brand-chrome";
import { WindTree } from "../../components/wind-tree";
import { BrandArt } from "../../constants/brand-assets";
import { HILLS_SVG } from "../../constants/brand-vectors";
import { Brand, Fonts, Type } from "../../constants/theme";

const DESIGN = { width: 390, height: 852 };

/** Nest positions, labels and destinations — all in design coordinates. */
const NESTS = [
  { key: "play", label: "Play", href: "/play", x: 30, y: 203, w: 151, h: 91.5, lx: 86, ly: 220 },
  { key: "learn", label: "Learn", href: "/learn", x: 204, y: 229, w: 151, h: 91.5, lx: 255, ly: 246 },
  { key: "coach", label: "Coach", href: "/coach", x: 49, y: 416, w: 151, h: 91.5, lx: 97, ly: 434 },
  { key: "club", label: "Club", href: "/club", x: 231, y: 446, w: 151, h: 91.5, lx: 270, ly: 462 },
  {
    key: "analysis",
    label: "Analysis",
    href: "/analysis",
    x: 221,
    y: 562,
    w: 163,
    h: 98.8,
    lx: 268,
    ly: 582,
    labelSize: Type.nestLabel - 1.2,
  },
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
        {/* Hills + sun, then the tree over them — both true vectors, so they
            stay sharp at any density and the tree's transparency lets the
            sunset read through the branches. The trunk is static (the nests are
            pinned to its branches); only the leaves catch the wind. */}
        <View style={{ position: "absolute", left: 0, top: 625 * s }}>
          <SvgXml xml={HILLS_SVG} width={390 * s} height={223 * s} />
        </View>
        <View style={{ position: "absolute", left: 0, top: 132 * s }}>
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
                left: nest.lx * s,
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
        <BrandAppBar showActions={false} />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Brand.cream, overflow: "hidden" },
  art: { position: "absolute", left: 0 },
  fill: { width: "100%", height: "100%" },
  chrome: { position: "absolute", left: 0, right: 0, top: 0 },
  nestLabel: {
    position: "absolute",
    fontFamily: Fonts.display,
    color: Brand.cream,
  },
  pressed: { opacity: 0.82 },
});
