import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  ErrorText,
  FormField,
  PrimaryButton,
  Screen,
  ScreenHeader,
} from "../components/ui";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { NexusError } from "../lib/nexus";

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(false);

  const canSubmit =
    email.trim().length > 0 && password.length >= 6 && !submitting;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await signUp({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
      });
      if (result.pending) {
        // Approval-required gate: account created, no session yet.
        setPending(true);
      }
      // Otherwise the session is live — the root AuthGate routes to onboarding.
    } catch (e) {
      setError(e instanceof NexusError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (pending) {
    return (
      <Screen>
        <ScreenHeader title="Create account" showBack={false} />
        <View style={styles.pendingBody}>
          <Text style={styles.pendingTitle}>Request received ✓</Text>
          <Text style={styles.pendingText}>
            Your account was created and is awaiting approval from the program
            administrator. You'll be able to sign in once you're approved.
          </Text>
          <PrimaryButton label="Back to start" onPress={() => router.replace("/")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Create account" />
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Join the Bridge Program at Life in AI Center.
          </Text>
          <FormField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoComplete="name"
          />
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <FormField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry
          />
          <ErrorText message={error} />
        </ScrollView>

        <View style={styles.actions}>
          <PrimaryButton
            label={submitting ? "Creating account…" : "Create account"}
            onPress={handleSubmit}
            disabled={!canSubmit}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: Spacing.screen,
  },
  form: {
    flex: 1,
    paddingTop: 8,
  },
  intro: {
    fontSize: 15,
    color: Colors.textMuted,
    marginBottom: 20,
    fontFamily: Fonts.body,
  },
  actions: {
    paddingBottom: 24,
  },
  pendingBody: {
    flex: 1,
    paddingHorizontal: Spacing.screen,
    justifyContent: "center",
    gap: 16,
  },
  pendingTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
    fontFamily: Fonts.display,
  },
  pendingText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
    fontFamily: Fonts.body,
  },
});
