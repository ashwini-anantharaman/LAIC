// Your password — set for the first time, or changed later.
//
// TWO MODES, and the FACT decides which, not a route parameter:
//
//   FORCED (`user.must_set_password`) — the first thing after signing in with a
//     password an admin handed you (backend 0046). Not a nag screen; it is where
//     ownership of the credential changes hands. One credential is shared across
//     every club a person belongs to, so while the password is still the one a club
//     typed, that club can sign in as them — and into their OTHER clubs. Choosing
//     their own ends that, and the console refuses admin resets from then on. No
//     back arrow, no dismiss: sign out is the only way past it.
//
//   VOLUNTARY — reached from the profile sheet, because a password you can set once
//     and never change is not really yours. Has a back arrow, returns where it came
//     from, and does not offer sign-out (the profile sheet already does).
//
// Keying the difference off `must_set_password` rather than a `?mode=` parameter is
// deliberate: a parameter would let anything navigate to a DISMISSIBLE copy of the
// forced screen, which is the one thing this screen must never be.

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
import { notify } from "../lib/dialogs";
import { changeMyPassword } from "../lib/nexus";

const MIN_LENGTH = 8;

export default function SetPasswordScreen() {
  const { token, user, signOut, refreshUser } = useAuth();
  /** The gate sent us here and will not let us leave until this is done. */
  const forced = user?.must_set_password === true;
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
      if (forced) {
        router.replace("/home");
      } else {
        // Back where they came from, with the change confirmed — a silent return
        // from a security screen leaves someone wondering whether it took.
        notify("Password changed", "Use your new password next time you sign in.");
        if (router.canGoBack()) router.back();
        else router.replace("/home");
      }
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
          {/* The arrow exists only when there is somewhere to go. */}
          {!forced ? (
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={26} color={Brand.cream} />
            </Pressable>
          ) : null}

          <Text style={styles.title}>{forced ? "Choose a password" : "Change your password"}</Text>
          <Text style={styles.blurb}>
            {forced
              ? "Your club set a temporary one so you could get in. Pick your own now — after this, only you can change it."
              : "You'll need your current password. The new one takes effect the next time you sign in."}
          </Text>

          <Field
            label={forced ? "Temporary password" : "Current password"}
            value={current}
            onChange={setCurrent}
            placeholder={forced ? "The one your club gave you" : "The one you use now"}
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

          {/* The only way past the FORCED screen other than setting one. Absent in
              the voluntary case, where the profile sheet already offers it and a
              second sign-out beside a back arrow only invites a misclick. */}
          {forced ? (
            <Pressable
              onPress={() => void signOut()}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
            >
              <Text style={styles.signOutText}>Sign out{user?.email ? ` (${user.email})` : ""}</Text>
            </Pressable>
          ) : null}
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
  // This screen is where someone INVENTS a password they cannot yet have saved
  // anywhere, and a typo here locks them out until an admin issues a claim code —
  // so being able to see what was typed matters more here than on sign-in.
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.field}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.5)"
          style={[styles.input, styles.inputWithAction]}
          secureTextEntry={!revealed}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          onPress={() => setRevealed((v) => !v)}
          hitSlop={10}
          style={styles.fieldAction}
          accessibilityRole="button"
          accessibilityLabel={revealed ? "Hide password" : "Show password"}
        >
          <Ionicons
            name={revealed ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={Brand.cream}
          />
        </Pressable>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Brand.cream },
  /** Sits above the title, on the same left margin as the fields. */
  back: { alignSelf: "flex-start", paddingHorizontal: 22, paddingBottom: 6 },
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
  /** Room for the reveal toggle, so a long password never runs under the glyph. */
  inputWithAction: { paddingRight: 40 },
  fieldAction: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: "center",
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
