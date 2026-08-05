// Profile — the sheet behind the avatar in the top app bar.
//
// Fidelity note: the design shows a pencil on every field, but the Nexus API
// has no profile-update endpoint (NexusUser is id/email/display_name/role) and
// no phone number at all. Rather than ship a pencil that silently does
// nothing, the rows are read-only and the pencil is rendered at reduced
// opacity. Wire `onEditField` once a PATCH endpoint exists.

import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { BrandIcons } from "../constants/brand-assets";
import { ICON_AVATAR } from "../constants/brand-vectors";
import { Brand, Radius, Type } from "../constants/theme";
import { Fonts } from "../constants/theme";
import { tintSvg } from "./svg-tint";
import { useAuth } from "../lib/auth-context";

/** The avatar ships dark for the cream app bar; on the maroon sheet it must be white. */
const AVATAR_WHITE = tintSvg(ICON_AVATAR, "#ffffff");

/** Split a single display name into the design's First / Last fields. */
function splitName(displayName: string | null | undefined): [string, string] {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["", ""];
  if (parts.length === 1) return [parts[0]!, ""];
  return [parts[0]!, parts.slice(1).join(" ")];
}

function Field({
  label,
  value,
  placeholder,
}: {
  label?: string;
  value: string;
  placeholder?: string;
}) {
  const empty = value.trim().length === 0;
  return (
    <View style={styles.fieldBlock}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.field}>
        <Text style={[styles.fieldValue, empty && styles.fieldValueEmpty]} numberOfLines={1}>
          {empty ? (placeholder ?? "Not set") : value}
        </Text>
        <Image
          source={BrandIcons.editPencil}
          style={styles.pencil}
          contentFit="contain"
          // Inert until there is somewhere to save an edit.
          accessibilityElementsHidden
        />
      </View>
    </View>
  );
}

export function ProfileSheetBody({ onClose }: { onClose: () => void }) {
  const { user, signOut } = useAuth();
  const [first, last] = splitName(user?.display_name);

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.avatarWrap}>
        {/* Vector: this is drawn at 92pt, where the 31px @1x PNG was worst. */}
        <SvgXml xml={AVATAR_WHITE} width={92} height={89.2} />
        <View style={styles.photoBadge}>
          <Image source={BrandIcons.photoBadge} style={styles.photoBadgeIcon} contentFit="contain" />
        </View>
      </View>

      <Field label="First Name" value={first} placeholder="Not set" />
      <Field label="Last Name" value={last} placeholder="Not set" />
      <Field label="Email Address" value={user?.email ?? ""} />
      {/* The design's fourth field is a phone number, which the API does not
          expose — shown for layout parity, marked as unset. */}
      <Field value="" placeholder="Phone number not set" />

      <Pressable
        onPress={() => {
          // Dismiss first: signing out sends the AuthGate to the landing screen,
          // and a sheet left mounted would sit on top of it.
          onClose();
          signOut();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 15, paddingBottom: 48 },
  avatarWrap: { alignSelf: "center", marginTop: 8, marginBottom: 30 },
  avatar: { width: 92, height: 92 },
  photoBadge: {
    position: "absolute",
    right: -2,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Brand.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  photoBadgeIcon: { width: 13, height: 12 },
  fieldBlock: { marginBottom: 18 },
  fieldLabel: {
    fontFamily: Fonts.display,
    fontSize: Type.fieldLabel,
    color: Brand.cream,
    marginBottom: 8,
    marginLeft: 3,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 41,
    paddingHorizontal: 20,
    backgroundColor: Brand.green,
    borderWidth: 2,
    borderColor: Brand.cream,
    borderRadius: Radius.field,
  },
  fieldValue: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: Type.fieldValue,
    color: Brand.white,
  },
  fieldValueEmpty: { color: "rgba(255,255,255,0.5)" },
  pencil: { width: 14, height: 14, opacity: 0.45 },
  signOut: {
    alignSelf: "center",
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: "rgba(255,244,215,0.45)",
  },
  signOutText: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 15,
    color: Brand.cream,
  },
  pressed: { opacity: 0.65 },
});
