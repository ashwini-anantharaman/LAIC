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
  Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { BrandChrome, CONTENT_TOP_GAP } from "../../components/brand-chrome";
import { TabLoading } from "../../components/tab-loading";
import { Brand, Fonts, Radius, TAB_BAR_CLEARANCE, Type } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { useSelectedClubId } from "../../lib/club-context";
import { fetchMyDrive, type LearningObject, type MyDrive } from "../../lib/nexus";
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
  if (creating && drive?.drive_id) {
    const q = new URLSearchParams({
      create: "1",
      drive: drive.drive_id,
      // The app's own cream-and-Neco skin, so the framed Studio does not arrive
      // wearing a different app's clothes.
      embed: "1",
    });
    if (drive.create_types != null) q.set("types", drive.create_types.join(","));
    if (token) q.set("token", token);
    return (
      <View style={styles.fill}>
        <View style={[styles.sheetBar, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.sheetTitle}>New content</Text>
          <Pressable onPress={() => { setCreating(false); void load(); }} hitSlop={12}>
            <Text style={styles.sheetDone}>Done</Text>
          </Pressable>
        </View>
        <WebView
          source={{ uri: `${LEARNING_URL}/?${q.toString()}` }}
          style={styles.fill}
          // The Studio sizes itself against the viewport; without this it lays
          // out at desktop width and everything runs off the screen.
          scalesPageToFit
          contentInsetAdjustmentBehavior="never"
        />
        {/*
          THE TAB BAR RENDERS OVER THIS SCREEN.
          A sheet returned from inside a tab still sits under the navigator's bar,
          so the web page's own bottom -- a dialog footer, a Continue button --
          was being covered by it. The web view cannot know that, so the space is
          reserved here instead: the page ends where the bar begins.
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
              <Pressable
                style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]}
                onPress={() => setCreating(true)}
              >
                <Text style={styles.newPlus}>+</Text>
                <Text style={styles.newLabel}>New</Text>
              </Pressable>
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
                    ? "Make something and it lands here, not in the club's library."
                    : "Content shared into your drive will appear here."}
                </Text>
              </View>
            ) : (
              items.map((o) => (
                <View key={o.id} style={styles.card}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{o.title}</Text>
                  <Text style={styles.cardMeta}>{String(o.type).replace(/-/g, " ")}</Text>
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
    marginBottom: 18,
  },
  newButtonPressed: { opacity: 0.85 },
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
