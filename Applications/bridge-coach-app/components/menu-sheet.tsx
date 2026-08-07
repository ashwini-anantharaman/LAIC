// Menu — the sheet behind the ☰ in the top app bar.
//
// COACH-ONLY. A learner has nothing here — their destinations are all on the tree
// and the tab bar — so the ☰ is hidden for them entirely (see BrandChrome) rather
// than opening an empty sheet.
//
// Holding the coach's own surfaces here is what lets the tree and the tab bar stay
// IDENTICAL for both roles: Learners, Assignments and Reviews get their own
// buttons (they used to be buried inside a "Today" feed), alongside Library.
//
// Rows are green-on-maroon like the Profile sheet's fields rather than the
// cream-background OptionCards used on ordinary screens — those would fight the
// maroon panel.

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Brand, Fonts, Radius, TAB_BAR_CLEARANCE, Type } from "../constants/theme";
import { useAuth } from "../lib/auth-context";

const ITEMS: { label: string; hint: string; href: Href }[] = [
  { label: "Learners", hint: "Your roster, history and feedback threads", href: "/learners" },
  { label: "Assignments", hint: "Boards you've delegated, and who has finished", href: "/assignments" },
  { label: "Reviews", hint: "Plays your learners sent for feedback", href: "/reviews" },
  { label: "Library", hint: "Boards, deals, tables and collections", href: "/library" },
];

export function MenuSheetBody({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();

  const go = (href: Href) => {
    // Dismiss first so the sheet isn't left open behind the pushed screen.
    onClose();
    router.push(href);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Text style={styles.who}>Coaching</Text>
      <Text style={styles.email}>{user?.email ?? ""}</Text>

      <View style={styles.rows}>
        {ITEMS.map((item) => (
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
      {/* Account details and Sign out live in the Profile sheet. */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { paddingHorizontal: 22, paddingBottom: TAB_BAR_CLEARANCE + 32 },
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
