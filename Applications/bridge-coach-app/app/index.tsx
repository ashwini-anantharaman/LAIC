// The landing page (Figma 617:3799): three birds in flight, the blinking owl
// above the BridgeBird wordmark, two stacked buttons, and the hills running off
// the bottom edge.
//
// Laid out in the design's 390x852 space and scaled to the real screen width,
// like Home — so the birds keep their relationship to the wordmark on any phone.
// The block is anchored to the BOTTOM: the hills must reach the screen edge, and
// extra height on a taller phone opens up at the top where only sky sits.
//
// The hills are the SAME node as Home's, at the same position — reusing
// HILLS_SVG keeps one asset for both screens.
//
// The buttons use the deck's stacked-card trick (a darker card offset behind the
// face), the same device as the playing cards and the leaderboard rows.

import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { HILLS_SVG, ICON_BIRD_FLIGHT } from "../constants/brand-vectors";
import { Brand, Fonts } from "../constants/theme";

const DESIGN = { width: 390, height: 852 };

/** Hills: same placement as Home. */
const HILLS = { top: 625, width: 390, height: 223 };

/**
 * The wordmark's baseline block. The design pins it at x=92, which is simply
 * where "Bridge Bird" lands when centred at this size — so it is CENTRED here
 * rather than left-pinned, and a longer or shorter name stays centred instead of
 * drifting off the birds it sits under.
 */
const WORDMARK = { top: 302, size: 38.17 };

/**
 * One bird = one shared vector rotated three ways (all three Figma nodes carry
 * identical path data). Each entry is the rotation container's frame in design
 * space; the bird sits centred inside it and spins about that centre, which is
 * how the frame composes it.
 */
const BIRD = { width: 86.125, height: 47.777 };
const BIRDS = [
  { left: 267.95, top: 93, width: 97.24, height: 90.776, rotate: -38.15 },
  { left: 318.41, top: 107.32, width: 93.709, height: 95.548, rotate: -46.94 },
  { left: 216.32, top: 128.38, width: 94.595, height: 94.769, rotate: -45.18 },
] as const;

/**
 * The owl's head, above the wordmark, blinking.
 *
 * Geometry is derived from the design rather than eyeballed. Figma places the
 * artwork in a 133 x 109.79 window at (128, 194) and scales the whole canvas to
 * 144.97% / 251.41% with negative offsets — the designer dropped the full asset in
 * and cropped to the head. Resolving that crop against the asset's own content
 * bounds puts the head at 122.8 x 99.4 from (134.2, 201.4): horizontally centred
 * (134.2 + 61.4 = 195.6, half of 390) and ending at 300.8, which is where the
 * wordmark starts at 302.
 */
const OWL = { left: 134.2, top: 201.4, width: 122.8, height: 99.4 };

/** 8 fps, as asked — 125 ms a frame. */
const OWL_FRAME_MS = 1000 / 8;

/**
 * The three frames, cropped from the delivered art to their SHARED content box so
 * the head is registered across all three. Trimming each one independently would
 * shift it a pixel or two per frame, which at 8 fps reads as a wobble rather than
 * as a blink.
 */
const OWL_FRAMES = [
  require("../assets/images/owl-blink-1.png"),
  require("../assets/images/owl-blink-2.png"),
  require("../assets/images/owl-blink-3.png"),
] as const;

/**
 * All three frames stay MOUNTED and opacity switches between them, rather than one
 * image swapping its source. Swapping decodes on demand, so the first pass through
 * the loop stutters and can flash empty; mounting them decodes once, up front, and
 * every later frame is a compositor change.
 *
 * Its own component so the ticking state re-renders three images and nothing else
 * on the page.
 */
function BlinkingOwl({ scale: s }: { scale: number }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % OWL_FRAMES.length), OWL_FRAME_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <View
      style={{
        position: "absolute",
        left: OWL.left * s,
        top: OWL.top * s,
        width: OWL.width * s,
        height: OWL.height * s,
      }}
      pointerEvents="none"
    >
      {OWL_FRAMES.map((src, i) => (
        <Image
          key={i}
          source={src}
          // contain, so the art keeps its aspect if the box is ever rounded off.
          contentFit="contain"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            opacity: i === frame ? 1 : 0,
          }}
          // No fade: a cross-fade between frames would blur the blink into a
          // dissolve at this speed.
          transition={0}
        />
      ))}
    </View>
  );
}

/** Button geometry: the face, and the card behind it. */
const BUTTON = {
  left: 85,
  width: 220,
  height: 72,
  radius: 30,
  /** The shadow card is 4 wider and sits 4 lower. */
  offset: 4,
};
const GET_STARTED_TOP = 422;
const LOGIN_TOP = 524;

function StackedButton({
  label,
  top,
  onPress,
  scale: s,
}: {
  label: string;
  top: number;
  onPress: () => void;
  scale: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          position: "absolute",
          left: BUTTON.left * s,
          top: top * s,
          width: (BUTTON.width + BUTTON.offset) * s,
          height: (BUTTON.height + BUTTON.offset) * s,
        },
        pressed && styles.pressed,
      ]}
    >
      {/* The card behind, peeking out right and below. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          top: BUTTON.offset * s,
          width: (BUTTON.width + BUTTON.offset) * s,
          height: BUTTON.height * s,
          borderRadius: BUTTON.radius * s,
          backgroundColor: Brand.rowShadow,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: BUTTON.width * s,
          height: BUTTON.height * s,
          borderRadius: BUTTON.radius * s,
          backgroundColor: Brand.green,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={[styles.buttonText, { fontSize: 24.035 * s }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export default function LandingScreen() {
  const { width, height } = useWindowDimensions();
  const s = width / DESIGN.width;
  const artHeight = DESIGN.height * s;

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.art,
          { top: height - artHeight, width: DESIGN.width * s, height: artHeight },
        ]}
        pointerEvents="box-none"
      >
        <View style={{ position: "absolute", left: 0, top: HILLS.top * s }} pointerEvents="none">
          <SvgXml xml={HILLS_SVG} width={HILLS.width * s} height={HILLS.height * s} />
        </View>

        {BIRDS.map((bird, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: bird.left * s,
              top: bird.top * s,
              width: bird.width * s,
              height: bird.height * s,
              alignItems: "center",
              justifyContent: "center",
            }}
            pointerEvents="none"
          >
            <View style={{ transform: [{ rotate: `${bird.rotate}deg` }] }}>
              <SvgXml
                xml={ICON_BIRD_FLIGHT}
                width={BIRD.width * s}
                height={BIRD.height * s}
              />
            </View>
          </View>
        ))}

        {/* Above the wordmark, and the only moving thing on the page. */}
        <BlinkingOwl scale={s} />

        <Text
          style={[styles.wordmark, { top: WORDMARK.top * s, fontSize: WORDMARK.size * s }]}
          numberOfLines={1}
        >
          BridgeBird
        </Text>

        <StackedButton
          label="Get Started"
          top={GET_STARTED_TOP}
          onPress={() => router.push("/register")}
          scale={s}
        />
        <StackedButton
          label="Login"
          top={LOGIN_TOP}
          onPress={() => router.push("/login")}
          scale={s}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Brand.cream, overflow: "hidden" },
  art: { position: "absolute", left: 0 },
  wordmark: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: Fonts.display,
    color: Brand.ink,
  },
  buttonText: {
    fontFamily: Fonts.display,
    color: Brand.white,
  },
  pressed: { opacity: 0.85 },
});
