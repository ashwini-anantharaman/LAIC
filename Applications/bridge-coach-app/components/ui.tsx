// Shared primitives. Restyling these is what carries the Bridge Bird look into
// every screen that has not been hand-designed yet.
//
// Type hierarchy (from the Learn design): a screen's main title is Neco Bold,
// headings are Neco Regular, and subheadings / body are General Sans Regular.
//
// Box colours follow the deck: cards are the maroon/green "suits" with cream and
// white type on them, and pass an `index` to alternate the way a dealt row does.

import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { ReactNode, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { leaveWithFade } from "./leave-veil";
import { Brand, Colors, Fonts, Radius, Spacing, Type } from "../constants/theme";

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <SafeAreaView style={[styles.screen, style]}>{children}</SafeAreaView>
  );
}

/** A screen's main title — Neco Bold. */
export function ScreenTitle({ children }: { children: string }) {
  return <Text style={styles.screenTitle}>{children}</Text>;
}

/** A section heading inside a screen — Neco Regular. */
export function SectionHeading({ children }: { children: string }) {
  return <Text style={styles.sectionHeading}>{children}</Text>;
}

export function ScreenHeader({
  title,
  showBack = true,
  backTo = "/home",
  onBack,
}: {
  title: string;
  showBack?: boolean;
  /**
   * Where to go when there is nothing to go BACK to — a reloaded web tab, a
   * deep link, a notification. `router.back()` is a silent no-op with an empty
   * history, which is indistinguishable from a dead button (reported
   * 2026-08-01: the arrow at a table "frozen").
   */
  backTo?: Href;
  /**
   * Intercept the arrow: receives the default navigation and decides if and
   * when to run it. What a table embed uses to ask "save or discard?" before
   * letting an unfinished board be left.
   */
  onBack?: (goBack: () => void) => void;
}) {
  const goBack = () =>
    leaveWithFade(() => (router.canGoBack() ? router.back() : router.replace(backTo)));
  return (
    <View style={styles.header}>
      {showBack ? (
        <Pressable
          onPress={() => (onBack ? onBack(goBack) : goBack())}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.backButton} />
      )}
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.backButton} />
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.primaryButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function OptionCard({
  title,
  subtitle,
  onPress,
  selected,
  /** Position in a list — alternates the suit colour like a dealt row. */
  index = 0,
  badge,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  selected?: boolean;
  index?: number;
  /** A count in a cream circle where the chevron would sit — how many things
   *  wait behind this card (unfinished boards, open assignments). */
  badge?: number;
}) {
  const suit = index % 2 === 0 ? Brand.maroon : Brand.green;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: suit },
        selected && styles.cardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge !== undefined && (
        <View style={styles.cardBadge}>
          <Text style={styles.cardBadgeText}>{badge}</Text>
        </View>
      )}
      {/* The chevron stays even beside a badge (owner request 2026-08-07):
          the count says how many, the arrow still says "this navigates". */}
      <Text style={styles.cardChevron}>›</Text>
    </Pressable>
  );
}

export function FormField({
  label,
  ...inputProps
}: { label: string } & TextInputProps) {
  // A masked field gets a reveal toggle. Typing a password you cannot see, on a
  // phone keyboard, is the most common reason a correct password gets rejected —
  // and the field is where the fix belongs, so login, register and the forced
  // password screen all get it from here.
  const masked = inputProps.secureTextEntry === true;
  const [revealed, setRevealed] = useState(false);

  const input = (
    <TextInput
      style={[styles.fieldInput, masked && styles.fieldInputWithAction]}
      placeholderTextColor="rgba(255,255,255,0.5)"
      {...inputProps}
      // The prop is re-derived rather than passed through, so a revealed field
      // really is unmasked even though the caller asked for secure entry.
      secureTextEntry={masked ? !revealed : inputProps.secureTextEntry}
    />
  );

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {masked ? (
        <View style={styles.fieldRow}>
          {input}
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            // Inside the field's own box, so the target is bigger than the glyph.
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
      ) : (
        input
      )}
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={styles.errorText}>{message}</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.cream,
  },

  // ── Type ────────────────────────────────────────────────────────────────
  screenTitle: {
    fontFamily: Fonts.display,
    fontSize: Type.screenTitle,
    color: Brand.ink,
  },
  sectionHeading: {
    fontFamily: Fonts.heading,
    fontSize: Type.sectionHeading,
    color: Brand.ink,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.screen,
    paddingVertical: 12,
  },
  backButton: {
    width: 32,
    alignItems: "flex-start",
  },
  backButtonText: {
    fontSize: 28,
    lineHeight: 30,
    color: Brand.ink,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 19,
    color: Brand.ink,
  },

  // ── Buttons ─────────────────────────────────────────────────────────────
  primaryButton: {
    backgroundColor: Brand.maroon,
    borderRadius: Radius.button,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.35,
  },
  primaryButtonText: {
    fontFamily: Fonts.bodySemibold,
    color: Brand.cream,
    fontSize: 16,
  },

  // ── Cards ───────────────────────────────────────────────────────────────
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: Radius.field,
    padding: Spacing.card,
  },
  cardSelected: {
    borderColor: Brand.cream,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: Fonts.displayMedium,
    fontSize: 16,
    color: Brand.white,
  },
  cardSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: "rgba(255,244,215,0.75)",
    marginTop: 3,
  },
  cardChevron: {
    fontSize: 22,
    color: Brand.cream,
    marginLeft: 8,
  },
  cardBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 8,
    backgroundColor: Brand.cream,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  cardBadgeText: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 14,
    color: Brand.ink,
  },

  // ── Fields ──────────────────────────────────────────────────────────────
  field: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontFamily: Fonts.heading,
    fontSize: Type.fieldLabel,
    color: Brand.ink,
    marginBottom: 8,
  },
  /** The input and its trailing action share one box. */
  fieldRow: { position: "relative", justifyContent: "center" },
  /** Room for the toggle, so a long password never runs under the glyph. */
  fieldInputWithAction: { paddingRight: 48 },
  fieldAction: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldInput: {
    fontFamily: Fonts.body,
    backgroundColor: Brand.green,
    borderWidth: 2,
    borderColor: Brand.cream,
    borderRadius: Radius.field,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: Type.fieldValue,
    color: Brand.white,
  },
  errorText: {
    fontFamily: Fonts.body,
    color: Colors.danger,
    fontSize: 14,
    marginBottom: 16,
  },
  pressed: { opacity: 0.75 },
});
