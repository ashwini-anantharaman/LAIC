/**
 * My Drive — this person's own space inside the app.
 *
 * WHY THE TAB IS CONDITIONAL. Having a drive is a grant (migration 0014), so
 * most people do not have one and the tab is absent rather than empty. The bar
 * decides that from `hiddenRoutes`; this screen only has to handle the case
 * where somebody arrived without one.
 *
 * WHY CREATING OPENS THE STUDIO IN A SHEET rather than a native editor. The
 * Content Studio is the thing that actually authors content -- pipelines,
 * sources, generation -- and a second phone-shaped editor would be a worse copy
 * that drifts from it. So the real Create screen renders, confined to this drive
 * and filtered to the permitted types, wearing the app's own skin (`embed=1`).
 *
 * The type list does real work here: nobody writes a 38-block tutorial on a
 * phone, so a drive reached from the app is normally limited to what a phone can
 * hold.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { BrandChrome, CONTENT_TOP_GAP } from "../../components/brand-chrome";
import { TabLoading } from "../../components/tab-loading";
import { Brand, Fonts, Radius, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { useSelectedClubId } from "../../lib/club-context";
import {
  createMyDriveFolder, deleteMyDriveObject, fetchLearningLaunch, fetchMyDrive,
  fetchMyDriveFolders, fetchMyDriveObjects, type LearningObject, type MyDrive,
} from "../../lib/nexus";

const LEARNING_URL = process.env.EXPO_PUBLIC_LEARNING_URL ?? "";

/** The screen's own left margin, matching Coach and Club. */
const GUTTER = 23;

export default function DriveScreen() {
  const { token } = useAuth();
  const clubProgramId = useSelectedClubId();
  const insets = useSafeAreaInsets();
  const [drive, setDrive] = useState<MyDrive | null>(null);
  const [items, setItems] = useState<LearningObject[]>([]);
  /** The drive's own folders, so a new one is visible the moment it is made. */
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [makingFolder, setMakingFolder] = useState(false);
  /** The framed Studio's URL, built only after a launch token exists. */
  const [studioUrl, setStudioUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  /** Named right after a save, so the answer to "where did it go?" is on screen. */
  const [savedInto, setSavedInto] = useState<string | null>(null);
  /**
   * Which folders are open.
   *
   * Collapsed by default so a drive with several folders is a short list rather
   * than a scroll -- the folder names are the map, and the contents are what you
   * open when you want them.
   */
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  /** Open the finished thing, exactly as the Learn tab renders it. */
  const view = (o: LearningObject) =>
    router.push({
      pathname: "/learn-object/[id]",
      params: {
        id: o.id,
        title: o.title,
        // A drive lives under the parent program, so the reader must launch in
        // that scope rather than the club's.
        ...(drive?.program_id ? { program: drive.program_id } : {}),
      },
    });

  /** Reopen this object's own pipeline in the Studio, confined to it. */
  const edit = async (o: LearningObject) => {
    if (!token || !drive?.drive_id) return;
    setBusyId(o.id);
    try {
      const l = await fetchLearningLaunch(token, drive.program_id ?? undefined);
      if (!l.launch_url) throw new Error("The Content Studio is not configured here.");
      const q = new URLSearchParams({
        launch_token: l.launch_token,
        pipeline: "edit",
        object: o.id,
        chrome: "none",
      });
      if (drive.program_id) q.set("program_id", drive.program_id);
      setStudioUrl(`${l.launch_url}/?${q.toString()}`);
      setCreating(true);
    } catch (e) {
      Alert.alert("Couldn't open it", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = (o: LearningObject) => {
    Alert.alert(`Delete "${o.title}"?`, "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            if (!token) return;
            setBusyId(o.id);
            try {
              await deleteMyDriveObject(token, o.id, drive?.program_id ?? undefined);
              await load();
            } catch (e) {
              Alert.alert("Couldn't delete", e instanceof Error ? e.message : "Try again.");
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  /**
   * Open the Studio, confined to this drive.
   *
   * The launch token is minted FIRST and the sheet opens only once it exists --
   * the Studio establishes its session from that token alone, and without one it
   * silently falls back to a demo session showing a stranger's local folders.
   */
  const openCreator = async () => {
    if (!token || !drive?.drive_id) return;
    setOpening(true);
    try {
      const l = await fetchLearningLaunch(token, clubProgramId ?? undefined);
      if (!l.launch_url) throw new Error("The Content Studio is not configured here.");
      const q = new URLSearchParams({
        launch_token: l.launch_token,
        create: "1",
        drive: drive.drafts_id ?? drive.drive_id,
        chrome: "none",
      });
      if (drive.create_types != null) q.set("types", drive.create_types.join(","));
      // The drive's own scope, so the Studio files into the same place the
      // folder list was read from.
      if (drive.program_id) q.set("program_id", drive.program_id);
      setStudioUrl(`${l.launch_url}/?${q.toString()}`);
      setCreating(true);
    } catch (e) {
      Alert.alert("Couldn't open the creator", e instanceof Error ? e.message : "Try again.");
    } finally {
      setOpening(false);
    }
  };

  /**
   * A drive you cannot make a folder in is a list, not a drive.
   *
   * Alert.prompt rather than a custom sheet: one short string, and iOS already
   * has the right thing for that. (Android has no prompt, so it falls back to
   * a dated name -- better than the button doing nothing there.)
   */
  const newFolder = () => {
    const make = async (name: string) => {
      if (!token || !name.trim()) return;
      setMakingFolder(true);
      try {
        await createMyDriveFolder(token, name.trim(), clubProgramId ?? undefined);
        await load();
      } catch (e) {
        Alert.alert("Couldn't make that folder", e instanceof Error ? e.message : "Try again.");
      } finally {
        setMakingFolder(false);
      }
    };
    if (Alert.prompt) {
      Alert.prompt("New folder", "What should it be called?", [
        { text: "Cancel", style: "cancel" },
        { text: "Create", onPress: (v?: string) => void make(v ?? "") },
      ]);
    } else {
      void make(`Folder ${new Date().toLocaleDateString()}`);
    }
  };

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const d = await fetchMyDrive(token, clubProgramId ?? undefined);
      setDrive(d);
      if (d.has_drive && d.drive_id) {
        /**
         * BOTH READS USE THE DRIVE'S OWN SCOPE, and both ask the drive.
         *
         * The counts used to come from the club's published learner feed, which
         * a draft in a drive is not in and never will be -- so the folders were
         * right and every count was zero. One endpoint, one scope, one answer.
         */
        const scope = d.program_id ?? undefined;
        const [lib, tree] = await Promise.all([
          fetchMyDriveObjects(token, d.drive_id, scope).catch(() => ({ objects: [] })),
          fetchMyDriveFolders(token, d.drive_id, scope).catch(
            () => ({ folders: [] as { id: string; name: string; parent_id: string | null }[] }),
          ),
        ]);
        // Every folder in the drive EXCEPT the root, which is the drive itself.
        setFolders((tree.folders ?? []).filter((f) => f.id !== d.drive_id));
        setItems(lib.objects ?? []);
      } else {
        setItems([]);
        setFolders([]);
      }
    } finally {
      setLoading(false);
    }
  }, [token, clubProgramId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { void load(); }, [load]);

  /**
   * The Studio, full-screen, over everything.
   *
   * Its own header sits BELOW the status bar — the first version ran under it and
   * the title collided with the clock. It covers the tab bar deliberately: this
   * is a task you finish and close, not a place you browse from.
   */
  if (creating && studioUrl) {
    return (
      <View style={styles.fill}>
        <View style={[styles.sheetBar, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.sheetTitle}>New content</Text>
          <Pressable
            onPress={() => { setCreating(false); setStudioUrl(null); void load(); }}
            hitSlop={12}
          >
            <Text style={styles.sheetDone}>Done</Text>
          </Pressable>
        </View>
        <WebView
          source={{ uri: studioUrl }}
          style={styles.fill}
          scalesPageToFit
          contentInsetAdjustmentBehavior="never"
          /**
           * The Studio says when a save lands, and THIS closes the sheet.
           *
           * A web page cannot dismiss a native sheet, so the person was left
           * looking at the editor with no sign of where their work went. Coming
           * straight back to My Drive answers that: the folder it went into is
           * right there.
           */
          onMessage={(e) => {
            try {
              const m = JSON.parse(e.nativeEvent.data) as { type?: string; folder?: string };
              if (m.type !== "drive-saved") return;
              setCreating(false);
              setStudioUrl(null);
              setSavedInto(m.folder ?? "Drafts");
              void load();
            } catch {
              /* Not ours — the Studio posts other things too. */
            }
          }}
        />
        {/*
          THE TAB BAR RENDERS OVER THIS SCREEN.
          A sheet returned from inside a tab still sits under the navigator's bar,
          so the web page's own bottom -- a dialog footer, a Continue button --
          was being covered by it. The space is reserved here instead.
        */}
        <View style={{ height: TAB_BAR_CLEARANCE, backgroundColor: Brand.cream }} />
      </View>
    );
  }

  if (loading) return <TabLoading ready={false} />;

  const canCreate = drive?.can_create === true && (drive.create_types?.length ?? 1) > 0;

  return (
    <BrandChrome>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>My Drive</Text>
        {savedInto && (
          <Pressable style={styles.saved} onPress={() => setSavedInto(null)}>
            <Text style={styles.savedText}>Saved into {savedInto}</Text>
          </Pressable>
        )}
        <Text style={styles.sub}>
          {drive?.has_drive
            ? "Yours. Nothing here reaches anyone else until you share it out."
            : "A space of your own, separate from the club's library."}
        </Text>

        {!drive?.has_drive ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>You don&rsquo;t have a drive</Text>
            {/* Not having one is an ordinary state, not a failure — so this says
                who can change it rather than reading like something broke. */}
            <Text style={styles.emptyBody}>
              Whoever manages the content library can give you one.
            </Text>
          </View>
        ) : (
          <>
            {canCreate && (
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]}
                  onPress={() => void openCreator()}
                >
                  <Text style={styles.newPlus}>+</Text>
                  <Text style={styles.newLabel}>{opening ? "Opening…" : "New"}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.folderButton, pressed && styles.newButtonPressed]}
                  onPress={newFolder}
                  disabled={makingFolder}
                >
                  <Text style={styles.folderButtonLabel}>
                    {makingFolder ? "Making…" : "New folder"}
                  </Text>
                </Pressable>
              </View>
            )}

            {drive.can_create && (drive.create_types?.length ?? 1) === 0 && (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  No content types have been turned on for your drive yet.
                </Text>
              </View>
            )}

            {/*
              COLLAPSIBLE FOLDERS. Collapsed by default: the folder names are the
              map, and a drive with several folders should be a short list rather
              than a scroll. Folders show even when empty -- one you just made has
              to be visible, or the act that created it has no result.
            */}
            {folders.map((f) => {
              const inside = items.filter((o) => (o.collection_ids ?? []).includes(f.id));
              const open = openFolders[f.id] ?? false;
              return (
                <View key={f.id} style={styles.folderBlock}>
                  <Pressable
                    style={styles.folderRow}
                    onPress={() => setOpenFolders((m) => ({ ...m, [f.id]: !open }))}
                  >
                    <Text style={styles.chevron}>{open ? "\u25be" : "\u25b8"}</Text>
                    <Text style={styles.folderRowName}>{f.name}</Text>
                    <Text style={styles.folderRowCount}>
                      {inside.length} {inside.length === 1 ? "item" : "items"}
                    </Text>
                  </Pressable>
                  {open && inside.map((o) => (
                    <ContentCard
                      key={o.id}
                      o={o}
                      busy={busyId === o.id}
                      onView={() => view(o)}
                      onEdit={() => void edit(o)}
                      onDelete={() => remove(o)}
                    />
                  ))}
                </View>
              );
            })}

            {/* Anything sitting in the drive root rather than a folder. */}
            {items
              .filter((o) => !folders.some((f) => (o.collection_ids ?? []).includes(f.id)))
              .map((o) => (
                <ContentCard
                  key={o.id}
                  o={o}
                  busy={busyId === o.id}
                  onView={() => view(o)}
                  onEdit={() => void edit(o)}
                  onDelete={() => remove(o)}
                />
              ))}

            {folders.length === 0 && items.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nothing here yet</Text>
                <Text style={styles.emptyBody}>
                  {canCreate
                    ? "Make something and it lands in Drafts."
                    : "Content shared into your drive will appear here."}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </BrandChrome>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Brand.cream },
  content: { paddingHorizontal: GUTTER, paddingTop: 4 },

  title: { fontFamily: Fonts.display, fontSize: Type.screenTitle, color: Brand.ink },
  sub: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: Brand.ink,
    opacity: 0.62,
    marginTop: 6,
    marginBottom: 18,
  },

  // The one primary action, in the app's own maroon — the same weight the other
  // tabs give their main button.
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    gap: 8,
    backgroundColor: Brand.maroon,
    borderRadius: Radius.button,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  newButtonPressed: { opacity: 0.85 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  folderButton: {
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: "rgba(84,16,21,0.35)",
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  folderButtonLabel: { fontFamily: Fonts.displayMedium, fontSize: 15, color: Brand.maroon },
  newPlus: { fontFamily: Fonts.display, fontSize: 20, color: Brand.cream, marginTop: -2 },
  newLabel: { fontFamily: Fonts.displayMedium, fontSize: 16, color: Brand.cream },

  empty: {
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: "rgba(31,31,31,0.12)",
    borderStyle: "dashed",
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyTitle: { fontFamily: Fonts.heading, fontSize: Type.sectionHeading, color: Brand.ink },
  emptyBody: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: Brand.ink,
    opacity: 0.6,
    textAlign: "center",
    marginTop: 6,
  },

  notice: {
    borderRadius: Radius.card,
    backgroundColor: "rgba(84,16,21,0.08)",
    padding: 14,
    marginBottom: 14,
  },
  noticeText: { fontFamily: Fonts.body, fontSize: 13.5, color: Brand.ink },

  card: {
    backgroundColor: "#fff",
    borderRadius: Radius.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  saved: {
    backgroundColor: "rgba(5,150,105,0.14)",
    borderRadius: Radius.card,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  savedText: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: "#065F46" },
  folderBlock: { marginBottom: 4 },
  chevron: { fontFamily: Fonts.body, fontSize: 13, color: Brand.ink, opacity: 0.5, marginRight: 8 },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(31,31,31,0.08)",
    paddingTop: 10,
  },
  cardAction: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.button, borderWidth: 1, borderColor: "rgba(84,16,21,0.25)" },
  cardActionLabel: { fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.maroon },
  cardActionDanger: { color: "#B42318" },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(84,16,21,0.06)",
    borderRadius: Radius.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  folderRowName: { fontFamily: Fonts.heading, fontSize: 16, color: Brand.ink, flex: 1 },
  folderRowCount: { fontFamily: Fonts.body, fontSize: 12.5, color: Brand.ink, opacity: 0.55 },
  folder: {
    fontFamily: Fonts.heading,
    fontSize: Type.sectionHeading,
    color: Brand.ink,
    marginTop: 6,
    marginBottom: 8,
  },
  folderCount: { fontFamily: Fonts.body, fontSize: 13, opacity: 0.5 },
  cardTitle: { fontFamily: Fonts.heading, fontSize: 16, color: Brand.ink },
  cardMeta: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Brand.ink,
    opacity: 0.55,
    marginTop: 3,
    textTransform: "capitalize",
  },

  sheetBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: GUTTER,
    paddingBottom: 12,
    backgroundColor: Brand.maroon,
  },
  sheetTitle: { fontFamily: Fonts.displayMedium, fontSize: 17, color: Brand.cream },
  sheetDone: { fontFamily: Fonts.bodySemibold, fontSize: 15, color: Brand.cream },
});

/**
 * One piece of content, with the three things you can do to it.
 *
 * View opens the finished thing exactly as a learner sees it — the same reader
 * the Learn tab uses, not a second preview that would drift from it. Edit
 * reopens its own pipeline. Delete is destructive and confirms.
 */
function ContentCard({
  o,
  busy,
  onView,
  onEdit,
  onDelete,
}: {
  o: LearningObject;
  busy: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable onPress={onView}>
        <Text style={styles.cardTitle} numberOfLines={2}>{o.title}</Text>
        <Text style={styles.cardMeta}>{String(o.type).replace(/-/g, " ")}</Text>
      </Pressable>
      <View style={styles.cardActions}>
        <Pressable style={styles.cardAction} onPress={onView} disabled={busy}>
          <Text style={styles.cardActionLabel}>View</Text>
        </Pressable>
        <Pressable style={styles.cardAction} onPress={onEdit} disabled={busy}>
          <Text style={styles.cardActionLabel}>{busy ? "Opening\u2026" : "Edit"}</Text>
        </Pressable>
        <Pressable style={styles.cardAction} onPress={onDelete} disabled={busy}>
          <Text style={[styles.cardActionLabel, styles.cardActionDanger]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}
