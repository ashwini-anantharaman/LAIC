// The Bridge Bird wordmark, and — historically — the row of actions above it.
//
// Those actions are GONE. ☰ Menu, ⚙ Settings and the avatar all opened sheets
// that now live inside the tab bar's Menu drawer, so the icon row would be an
// empty 54pt band. With showActions off (which is every caller today) the row is
// not rendered at all, and the wordmark rides up into the space — the same lift
// every other screen took when the bar went.
//
// The row itself is kept rather than deleted: it is one prop away if a future
// design wants a top action back.
//
// Icon geometry comes straight from the Figma app bar (54pt tall). The icons are
// vectors (dark-filled, for the cream bar) so they stay sharp — the supplied
// PNGs were @1x, e.g. the hamburger was 18x12 actual pixels drawn at 18x12pt.

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import {
  ICON_AVATAR,
  ICON_GEAR,
  ICON_MENU,
  LOGO_BIRD,
  LOGO_HEART,
} from "../constants/brand-vectors";
import { Brand, Fonts, Type } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { loadMyAvatar, subscribeToMyAvatar } from "../lib/avatar-store";

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
      // Web: fire on pointer DOWN, like the tab bar — a touch tap wobbles a
      // few pixels and anything watching for drags can steal it before
      // release, which read as "tap twice to open the menu". The sheets these
      // open guard against the same tap's click falling through onto their
      // backdrop (see BrandSheet). Native keeps onPress.
      {...(Platform.OS === "web" ? { onPressIn: onPress } : { onPress })}
      hitSlop={16}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <SvgXml xml={xml} width={width} height={height} />
    </Pressable>
  );
}

/**
 * The avatar button — your own picture once you have one, the glyph until then.
 *
 * It subscribes rather than taking a prop because the picture is set in the
 * Profile sheet this button opens: without that, changing it would leave the bar
 * showing the old face until the next launch.
 */
function ProfileButton({ onPress }: { onPress: () => void }) {
  const { token } = useAuth();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setUri(null);
      return;
    }
    let cancelled = false;
    loadMyAvatar(token).then((v) => !cancelled && setUri(v));
    const stop = subscribeToMyAvatar((v) => !cancelled && setUri(v));
    return () => {
      cancelled = true;
      stop();
    };
  }, [token]);

  if (!uri) {
    return (
      <BarIcon xml={ICON_AVATAR} width={30.5} height={29.58} label="Profile" onPress={onPress} />
    );
  }
  return (
    <Pressable
      {...(Platform.OS === "web" ? { onPressIn: onPress } : { onPress })}
      hitSlop={16}
      accessibilityRole="button"
      accessibilityLabel="Profile"
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Image source={{ uri }} style={styles.avatarPhoto} contentFit="cover" />
    </Pressable>
  );
}

/**
 * The lockup: "BridgeBird" with a heart over the i of "Bridge" and a bird over
 * the i of "Bird". It replaces the old wordmark-plus-trailing-glyph — the marks
 * are now part of the word, not an ornament beside it.
 *
 * The two marks are placed by measurement, not by the layout engine: they are
 * absolutely positioned inside the text's own box at the offsets Figma gives,
 * divided by the design's font size so they hold at any WORDMARK size. That
 * makes three things load-bearing, and all three are set explicitly below:
 *
 *  - `letterSpacing`. The design tracks +0.622, and the second i is seven
 *    characters in — drop the tracking and the bird lands ~4pt left of its stem.
 *  - `lineHeight`. The offsets are measured from the top of a 45pt text frame,
 *    so the box has to be that tall (45/31.098 em) for the vertical offset to
 *    mean the same thing.
 *  - `Fonts.display` (Neco Bold), which is what the offsets were measured
 *    against. A fallback face would shift every stem.
 */
function Wordmark() {
  const size = Type.wordmark;
  return (
    <View style={styles.wordmarkRow}>
      <Text style={[styles.wordmark, { fontSize: size, lineHeight: 1.4471 * size }]}>
        BridgeBird
      </Text>
      <View style={[styles.mark, { left: 1.2075 * size, top: 0.2727 * size }]}>
        <SvgXml xml={LOGO_HEART} width={0.3089 * size} height={0.2703 * size} />
      </View>
      {/* The bird's box is its STROKED extent. Figma reports the mask group at
          9.6x6.2, which is neither the path's bounds nor the mask rect's, and
          cropping to it shears the beak and the near wing off. */}
      <View style={[styles.mark, { left: 4.0252 * size, top: 0.217 * size }]}>
        <SvgXml xml={LOGO_BIRD} width={0.4027 * size} height={0.3273 * size} />
      </View>
    </View>
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
  /**
   * Home only. Its sky is a blue-to-cream gradient, so the bar's own cream fill
   * would sit on it as a visible band.
   */
  transparent = false,
}: {
  onMenu?: () => void;
  onSettings?: () => void;
  onProfile?: () => void;
  showWordmark?: boolean;
  showMenu?: boolean;
  showActions?: boolean;
  transparent?: boolean;
  /** Given on pushed screens, which are not tabs and so need a way back. */
  onBack?: () => void;
}) {
  return (
    <View style={transparent ? undefined : styles.host}>
      {showActions ? (
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
            <ProfileButton onPress={onProfile} />
          ) : null}
        </View>
      </View>
      ) : null}

      {showWordmark ? <Wordmark /> : null}
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
  /** `alignSelf` keeps the box the width of the word, so `mark` measures from
      the "B", not from the screen edge. */
  wordmarkRow: {
    alignSelf: "flex-start",
    position: "relative",
    marginLeft: 25,
    paddingBottom: 6,
  },
  wordmark: {
    fontFamily: Fonts.display,
    letterSpacing: 0.622,
    color: Brand.ink,
  },
  mark: { position: "absolute" },
  /** Matches the glyph's 30.5pt box, circular like everywhere else. */
  avatarPhoto: { width: 30, height: 30, borderRadius: 15 },
  pressed: { opacity: 0.55 },
});
