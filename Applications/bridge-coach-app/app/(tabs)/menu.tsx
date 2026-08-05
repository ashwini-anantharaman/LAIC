// Menu — everything that doesn't earn a tab. Profile and Library live here
// (Library is the full platform library: shelves, collections, and creation
// when your role allows it), and this is where future settings/help land.

import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { OptionCard, Screen } from "../../components/ui";
import { Colors, Spacing } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";

export default function MenuScreen() {
  const { user, signOut } = useAuth();

  return (
    <Screen style={styles.screen}>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>Menu</Text>
        <Text style={styles.title}>{user?.display_name ?? "Your account"}</Text>
        <Text style={styles.subtitle}>{user?.email ?? ""}</Text>
      </View>

      <View style={styles.options}>
        <OptionCard
          title="Library"
          subtitle="Boards, deals, tables and collections"
          onPress={() => router.push("/library")}
        />
        <OptionCard
          title="My Games"
          subtitle="Boards you've played — send one for feedback"
          onPress={() => router.push("/plays")}
        />
        <OptionCard
          title="Profile"
          subtitle="Your account and program details"
          onPress={() => router.push("/profile")}
        />
      </View>

      <Pressable style={styles.signOut} onPress={signOut} hitSlop={8}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: Spacing.screen },
  headerBlock: { paddingTop: 32, gap: 3 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.textMuted,
  },
  title: { fontSize: 26, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 13.5, color: Colors.textMuted },
  options: { flex: 1, paddingTop: 24, gap: 12 },
  signOut: { alignItems: "center", paddingBottom: 12 },
  signOutText: { fontSize: 14, fontWeight: "600", color: Colors.textMuted },
});
