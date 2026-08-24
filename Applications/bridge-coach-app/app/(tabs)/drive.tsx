/**
 * My Drive — this person's own space inside the app.
 *
 * WHY THE TAB IS CONDITIONAL. Having a drive is a grant (migration 0014), so most
 * people do not have one and the tab is absent rather than empty. An empty tab
 * teaches people to ignore a tab; an absent one costs nothing.
 *
 * WHY CREATING OPENS THE STUDIO IN A WINDOW rather than a native editor here. The
 * Content Studio is the thing that actually authors content — pipelines, sources,
 * generation — and a second phone-shaped editor would be a worse copy that drifts
 * from it. So the real Create screen renders, confined to this drive and filtered
 * to the types this person was permitted, and what they make is filed into their
 * drive rather than a browser folder.
 *
 * The type list does real work here: nobody writes a 38-block tutorial on a
 * phone, so an app drive is normally limited to what a phone can hold.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { WebView } from "react-native-webview";

import { useAuth } from "../../lib/auth-context";
import { fetchMyDrive, type LearningObject, type MyDrive } from "../../lib/nexus";
import { getLearningObjects } from "../../lib/learning";
import { useSelectedClubId } from "../../lib/club-context";
import { Brand, Colors, Radius, Spacing } from "../../constants/theme";

const LEARNING_URL = process.env.EXPO_PUBLIC_LEARNING_URL ?? "";

export default function DriveScreen() {
  const { token } = useAuth();
  const clubProgramId = useSelectedClubId();
  const [drive, setDrive] = useState<MyDrive | null>(null);
  const [items, setItems] = useState<LearningObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const d = await fetchMyDrive(token, clubProgramId ?? undefined);
      setDrive(d);
      if (d.has_drive && d.drive_id) {
        const all = await getLearningObjects(token, {
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

  if (creating && drive?.drive_id) {
    const types = drive.create_types == null ? "" : `&types=${encodeURIComponent(drive.create_types.join(","))}`;
    const url = `${LEARNING_URL}/?create=1&drive=${encodeURIComponent(drive.drive_id)}${types}&token=${encodeURIComponent(token ?? "")}`;
    return (
      <View style={styles.fill}>
        <View style={styles.sheetBar}>
          <Text style={styles.sheetTitle}>New content</Text>
          <Pressable onPress={() => { setCreating(false); void load(); }} hitSlop={10}>
            <Text style={styles.sheetClose}>Done</Text>
          </Pressable>
        </View>
        <WebView source={{ uri: url }} style={styles.fill} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={Brand.maroon} />
      </View>
    );
  }

  const canCreate = drive?.can_create === true && (drive.create_types?.length ?? 1) > 0;

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{drive?.drive_name ?? "My drive"}</Text>
      <Text style={styles.sub}>
        Yours. Nothing here reaches anyone else until you share it out.
      </Text>

      {canCreate && (
        <Pressable style={styles.primary} onPress={() => setCreating(true)}>
          <Text style={styles.primaryLabel}>Make something new</Text>
        </Pressable>
      )}
      {drive?.can_create === true && (drive.create_types?.length ?? 1) === 0 && (
        <Text style={styles.note}>
          No content types have been turned on for your drive yet.
        </Text>
      )}

      {items.length === 0 ? (
        <Text style={styles.note}>Nothing in your drive yet.</Text>
      ) : (
        items.map((o) => (
          <View key={o.id} style={styles.card}>
            <Text style={styles.cardTitle}>{o.title}</Text>
            <Text style={styles.cardMeta}>{String(o.type).replace(/-/g, " ")}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Brand.cream },
  sheetBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.screen,
    paddingVertical: 12,
    backgroundColor: Brand.maroon,
  },
  sheetTitle: { color: Brand.cream, fontWeight: "700", fontSize: 15 },
  sheetClose: { color: Brand.cream, fontWeight: "600", fontSize: 14 },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.screen, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: Colors.text },
  sub: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.card },
  primary: {
    backgroundColor: Brand.maroon,
    borderRadius: Radius.button,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: Spacing.card,
  },
  primaryLabel: { color: Brand.cream, fontWeight: "700", fontSize: 15 },
  note: { fontSize: 13, color: Colors.textMuted, marginTop: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: Radius.card,
    padding: Spacing.card,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: "600", color: Colors.text },
  cardMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2, textTransform: "capitalize" },
});
