// The cream top app bar: menu + settings on the left, the avatar on the right,
// with the BirdBridge wordmark beneath it.
//
// The three actions (☰ Menu, ⚙ Settings, avatar Profile) live on HOME ONLY. Every
// other screen passes showActions={false} and gets an empty bar — which still
// occupies its 54pt, because every screen's layout is measured from the design's
// y=104, i.e. the bar's bottom edge. A pushed screen puts its back arrow there.
//
// Icon geometry comes straight from the Figma app bar (54pt tall). The icons are
// vectors (dark-filled, for the cream bar) so they stay sharp — the supplied
// PNGs were @1x, e.g. the hamburger was 18x12 actual pixels drawn at 18x12pt.

import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import {
  ICON_AVATAR,
  ICON_BIRD_GLYPH,
  ICON_GEAR,
  ICON_MENU,
} from "../constants/brand-vectors";
import { Brand, Fonts, Type } from "../constants/theme";

export const APP_BAR_HEIGHT = 54;

function BarIcon({
  xml,
  width,
  height,
  label,
  onPress,
}: {
  xml: string;
  width: number;
  height: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={16}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <SvgXml xml={xml} width={width} height={height} />
    </Pressable>
  );
}

export function BrandAppBar({
  onBack,
  onMenu,
  onSettings,
  onProfile,
  showWordmark = true,
  /** The ☰ is coach-only: a learner's menu would be empty. */
  showMenu = true,
  /** Home only. Elsewhere the bar keeps its height but carries no actions. */
  showActions = true,
}: {
  onMenu?: () => void;
  onSettings?: () => void;
  onProfile?: () => void;
  showWordmark?: boolean;
  showMenu?: boolean;
  showActions?: boolean;
  /** Given on pushed screens, which are not tabs and so need a way back. */
  onBack?: () => void;
}) {
  return (
    <View style={styles.host}>
      <View style={styles.bar}>
        <View style={styles.side}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Ionicons name="chevron-back" size={24} color={Brand.ink} />
            </Pressable>
          ) : null}
          {showActions && showMenu && onMenu ? (
            <BarIcon xml={ICON_MENU} width={18} height={12} label="Menu" onPress={onMenu} />
          ) : null}
          {showActions && onSettings ? (
            <BarIcon xml={ICON_GEAR} width={20.1} height={20} label="Settings" onPress={onSettings} />
          ) : null}
        </View>
        <View style={styles.side}>
          {/* The design's playing-card button is gone: it led to My Games, which
              the Menu sheet already lists. */}
          {showActions && onProfile ? (
            <BarIcon
              xml={ICON_AVATAR}
              width={30.5}
              height={29.58}
              label="Profile"
              onPress={onProfile}
            />
          ) : null}
        </View>
      </View>

      {showWordmark ? (
        <View style={styles.wordmarkRow}>
          <Text style={styles.wordmark}>BirdBridge</Text>
          <SvgXml xml={ICON_BIRD_GLYPH} width={21} height={16.99} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { backgroundColor: Brand.cream },
  bar: {
    height: APP_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
  },
  side: { flexDirection: "row", alignItems: "center", gap: 20 },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingLeft: 25,
    paddingBottom: 6,
  },
  wordmark: {
    fontFamily: Fonts.display,
    fontSize: Type.wordmark,
    color: Brand.ink,
  },
  pressed: { opacity: 0.55 },
});
