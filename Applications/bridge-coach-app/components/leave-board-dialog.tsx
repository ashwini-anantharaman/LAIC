// The save-or-discard question, asked the app's way.
//
// Replaces window.confirm / Alert.alert for leaving an unfinished board
// (owner direction 2026-08-07: "an inside-the-application pop up,
// consistent with the theme"). One component for every platform, wearing
// Bridge Bird's own clothes: a cream card on a dimmed table, Neco heading,
// the app's pill buttons — green for the safe path, maroon for the
// destructive one, a quiet text row to stay put.
//
// An IN-TREE overlay, deliberately NOT a react-native Modal (2026-08-13):
// on the new architecture, dismissing a native Modal in the same commit
// that unmounts the quit pull-out, mounts the discard cover and navigates
// the WebView crashed the app outright on the phone — a native dismissal
// race, invisible on web where Modal is just a div. The dialog rides over
// a full-screen embed anyway, so a plain absolute-fill view (the same way
// the discard cover already layers over the WebView) asks the identical
// question with no native modal window to race.

import { Pressable, StyleSheet, Text, View } from "react-native";

import { Brand, Fonts, Radius } from "../constants/theme";

export function LeaveBoardDialog({
  visible,
  onSave,
  onDiscard,
  onStay,
}: {
  visible: boolean;
  /** Keep the board — it waits under Resume. */
  onSave: () => void;
  /** Delete the board — it never reaches Resume. */
  onDiscard: () => void;
  /** Close the dialog and stay at the table. */
  onStay: () => void;
}) {
  if (!visible) return null;
  return (
    // Tapping the dim felt means "I didn't mean it" — same as Stay.
    <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onStay}>
      {/* The card itself swallows its taps so a mis-aimed press on the
          padding never dismisses the question. */}
      <Pressable style={styles.card} onPress={() => {}}>
        <Text style={styles.title}>Leave this board?</Text>
        <Text style={styles.body}>
          You haven't finished it. Save your progress and it will wait for you under Resume.
        </Text>

        <View style={styles.buttons}>
          <Pressable
            onPress={onSave}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, styles.save, pressed && styles.pressed]}
          >
            <Text style={styles.buttonLabel}>Save for later</Text>
          </Pressable>
          <Pressable
            onPress={onDiscard}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, styles.discard, pressed && styles.pressed]}
          >
            <Text style={styles.buttonLabel}>Discard board</Text>
          </Pressable>
          <Pressable
            onPress={onStay}
            accessibilityRole="button"
            style={({ pressed }) => [styles.stay, pressed && styles.pressed]}
          >
            <Text style={styles.stayLabel}>Stay at the table</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(42,5,6,0.5)", // the card-shadow maroon, as a scrim
    alignItems: "center",
    justifyContent: "center",
    padding: 26,
    // Above the quit pull-out (30) and the back chip (20); the WebView is a
    // plain sibling underneath, exactly as it is for the discard cover.
    zIndex: 40,
    elevation: 40,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Brand.cream,
    borderRadius: Radius.card,
    padding: 22,
    // The app's stacked-edge: a card sitting on its darker shadow.
    shadowColor: Brand.cardShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 21,
    color: Brand.ink,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: "#5e5749",
    marginTop: 6,
  },
  buttons: { marginTop: 18, gap: 10 },
  button: {
    borderRadius: Radius.button,
    paddingVertical: 14,
    alignItems: "center",
  },
  save: { backgroundColor: Brand.green },
  discard: { backgroundColor: Brand.maroon },
  buttonLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: 15,
    color: Brand.white,
  },
  stay: {
    paddingVertical: 10,
    alignItems: "center",
  },
  stayLabel: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    color: Brand.ink,
    opacity: 0.75,
  },
  pressed: { opacity: 0.75 },
});
