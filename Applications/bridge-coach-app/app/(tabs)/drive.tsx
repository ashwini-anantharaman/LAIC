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
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { BrandChrome, CONTENT_TOP_GAP } from "../../components/brand-chrome";
import { TabLoading } from "../../components/tab-loading";
import { Brand, Fonts, Radius, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { useSelectedClubId } from "../../lib/club-context";
import {
  createMyDriveFolder, fetchLearningLaunch, fetchMyDrive,
  type LearningObject, type MyDrive,
} from "../../lib/nexus";
import { getLearningObjects } from "../../lib/learning";

const LEARNING_URL = process.env.EXPO_PUBLIC_LEARNING_URL ?? "";

/** The screen's own left margin, matching Coach and Club. */
const GUTTER = 23;

export default function DriveScreen() {
  const { token } = useAuth();
  const clubProgramId = useSelectedClubId();
  const insets = useSafeAreaInsets();
  const [drive, setDrive] = useState<MyDrive | null>(null);
  const [items, setItems] = useState<LearningObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [makingFolder, setMakingFolder] = useState(false);
  /** The framed Studio's URL, built only after a launch token exists. */
  const [studioUrl, setStudioUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

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
      if (clubProgramId) q.set("program_id", clubProgramId);
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
        const all = await getLearningObjects(token, {
          refresh: true,
          ...(clubProgramId ? { programId: clubProgramId } : {}),
        }).catch(() => []);
        setItems(all.filter((o) => (o.collection_ids ?? []).includes(d.drive_id!)));
      } else {
        setItems([]);
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

            {items.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nothing here yet</Text>
                <Text style={styles.emptyBody}>
                  {canCreate
                    ? "Make something and it lands in Drafts."
                    : "Content shared into your drive will appear here."}
                </Text>
              </View>
            ) : (
              /* Grouped by the folder each piece is in, so Drafts reads as a
                 place rather than the list happening to start with new things. */
              Object.entries(
                items.reduce<Record<string, LearningObject[]>>((acc, o) => {
                  const name = (o.collection_names ?? [])[0] ?? "In your drive";
                  (acc[name] ??= []).push(o);
                  return acc;
                }, {}),
              ).map(([folder, list]) => (
                <View key={folder}>
                  <Text style={styles.folder}>
                    {folder} <Text style={styles.folderCount}>{list.length}</Text>
                  </Text>
                  {list.map((o) => (
                    <View key={o.id} style={styles.card}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{o.title}</Text>
                      <Text style={styles.cardMeta}>{String(o.type).replace(/-/g, " ")}</Text>
                    </View>
                  ))}
                </View>
              ))
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
