// The Menu drawer's two levels.
//
// MenuIndexBody is the drawer itself — Profile, Settings and (for a coach) Other.
// It replaced the ☰ / gear / avatar that used to crowd the top app bar: three
// separate sheets, one tap apart, are now three rows of one.
//
// OtherSheetBody is the coach's own surfaces, under two headings: "Coaching"
// (Learners, Assignments, Reviews, Library) and "Club management", which today
// holds the club's header image. COACH-ONLY, and the row that opens it is hidden
// from a learner entirely rather than opening an empty section. Holding them here
// is what lets the tree and the tab bar stay IDENTICAL for both roles.
//
// Rows are green-on-maroon like the Profile sheet's fields rather than the
// cream-background OptionCards used on ordinary screens — those would fight the
// maroon panel.

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { Href } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Brand, Fonts, Radius, TAB_BAR_CLEARANCE, Type } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import {
  loadClubHeader,
  pickAndUploadClubHeader,
  removeClubHeader,
  subscribeToClubHeader,
} from "../lib/avatar-store";
import { can, getRoleContext, primaryMembership } from "../lib/bridge-role";
import { useRoleContext } from "../lib/use-can";
import { useIsCoach } from "../lib/use-is-coach";

/** One tappable row, shared by both levels of the drawer. */
function Row({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Brand.cream} />
    </Pressable>
  );
}

/** The drawer's own contents: the three sections it opens into. */
export function MenuIndexBody({
  /** Whether to offer "Other" — a capability, resolved by the caller. */
  coach,
  onOpen,
}: {
  coach: boolean;
  onOpen: (section: "profile" | "settings" | "other") => void;
}) {
  const { user } = useAuth();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Text style={styles.who}>{user?.display_name?.trim() || "Signed in"}</Text>
      <Text style={styles.email}>{user?.email ?? ""}</Text>

      <View style={styles.rows}>
        <Row
          label="Profile"
          hint="Your name, contact details and sign out"
          onPress={() => onOpen("profile")}
        />
        <Row
          label="Settings"
          hint="Bidding system and table preferences"
          onPress={() => onOpen("settings")}
        />
        {/* Capability-gated: without it there is nothing behind this row. */}
        {coach ? (
          <Row
            label="Other"
            hint="Learners, assignments, reviews and library"
            onPress={() => onOpen("other")}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

/** Each coaching row carries the capability that reveals it. */
const ITEMS: { label: string; hint: string; href: Href; capability: string }[] = [
  {
    label: "Learners",
    hint: "Your roster, history and feedback threads",
    href: "/learners",
    capability: "app.coaching.learners.view",
  },
  {
    label: "Assignments",
    hint: "Boards you've delegated, and who has finished",
    href: "/assignments",
    capability: "app.coaching.assignments.view",
  },
  {
    label: "Reviews",
    hint: "Plays your learners sent for feedback",
    href: "/reviews",
    capability: "app.coaching.reviews.view",
  },
  {
    label: "Library",
    hint: "Boards, deals, tables and collections",
    href: "/library",
    capability: "app.coaching.library.view",
  },
];

export function OtherSheetBody({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  // Every row here is a capability. The fallbacks are the pre-roles behaviour:
  // this sheet was coach-only, so a coach saw all of it.
  const coach = useIsCoach();
  const context = useRoleContext();
  const caps = new Set(
    ITEMS.filter((i) => can(context, i.capability, coach)).map((i) => i.capability),
  );
  const canSetHeader = can(context, "app.club.header.set", coach);
  const canRemoveHeader = can(context, "app.club.header.remove", coach);

  const go = (href: Href) => {
    // Dismiss first so the sheet isn't left open behind the pushed screen.
    onClose();
    router.push(href);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Text style={styles.who}>Coaching</Text>
      <Text style={styles.email}>{user?.email ?? ""}</Text>

      <View style={styles.rows}>
        {ITEMS.filter((item) => caps.has(item.capability)).map((item) => (
          <Row key={item.label} label={item.label} hint={item.hint} onPress={() => go(item.href)} />
        ))}
      </View>

      {/* Only shown to a role that can actually change something here. */}
      {canSetHeader || canRemoveHeader ? (
        <>
          <Text style={styles.section}>Club management</Text>
          <View style={styles.rows}>
            <ClubHeaderRow canSet={canSetHeader} canRemove={canRemoveHeader} />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

/**
 * Set or remove the club's header image.
 *
 * One row that changes its own words: with no banner it offers to add one, with
 * a banner it offers to replace it and holds a Remove beneath. The club is the
 * caller's own program, resolved the same way the Club tab resolves it.
 */
function ClubHeaderRow({ canSet, canRemove }: { canSet: boolean; canRemove: boolean }) {
  const { token } = useAuth();
  const [programId, setProgramId] = useState<string | null>(null);
  const [header, setHeader] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getRoleContext(token).then(async (ctx) => {
      const id = primaryMembership(ctx)?.program_id ?? null;
      if (cancelled || !id) return;
      setProgramId(id);
      const uri = await loadClubHeader(token, id);
      if (!cancelled) setHeader(uri);
    });
    const stop = subscribeToClubHeader((id, uri) => {
      if (!cancelled) setHeader((prev) => (id === programId ? uri : prev));
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [token, programId]);

  async function choose() {
    if (!token || !programId || busy) return;
    setBusy(true);
    try {
      // null means cancelled or permission declined — neither is an error.
      const uri = await pickAndUploadClubHeader(token, programId);
      if (uri) setHeader(uri);
    } catch {
      Alert.alert("Couldn't set that header", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!token || !programId || busy) return;
    Alert.alert("Remove the club header?", "The Club tab goes back to plain cream.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setBusy(true);
          removeClubHeader(token, programId)
            .then(() => setHeader(null))
            .catch(() => Alert.alert("Couldn't remove that header", "Please try again."))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <>
      {canSet ? (
        <Row
          label={header ? "Change header" : "Set header"}
          hint={
            header
              ? "The image behind your club's name"
              : "Add an image behind your club's name"
          }
          onPress={choose}
        />
      ) : null}
      {/* Setting and clearing the club's face are separate grants. */}
      {header && canRemove ? (
        <Row label="Remove header" hint="Back to plain cream" onPress={remove} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { paddingHorizontal: 22, paddingBottom: TAB_BAR_CLEARANCE + 32 },
  who: {
    fontFamily: Fonts.heading,
    fontSize: Type.sectionHeading,
    color: Brand.cream,
  },
  email: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: "rgba(255,244,215,0.7)",
    marginTop: 2,
  },
  section: {
    fontFamily: Fonts.heading,
    fontSize: Type.sectionHeading,
    color: Brand.cream,
    paddingTop: 26,
    paddingBottom: 12,
  },
  rows: { marginTop: 22, gap: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: Brand.green,
    borderWidth: 2,
    borderColor: Brand.cream,
    borderRadius: Radius.field,
  },
  rowBody: { flex: 1 },
  rowLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: 16,
    color: Brand.white,
  },
  rowHint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
    marginTop: 2,
  },
  pressed: { opacity: 0.7 },
});
