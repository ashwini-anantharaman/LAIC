// Menu — the sheet behind the ☰ in the top app bar.
//
// It rises from the bottom exactly like Profile and Settings, so all three pieces
// of header chrome behave the same way. It replaces the old full-screen /menu
// route.
//
// Rows are green-on-maroon like the Profile sheet's fields rather than the
// cream-background OptionCards used on ordinary screens — those would fight the
// maroon panel.

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Brand, Fonts, Radius, Type } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { getBridgeContextCached, isCoach, peekRoleContext } from "../lib/bridge-role";
import { prewarmBridgePages } from "../lib/prewarm";

// PARKED, NOT DELETED (owner decision 2026-08-07). Three rows came off this
// menu: Today and Library have no version either role wants yet, and My Games
// moved to where boards already live — the Play tab. The routes, the screens
// and everything behind them stay wired; a row returns by setting `show: true`.
const ITEMS: { label: string; hint: string; href: Href; coachOnly?: boolean; show?: boolean }[] = [
  { label: "Today", hint: "What's waiting for you right now", href: "/today", show: false },
  { label: "Library", hint: "Boards, deals, tables and collections", href: "/library", coachOnly: true, show: false },
  { label: "My Games", hint: "Boards you've played — send one for feedback", href: "/plays", show: false },
  { label: "Account details", hint: "Role, program and organisation", href: "/profile" },
];

export function MenuSheetBody({ onClose }: { onClose: () => void }) {
  const { user, token } = useAuth();
  // The sign-in prime usually has the role cached already — read it NOW so a
  // coach-only row is there the moment the sheet rises, not a fetch later.
  // Learner until proven coach stays the fallback for an unprimed cache.
  const [coach, setCoach] = useState(() => isCoach(token ? peekRoleContext(token) : null));

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    getBridgeContextCached(token).then((ctx) => {
      if (!cancelled) setCoach(isCoach(ctx));
    });
    // Nothing to warm while the parked rows are off: every remaining row is a
    // native screen. Warming follows the rows, so it comes back with them.
    return () => {
      cancelled = true;
    };
  }, [token]);

  const go = (href: Href) => {
    // Dismiss first so the sheet isn't left open behind the pushed screen.
    onClose();
    router.push(href);
  };

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Text style={styles.who}>{user?.display_name ?? "Your account"}</Text>
      <Text style={styles.email}>{user?.email ?? ""}</Text>

      <View style={styles.rows}>
        {ITEMS.filter((item) => item.show !== false && (coach || !item.coachOnly)).map((item) => (
          <Pressable
            key={item.label}
            onPress={() => go(item.href)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowHint}>{item.hint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Brand.cream} />
          </Pressable>
        ))}
      </View>
      {/* Sign out lives in the Profile sheet, not here. */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 48 },
  who: {
    fontFamily: Fonts.heading,
    fontSize: Type.sectionHeading,
    color: Brand.cream,
  },
  email: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: "rgba(255,244,215,0.7)",
    marginTop: 2,
  },
  rows: { marginTop: 22, gap: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: Brand.green,
    borderWidth: 2,
    borderColor: Brand.cream,
    borderRadius: Radius.field,
  },
  rowBody: { flex: 1 },
  rowLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: 16,
    color: Brand.white,
  },
  rowHint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
    marginTop: 2,
  },
  pressed: { opacity: 0.7 },
});
