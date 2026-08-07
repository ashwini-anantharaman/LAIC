import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";

import {
  ErrorText,
  FormField,
  PrimaryButton,
  Screen,
  ScreenHeader,
} from "../components/ui";
import { Spacing } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { NexusError } from "../lib/nexus";
import { startPrewarmAll } from "../lib/prewarm";

export default function LoginScreen() {
  const { signIn } = useAuth();

  // The learner is about to type a password — dead time. Warm every backend
  // NOW; signIn holds the door until the sweep settles.
  useEffect(() => {
    startPrewarmAll();
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // The root AuthGate redirects to /home once the session is live.
    } catch (e) {
      setError(
        e instanceof NexusError && e.status === 401
          ? "Invalid email or password."
          : e instanceof NexusError
            ? e.message
            : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Log in" />
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.form}>
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
            placeholder="Your password"
            secureTextEntry
          />
          <ErrorText message={error} />
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label={submitting ? "Signing in…" : "Continue"}
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
    paddingTop: 16,
  },
  actions: {
    paddingBottom: 24,
  },
});
