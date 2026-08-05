import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PrimaryButton, Screen } from "../components/ui";
import { Colors, Spacing } from "../constants/theme";

export default function LandingScreen() {
  return (
    <Screen style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.logo}>♠</Text>
        <Text style={styles.title}>Bridge Coach</Text>
        <Text style={styles.tagline}>
          Learn bridge by playing real hands, with guided coaching every step
          of the way.
        </Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Get Started" onPress={() => router.push("/register")} />
        <Pressable onPress={() => router.push("/login")} hitSlop={8}>
          <Text style={styles.secondaryAction}>I already have an account</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: Spacing.screen,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  logo: {
    fontSize: 56,
    color: Colors.text,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.text,
  },
  tagline: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 300,
  },
  actions: {
    gap: 16,
    paddingBottom: 24,
  },
  secondaryAction: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "500",
    color: Colors.text,
  },
});
