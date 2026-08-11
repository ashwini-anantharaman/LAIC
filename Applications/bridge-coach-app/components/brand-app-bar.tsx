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
  ICON_BIRD_GLYPH,
  ICON_GEAR,
  ICON_MENU,
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

      {showWordmark ? (
        <View style={styles.wordmarkRow}>
          <Text style={styles.wordmark}>BridgeBird</Text>
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
  /** Matches the glyph's 30.5pt box, circular like everywhere else. */
  avatarPhoto: { width: 30, height: 30, borderRadius: 15 },
  pressed: { opacity: 0.55 },
});
