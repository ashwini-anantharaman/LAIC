// Profile — the sheet behind the avatar in the top app bar.
//
// Fidelity note: the design shows a pencil on every field. NAME is genuinely
// editable — PATCH /auth/me renames the person across EVERY club, because a name
// belongs to the person, not to a club. It is ONE field rather than the design's
// First and Last: the server stores one display name, and splitting it imposed a
// two-part western shape that a mononym or a three-part name has to be forced into.
//
// The rest stay read-only: email is the credential, role/program/org are facts
// about the membership, and the API still exposes no phone number. Those keep the
// dimmed, inert pencil rather than a control that would do nothing.

import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SvgXml } from "react-native-svg";

import { BrandIcons } from "../constants/brand-assets";
import { ICON_AVATAR } from "../constants/brand-vectors";
import { Brand, Fonts, Radius, TAB_BAR_CLEARANCE, Type } from "../constants/theme";
import { tintSvg } from "./svg-tint";
import {
  RoleContext,
  getAppContext,
  getRoleContext,
  isCoach,
  primaryMembership,
} from "../lib/bridge-role";
import { useAuth } from "../lib/auth-context";
import { useSelectedClubId } from "../lib/club-context";
import { confirmDestructive, notify } from "../lib/dialogs";
import {
  loadMyAvatar,
  pickAndUploadAvatar,
  removeMyAvatar,
  subscribeToMyAvatar,
} from "../lib/avatar-store";
import { NexusError, updateMyDisplayName } from "../lib/nexus";

/** The avatar ships dark for the cream app bar; on the maroon sheet it must be white. */
const AVATAR_WHITE = tintSvg(ICON_AVATAR, "#ffffff");

function Field({
  label,
  value,
  placeholder,
  /** Read-only facts (role, program, org) carry no pencil — they aren't yours to change. */
  editable = true,
  /**
   * Provide this and the row becomes a real editor: the pencil opens a text
   * input, and the value is saved on submit or on blur. Without it the pencil
   * stays dimmed and inert, which is the honest rendering for a field the API
   * cannot change.
   */
  onSave,
  saving = false,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  editable?: boolean;
  onSave?: (next: string) => void;
  saving?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const empty = value.trim().length === 0;

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    // Nothing to do for an unchanged or emptied field — an empty name would be
    // rejected by the server anyway, so don't send it.
    if (!next || next === value.trim()) {
      setDraft(value);
      return;
    }
    onSave?.(next);
  };

  const open = () => {
    setDraft(value);
    setEditing(true);
  };

  return (
    <View style={styles.fieldBlock}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Pressable
        style={styles.field}
        onPress={onSave && !editing ? open : undefined}
        accessibilityRole={onSave ? "button" : undefined}
        accessibilityLabel={onSave ? `Edit ${label ?? "field"}` : undefined}
      >
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commit}
            onBlur={commit}
            autoFocus
            returnKeyType="done"
            style={[styles.fieldValue, styles.fieldInput]}
            selectTextOnFocus
            maxLength={80}
            placeholder={placeholder ?? "Not set"}
            placeholderTextColor="rgba(255,255,255,0.5)"
          />
        ) : (
          <Text style={[styles.fieldValue, empty && styles.fieldValueEmpty]} numberOfLines={1}>
            {empty ? (placeholder ?? "Not set") : value}
          </Text>
        )}
        {saving ? (
          <ActivityIndicator size="small" color={Brand.cream} />
        ) : editable ? (
          <Image
            source={BrandIcons.editPencil}
            style={[styles.pencil, onSave ? styles.pencilLive : null]}
            contentFit="contain"
            {...(onSave ? {} : { accessibilityElementsHidden: true })}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

export function ProfileSheetBody({ onClose }: { onClose: () => void }) {
  const { user, token, signOut, refreshUser } = useAuth();
  const [savingName, setSavingName] = useState(false);
  /**
   * The name we just asked the server for, shown while the round trip is in
   * flight. Without it the row reverts to the session's old name the moment the
   * input closes and only corrects itself once refreshUser lands — which reads
   * exactly like the edit was rejected.
   */
  const [pendingName, setPendingName] = useState<string | null>(null);
  const name = pendingName ?? user?.display_name ?? "";

  /**
   * Save the name, whatever shape it is.
   *
   * ONE field, because the server stores one display name. It used to be split into
   * First and Last, which had to be recombined on every edit and quietly imposed a
   * two-part western shape — a mononym left a blank field, and anything with three
   * parts or a particle had nowhere sensible to go. Whatever is typed here is the
   * name.
   *
   * refreshUser() afterwards is what makes it appear everywhere in the app — the
   * roster, the leaderboard and chat all label from the session user.
   */
  const saveName = async (next: string) => {
    if (!token) return;
    const combined = next.trim();
    if (!combined) return;
    setSavingName(true);
    setPendingName(combined);
    try {
      const saved = await updateMyDisplayName(token, combined);
      // Show what the SERVER stored — it trims and collapses whitespace, so this
      // can differ from what was typed.
      setPendingName(saved);
      await refreshUser();
    } catch (e) {
      // Drop the optimistic value so the row shows the truth again, and say what
      // went wrong rather than silently snapping back.
      setPendingName(null);
      Alert.alert(
        "Couldn't save that name",
        e instanceof NexusError ? e.message : "Check your connection and try again.",
      );
    } finally {
      setSavingName(false);
    }
  };
  const [context, setContext] = useState<RoleContext | null>(null);
  const clubId = useSelectedClubId();

  // Role / program / organisation — moved here from the Menu's "Account
  // details" route, which this sheet now fully replaces. Asked about the
  // SELECTED CLUB like every club surface, so coach-ness is this club's.
  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    getRoleContext(token, clubId ?? undefined).then((ctx) => {
      if (!cancelled) setContext(ctx);
    });
    return () => {
      cancelled = true;
    };
  }, [token, clubId]);

  // The name of the role the console actually assigned in this club
  // ("Members", "Mentors") — what the Role field shows. The raw membership
  // role is NOT shown: Nexus writes "instructor" as the base membership for
  // everyone it enrolls, so it told every member they were staff.
  const [clubRole, setClubRole] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!token || !clubId) {
      setClubRole(null);
      return;
    }
    getAppContext(token, clubId).then((app) => {
      if (!cancelled) setClubRole(app?.role_name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [token, clubId]);

  const membership = context ? primaryMembership(context) : null;
  const amCoach = context ? isCoach(context) : false;
  // Owner/administrator ARE their membership role; everyone else reads as
  // what their standing resolves to, never the enrollment plumbing.
  const structuralRole =
    membership && ["owner", "administrator"].includes(membership.role.toLowerCase())
      ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1).toLowerCase()
      : null;

  // The picture the camera badge sets, and that every other surface reads.
  const [myAvatar, setMyAvatarUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loadMyAvatar(token).then((uri) => !cancelled && setMyAvatarUri(uri));
    // Stay in step if it changes elsewhere (or is cleared on sign-out).
    const stop = subscribeToMyAvatar((uri) => !cancelled && setMyAvatarUri(uri));
    return () => {
      cancelled = true;
      stop();
    };
  }, [token]);

  async function choosePicture() {
    if (!token || busy) return;
    setBusy(true);
    try {
      // null means cancelled or permission declined — both are ordinary, and
      // neither deserves an alert.
      await pickAndUploadAvatar(token);
    } catch {
      notify("Couldn't save that picture", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function removePicture() {
    if (!token || busy) return;
    // confirmDestructive, not Alert directly: on web a buttoned Alert renders
    // nothing, which made this row a silent no-op in the browser.
    confirmDestructive(
      "Remove your picture?",
      "Your avatar goes back to the default.",
      "Remove",
      () => {
        setBusy(true);
        removeMyAvatar(token)
          .catch(() => notify("Couldn't remove that picture", "Please try again."))
          .finally(() => setBusy(false));
      },
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        onPress={choosePicture}
        onLongPress={myAvatar ? removePicture : undefined}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={
          myAvatar ? "Change your profile picture. Hold to remove it." : "Add a profile picture"
        }
        style={({ pressed }) => [styles.avatarWrap, (pressed || busy) && styles.pressed]}
      >
        {/* Vector: this is drawn at 92pt, where the 31px @1x PNG was worst. */}
        {myAvatar ? (
          <Image source={{ uri: myAvatar }} style={styles.photo} contentFit="cover" />
        ) : (
          <SvgXml xml={AVATAR_WHITE} width={92} height={89.2} />
        )}
        <View style={styles.photoBadge}>
          <Image source={BrandIcons.photoBadge} style={styles.photoBadgeIcon} contentFit="contain" />
        </View>
      </Pressable>

      <Field
        label="Name"
        value={name}
        placeholder="Not set"
        saving={savingName}
        onSave={(v) => void saveName(v)}
      />
      <Field label="Email Address" value={user?.email ?? ""} />
      {/* The design's fourth field is a phone number, which the API does not
          expose — shown for layout parity, marked as unset. */}
      <Field value="" placeholder="Phone number not set" />

      <View style={styles.divider} />

      <Field
        label="Role"
        value={clubRole ?? structuralRole ?? (amCoach ? "Coach" : "Member")}
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
  /** Circular, matching the glyph it replaces — the source is cropped square. */
  photo: { width: 92, height: 92, borderRadius: 46 },
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
  /** The input must not shift the row — same font and metrics as the text it
   *  replaces, with the platform's own padding removed. */
  fieldInput: { padding: 0, margin: 0 },
  pencil: { width: 14, height: 14, opacity: 0.45 },
  /** A pencil that actually does something reads at full strength; the dimmed
   *  one stays the signal for "this field cannot be changed". */
  pencilLive: { opacity: 1 },
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
