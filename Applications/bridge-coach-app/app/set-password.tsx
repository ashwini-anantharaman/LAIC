// Choose your own password — the first thing after signing in with one an admin
// handed you (backend 0046).
//
// This is not a nag screen; it is where ownership of the credential changes hands.
// One credential is shared across every club a person belongs to, so while the
// password is still the one a club typed, that club can sign in as them — and
// into their OTHER clubs. Choosing their own ends that, and the console refuses
// admin resets from then on.
//
// It has no back arrow and no dismiss for the same reason. Sign out is the only
// way past it.

import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand, Fonts, Radius, Type } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { changeMyPassword } from "../lib/nexus";

const MIN_LENGTH = 8;

export default function SetPasswordScreen() {
  const { token, user, signOut, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = again.length > 0 && next !== again;
  const ready =
    current.length > 0 && next.length >= MIN_LENGTH && next === again && !busy;

  async function submit() {
    if (!token || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await changeMyPassword(token, current, next);
      // The claim is server-side now; refreshing the session clears the flag that
      // sent us here, and the gate lets us through.
      await refreshUser();
      router.replace("/home");
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Couldn't set that password. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 44, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Choose a password</Text>
          <Text style={styles.blurb}>
            Your club set a temporary one so you could get in. Pick your own now — after
            this, only you can change it.
          </Text>

          <Field
            label="Temporary password"
            value={current}
            onChange={setCurrent}
            placeholder="The one your club gave you"
          />
          <Field
            label="New password"
            value={next}
            onChange={setNext}
            placeholder={`At least ${MIN_LENGTH} characters`}
            hint={tooShort ? `At least ${MIN_LENGTH} characters` : undefined}
          />
          <Field
            label="New password again"
            value={again}
            onChange={setAgain}
            placeholder="Type it once more"
            hint={mismatch ? "These don't match" : undefined}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={() => void submit()}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            style={({ pressed }) => [
              styles.save,
              !ready && styles.saveDisabled,
              pressed && ready && styles.pressed,
            ]}
          >
            <Text style={styles.saveText}>{busy ? "Saving…" : "Save password"}</Text>
          </Pressable>

          {/* The only way past this screen other than setting one. */}
          <Pressable
            onPress={() => void signOut()}
            hitSlop={8}
            accessibilityRole="button"
            style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
          >
            <Text style={styles.signOutText}>Sign out{user?.email ? ` (${user.email})` : ""}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.field}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.5)"
          style={styles.input}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Brand.cream },
  title: {
    fontFamily: Fonts.display,
    fontSize: Type.screenTitle,
    color: Brand.ink,
    paddingHorizontal: 25,
  },
  blurb: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: "rgba(31,31,31,0.7)",
    lineHeight: 22,
    paddingHorizontal: 25,
    paddingTop: 10,
    paddingBottom: 22,
  },
  fieldWrap: { paddingHorizontal: 25, paddingBottom: 16 },
  fieldLabel: {
    fontFamily: Fonts.display,
    fontSize: Type.fieldLabel,
    color: Brand.ink,
    paddingBottom: 8,
  },
  field: {
    height: 46,
    borderRadius: Radius.field,
    backgroundColor: Brand.green,
    borderWidth: 2,
    borderColor: Brand.cream,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  input: { fontFamily: Fonts.body, fontSize: 16, color: Brand.white, padding: 0 },
  hint: { fontFamily: Fonts.body, fontSize: 13, color: Brand.maroon, paddingTop: 6 },
  error: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Brand.maroon,
    paddingHorizontal: 25,
    paddingBottom: 12,
    lineHeight: 20,
  },
  save: {
    marginHorizontal: 25,
    marginTop: 8,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.green,
  },
  saveDisabled: { opacity: 0.45 },
  saveText: { fontFamily: Fonts.displayMedium, fontSize: 17, color: Brand.white },
  signOut: { alignSelf: "center", paddingTop: 26 },
  signOutText: { fontFamily: Fonts.body, fontSize: 14, color: "rgba(31,31,31,0.6)" },
  pressed: { opacity: 0.85 },
});
