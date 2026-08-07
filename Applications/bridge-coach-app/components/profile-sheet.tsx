// Profile — the sheet behind the avatar in the top app bar.
//
// Fidelity note: the design shows a pencil on every field, but the Nexus API
// has no profile-update endpoint (NexusUser is id/email/display_name/role) and
// no phone number at all. Rather than ship a pencil that silently does
// nothing, the rows are read-only and the pencil is rendered at reduced
// opacity. Wire `onEditField` once a PATCH endpoint exists.

import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { BrandIcons } from "../constants/brand-assets";
import { ICON_AVATAR } from "../constants/brand-vectors";
import { Brand, Fonts, Radius, TAB_BAR_CLEARANCE, Type } from "../constants/theme";
import { tintSvg } from "./svg-tint";
import {
  RoleContext,
  getRoleContext,
  isCoach,
  primaryMembership,
} from "../lib/bridge-role";
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
  /** Read-only facts (role, program, org) carry no pencil — they aren't yours to change. */
  editable = true,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  editable?: boolean;
}) {
  const empty = value.trim().length === 0;
  return (
    <View style={styles.fieldBlock}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.field}>
        <Text style={[styles.fieldValue, empty && styles.fieldValueEmpty]} numberOfLines={1}>
          {empty ? (placeholder ?? "Not set") : value}
        </Text>
        {editable ? (
          <Image
            source={BrandIcons.editPencil}
            style={styles.pencil}
            contentFit="contain"
            // Inert until there is somewhere to save an edit.
            accessibilityElementsHidden
          />
        ) : null}
      </View>
    </View>
  );
}

export function ProfileSheetBody({ onClose }: { onClose: () => void }) {
  const { user, token, signOut } = useAuth();
  const [first, last] = splitName(user?.display_name);
  const [context, setContext] = useState<RoleContext | null>(null);

  // Role / program / organisation — moved here from the Menu's "Account
  // details" route, which this sheet now fully replaces.
  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    getRoleContext(token).then((ctx) => {
      if (!cancelled) setContext(ctx);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const membership = context ? primaryMembership(context) : null;
  const amCoach = context ? isCoach(context) : false;

  return (
    <ScrollView
      style={styles.scroll}
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

      <View style={styles.divider} />

      <Field
        label="Role"
        value={membership?.role ?? (amCoach ? "Coach" : "Learner")}
        editable={false}
      />
      <Field
        label="Program"
        value={membership?.program_name ?? context?.bridge?.program_name ?? "Bridge Program"}
        editable={false}
      />
      <Field
        label="Organization"
        value={membership?.org_name ?? "Life in AI Center"}
        editable={false}
      />

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
  scroll: { flex: 1 },
  /**
   * The sheet opens over the tab bar, and the bar draws ON TOP of it — the bar
   * belongs to the navigator, the sheet to the screen inside it. So Sign out
   * needs the bar's whole height of scrollable space beneath it; with only 32 it
   * sat under the glass, visible for as long as an overscroll bounce was held
   * and gone the moment you let go.
   */
  body: { paddingHorizontal: 15, paddingBottom: TAB_BAR_CLEARANCE + 32 },
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
  /** Separates what you can edit from what the organisation decides. */
  divider: {
    height: 1,
    backgroundColor: "rgba(255,244,215,0.22)",
    marginTop: 4,
    marginBottom: 22,
  },
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
