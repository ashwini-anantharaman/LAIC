// The landing page (Figma 617:3799): three birds in flight, the Bridge Bird
// wordmark, two stacked buttons, and the hills running off the bottom edge.
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

import { router } from "expo-router";
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
