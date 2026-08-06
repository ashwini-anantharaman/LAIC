// The floating BirdBridge tab bar — liquid glass, and swipe-aware.
//
// Design (Figma home frame, 390pt wide): a 356x67 rounded bar inset 19pt from
// each edge, sitting 20pt off the bottom, filled with a translucent pink wash
// (rgba(255,185,185,0.2)) so the tree behind it reads through.
//
// "Glass" is a real backdrop blur (expo-blur): the artwork behind the bar is
// sampled and frosted, the design's pink wash sits on top as the tint, and a
// cream hairline catches the edge.
//
// The active pane is driven by the pager's `position` — a value that moves
// continuously as you drag — so the marker travels WITH your finger mid-swipe and
// lands exactly when the page does. Interpolating that value is why this uses
// react-native's Animated here rather than Reanimated: `position` comes from
// react-native-tab-view as an RN Animated node.
//
// One departure from the static frame: it hand-places six icons at uneven offsets
// and only ever shows Home active, so its 64.9pt block doesn't describe the other
// five positions. Six equal slots are used, marker one slot wide.

import type { MaterialTopTabBarProps } from "@react-navigation/material-top-tabs";
import { BlurView } from "expo-blur";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SvgXml } from "react-native-svg";

import {
  ICON_ANALYSIS,
  ICON_CLUB,
  ICON_COACH,
  ICON_HOME,
  ICON_LEARN,
  ICON_PLAY,
} from "../constants/brand-vectors";
import { tintSvg } from "./svg-tint";
import { Brand, Fonts, Type } from "../constants/theme";

const DESIGN_WIDTH = 390;

/**
 * Route name → label + vector icon + the icon's design size. The icons are SVG
 * rather than the @1x PNGs, which were 29x32 actual pixels drawn at 29x32pt and
 * so tripled on a 3x screen.
 *
 * They ship cream (for a dark bar) but are tinted to #292929: over the cream
 * screens the glass bar reads light, where cream glyphs washed out.
 */
const TABS: Record<string, { label: string; icon: string; w: number; h: number }> = {
  home: { label: "Home", icon: tintSvg(ICON_HOME, Brand.iconDark), w: 29, h: 32 },
  learn: { label: "Learn", icon: tintSvg(ICON_LEARN, Brand.iconDark), w: 29, h: 32.22 },
  play: { label: "Play", icon: tintSvg(ICON_PLAY, Brand.iconDark), w: 33, h: 33 },
  coach: { label: "Coach", icon: tintSvg(ICON_COACH, Brand.iconDark), w: 33, h: 33 },
  club: { label: "Club", icon: tintSvg(ICON_CLUB, Brand.iconDark), w: 24, h: 17.45 },
  analysis: {
    label: "Analysis",
    icon: tintSvg(ICON_ANALYSIS, Brand.iconDark),
    w: 22,
    h: 34.22,
  },
};

export function BrandTabBar({
  state,
  position,
  jumpTo,
  navigation,
}: MaterialTopTabBarProps) {
  const { width } = useWindowDimensions();
  const s = width / DESIGN_WIDTH;

  const barWidth = 356 * s;
  const barHeight = 67 * s;
  const radius = 22 * s;
  const count = state.routes.length;
  const slot = barWidth / count;

  const inputRange = state.routes.map((_, i) => i);

  // Marker follows the drag, not the commit.
  const markerX = position.interpolate({
    inputRange,
    outputRange: inputRange.map((i) => i * slot),
    extrapolate: "clamp",
  });

  return (
    <View style={[styles.host, { height: barHeight + 20 * s }]} pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          { width: barWidth, height: barHeight, borderRadius: radius, bottom: 20 * s },
        ]}
      >
        {/* Pane 1: the frosted backdrop. */}
        <BlurView
          intensity={Platform.OS === "android" ? 40 : 26}
          tint="dark"
          // Android needs the experimental implementation to blur at all.
          experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
          style={StyleSheet.absoluteFill}
        />
        {/* Pane 2: the design's pink wash, tinting the glass. */}
        <View style={[StyleSheet.absoluteFill, styles.wash]} />
        {/* Pane 3: the edge highlight that reads as a glass rim. */}
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius }, styles.rim]} />

        {/* The active pane, gliding with the swipe. */}
        <Animated.View
          style={[
            styles.marker,
            {
              width: slot,
              height: barHeight,
              borderRadius: radius,
              transform: [{ translateX: markerX }],
            },
          ]}
        >
          <BlurView
            intensity={Platform.OS === "android" ? 60 : 40}
            tint="light"
            experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.markerTint]} />
        </Animated.View>

        {state.routes.map((route, i) => {
          const meta = TABS[route.name];
          if (!meta) return null;

          // Fade with the swipe too, so icons brighten as their page arrives.
          const opacity = position.interpolate({
            inputRange,
            outputRange: inputRange.map((j) => (j === i ? 1 : 0.65)),
            extrapolate: "clamp",
          });

          // jumpTo takes a route KEY, not a name: it resolves the target with
          // routes.findIndex(r => r.key === key), and an unmatched key yields
          // -1, which the navigator then reads as routes[-1] and crashes on.
          const go = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!event.defaultPrevented) jumpTo(route.key);
          };

          return (
            <Pressable
              key={route.key}
              // Web: fire on pointer DOWN. A touch tap wobbles a few pixels,
              // and anything watching for drags can steal the touch before
              // release — press-in is immune, and a browser tab bar has no
              // press-cancel gesture to respect anyway. Native keeps onPress.
              {...(Platform.OS === "web" ? { onPressIn: go } : { onPress: go })}
              accessibilityRole="button"
              accessibilityState={{ selected: state.index === i }}
              accessibilityLabel={meta.label}
              style={[styles.slot, { width: slot }]}
            >
              <Animated.View style={{ opacity }}>
                <SvgXml xml={meta.icon} width={meta.w * s} height={meta.h * s} />
              </Animated.View>
              <Animated.Text
                style={[styles.label, { fontSize: Type.tabLabel * s, opacity }]}
                numberOfLines={1}
              >
                {meta.label}
              </Animated.Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    // Clips the blur panes to the rounded shape.
    overflow: "hidden",
    // A faint maroon body so the glass keeps the brand's colour when there is
    // little contrast behind it.
    backgroundColor: "rgba(84,16,21,0.34)",
  },
  wash: { backgroundColor: Brand.tabWash },
  rim: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "rgba(255,244,215,0.28)",
  },
  marker: {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "hidden",
  },
  markerTint: { backgroundColor: "rgba(255,244,215,0.16)" },
  slot: { alignItems: "center", justifyContent: "center", gap: 3 },
  label: {
    fontFamily: Fonts.body,
    color: Brand.cream,
    includeFontPadding: false,
  },
});
