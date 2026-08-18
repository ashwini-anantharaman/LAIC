// The Menu drawer's two levels.
//
// MenuIndexBody is the drawer itself — Profile, Settings and (for a coach) Other.
// It replaced the ☰ / gear / avatar that used to crowd the top app bar: three
// separate sheets, one tap apart, are now three rows of one.
//
// OtherSheetBody is the coach's own surfaces, under two headings: "Coaching"
// (Learners, Assignments, Reviews, Library) and "Club management", which holds
// the club's header image and clearing its chat. COACH-ONLY, and the row that opens it is hidden
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
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Brand, Fonts, Radius, TAB_BAR_CLEARANCE, Type } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { clearThread } from "../lib/club-chat";
import { confirmDestructive, notify } from "../lib/dialogs";
import { setClubDescription } from "../lib/nexus";
import {
  loadClubHeader,
  pickAndUploadClubHeader,
  removeClubHeader,
  subscribeToClubHeader,
} from "../lib/avatar-store";
import { can, getAppContext, refreshRoleContext } from "../lib/bridge-role";
import { useSelectedClubId } from "../lib/club-context";
import { useClubScopedContext } from "../lib/use-can";
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
  onClose,
}: {
  coach: boolean;
  onOpen: (section: "profile" | "settings" | "other") => void;
  /** Friends is a pushed SCREEN rather than another section of this sheet, so the
   *  drawer has to dismiss itself before navigating — the same two steps OtherSheetBody
   *  takes in `go`, or the sheet is left sitting over the screen it opened. */
  onClose: () => void;
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
        {/* Not capability-gated, unlike "Other": friends are person-to-person, so
            there is no club role that could grant or withhold them. */}
        <Row
          label="Friends"
          hint="Find people, and answer requests"
          onPress={() => {
            onClose();
            router.push("/friends");
          }}
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
  // CLUB-SCOPED, not useRoleContext(). getRoleContext leaves `app` null, so every
  // can() below found an empty capability set and returned its fallback — this whole
  // section was a plain coach check wearing nine capability names. The fallbacks stay
  // (a club with no fine role keeps the pre-roles behaviour); they are just no longer
  // the only answer.
  const context = useClubScopedContext();
  const caps = new Set(
    ITEMS.filter((i) => can(context, i.capability, coach)).map((i) => i.capability),
  );
  const canSetHeader = can(context, "app.club.header.set", coach);
  const canRemoveHeader = can(context, "app.club.header.remove", coach);
  // Emptying the club's conversation is moderation, not header management, so it has
  // its own grant. Falls back to coach, like the rest of this section.
  const canClearChat = can(context, "app.chat.moderate", coach);
  // Whoever may set the club's banner may set the line under its name — same tier,
  // same act (what the club looks like to everyone), so the fallback is the banner
  // grant rather than `coach`. A club that has never been given the new id therefore
  // gets it wherever it already trusted someone with the banner.
  const canSetDescription = can(
    context,
    "app.club.description.set",
    can(context, "app.club.header.set", coach),
  );

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
      {canSetHeader || canRemoveHeader || canClearChat || canSetDescription ? (
        <>
          <Text style={styles.section}>Club management</Text>
          <View style={styles.rows}>
            <ClubHeaderRow canSet={canSetHeader} canRemove={canRemoveHeader} />
            {canSetDescription ? <ClubDescriptionRow /> : null}
            {canClearChat ? <ClearChatRow /> : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}


/**
 * The club's one line, under its name.
 *
 * Editable in place rather than on a pushed screen: it is one short string, and a
 * whole screen for one field is a worse trade than an input that appears where the
 * row was. Same shape as the profile sheet's Name field, which is the same problem.
 *
 * It could only be SET at creation before this — the console's program routes cover
 * name, theme, features and the catalogue and never had a description among them.
 */
function ClubDescriptionRow() {
  const { token } = useAuth();
  const programId = useSelectedClubId();
  const [current, setCurrent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Read it from the club-app context, which the app already fetches per club.
  useEffect(() => {
    if (!token || !programId) return;
    let cancelled = false;
    getAppContext(token, programId)
      .then((ctx) => !cancelled && setCurrent(ctx?.program_description ?? ""))
      // Silent: the row still opens, and the input starts empty rather than the
      // screen showing an error for a label.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, programId]);

  function open() {
    setDraft(current ?? "");
    setEditing(true);
  }

  async function save() {
    if (!token || !programId || saving) return;
    const next = draft.trim();
    setSaving(true);
    try {
      await setClubDescription(token, programId, next);
      setCurrent(next);
      setEditing(false);
      // refreshRoleContext, NOT clearAppContext: clearing empties the cache and tells
      // nobody, so the Club tab — which reads this line under the club's name — kept
      // showing the old text until something else happened to refetch. This clears
      // and then notifies every mounted gate, which is what makes the header repaint.
      await refreshRoleContext(token, programId).catch(() => {});
    } catch (e) {
      notify("Couldn't save that", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!programId) return null;

  if (editing) {
    return (
      <View style={styles.editRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="What is this club about?"
          placeholderTextColor="rgba(255,244,215,0.45)"
          maxLength={200}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          style={styles.editInput}
        />
        <Pressable
          onPress={() => void save()}
          disabled={saving}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Save the description"
          style={({ pressed }) => [pressed && styles.pressed, saving && { opacity: 0.5 }]}
        >
          <Text style={styles.editAction}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
        <Pressable
          onPress={() => setEditing(false)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Ionicons name="close" size={20} color="rgba(255,244,215,0.6)" />
        </Pressable>
      </View>
    );
  }

  return (
    <Row
      label="Club description"
      hint={current ? current : "Not set — tap to add one"}
      onPress={open}
    />
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
  // The header belongs to the selected club.
  const programId = useSelectedClubId();
  const [header, setHeader] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    if (programId) {
      loadClubHeader(token, programId).then((uri) => !cancelled && setHeader(uri));
    }
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
      notify("Couldn't set that header", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!token || !programId || busy) return;
    // confirmDestructive, not Alert directly: on web a buttoned Alert renders
    // nothing, which made this row a silent no-op in the browser.
    confirmDestructive(
      "Remove the club header?",
      "The Club tab goes back to plain cream.",
      "Remove",
      () => {
        setBusy(true);
        removeClubHeader(token, programId)
          .then(() => setHeader(null))
          .catch(() => notify("Couldn't remove that header", "Please try again."))
          .finally(() => setBusy(false));
      },
    );
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

/**
 * Clear the club's chat.
 *
 * Destructive and irreversible — the messages are deleted, not hidden — so it
 * confirms first, names what goes, and reports what actually happened rather than
 * claiming success over an empty thread.
 */
function ClearChatRow() {
  const { token } = useAuth();
  const programId = useSelectedClubId();
  const [busy, setBusy] = useState(false);

  function clear() {
    if (!token || !programId || busy) return;
    confirmDestructive(
      "Clear the club chat?",
      "Every message is deleted for everyone, pinned ones included. This cannot be undone.",
      "Clear chat",
      () => {
        setBusy(true);
        clearThread(token, programId)
          .then((n) =>
            notify(
              n > 0 ? "Chat cleared" : "Nothing to clear",
              n > 0
                ? `${n} message${n === 1 ? "" : "s"} deleted.`
                : "This club's chat was already empty.",
            ),
          )
          .catch(() => notify("Couldn't clear the chat", "Please try again."))
          .finally(() => setBusy(false));
      },
    );
  }

  return <Row label="Clear chat" hint="Delete every message in this club" onPress={clear} />;
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
  /** The description row while it is being typed in — the row's own footprint. */
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.field,
    backgroundColor: "rgba(255,244,215,0.10)",
  },
  editInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Brand.cream,
    padding: 0,
  },
  editAction: { fontFamily: Fonts.heading, fontSize: 14, color: Brand.cream },
  pressed: { opacity: 0.7 },
});
