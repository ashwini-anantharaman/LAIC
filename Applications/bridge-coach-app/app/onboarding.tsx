import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { OptionCard, PrimaryButton, Screen } from "../components/ui";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";

const LEVELS = [
  { id: "beginner", title: "Beginner", subtitle: "Just starting out" },
  {
    id: "advanced-beginner",
    title: "Advanced Beginner",
    subtitle: "Know basics, learning more",
  },
  {
    id: "intermediate",
    title: "Intermediate",
    subtitle: "Understand the concepts",
  },
  {
    id: "advanced-intermediate",
    title: "Advanced Intermediate",
    subtitle: "Strong foundation, improving",
  },
];

export default function OnboardingScreen() {
  const { completeOnboarding } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Screen style={styles.screen}>
      <View style={styles.headerBlock}>
        <Text style={styles.title}>What is your current level?</Text>
        <Text style={styles.subtitle}>Select your bridge level.</Text>
      </View>

      <View style={styles.options}>
        {LEVELS.map((level, i) => (
          <OptionCard
            key={level.id}
            index={i}
            title={level.title}
            subtitle={level.subtitle}
            selected={selected === level.id}
            onPress={() => setSelected(level.id)}
          />
        ))}
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label="Continue"
          disabled={!selected}
          onPress={() => {
            completeOnboarding();
            router.replace("/home");
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: Spacing.screen,
  },
  headerBlock: {
    paddingTop: 32,
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.text,
    fontFamily: Fonts.display,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
  },
  options: {
    flex: 1,
    paddingTop: 24,
    gap: 12,
  },
  actions: {
    paddingBottom: 24,
  },
});
