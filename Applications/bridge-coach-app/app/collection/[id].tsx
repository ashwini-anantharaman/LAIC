// One designated collection — NATIVE (M3c; was the /m/collection WebView).
// Its items grouped by kind, playable in place. Being granted the collection
// IS the permission — no copies involved; an ungranted id reads as not-found.

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen, ScreenHeader } from "../../components/ui";
import { Brand, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { BridgeApiError } from "../../lib/bridge-api";
import { useSelectedClubId } from "../../lib/club-context";
import { PROGRAM_ID } from "../../lib/config";
import {
  peekCollection,
  playLibraryEntry,
  refreshCollection,
  type CollectionDetail,
} from "../../lib/library";

const KIND_LABEL: Record<string, string> = {
  board: "BOARDS",
  deal: "DEALS",
  table: "TABLES",
  play: "RECORDED PLAYS",
  drill: "DRILLS",
  puzzle: "PUZZLES",
};

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const collectionId = typeof id === "string" ? id : "";
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;

  const [detail, setDetail] = useState<CollectionDetail | null>(() =>
    token && collectionId ? peekCollection(token, programId, collectionId) : null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!token || !collectionId) return;
      setDetail(peekCollection(token, programId, collectionId));
      refreshCollection(token, programId, collectionId)
        .then((v) => {
          setDetail(v);
          setLoadError(null);
        })
        .catch((e) => {
          if (!peekCollection(token, programId, collectionId)) {
            setLoadError(
              e instanceof BridgeApiError && e.status === 404
                ? "This collection isn't shared with you."
                : "Couldn't open this collection.",
            );
          }
        });
    }, [token, programId, collectionId]),
  );

  const play = useCallback(
    async (entryId: string) => {
      if (!token || busy) return;
      setBusy(true);
      try {
        const { sessionId } = await playLibraryEntry(token, programId, entryId, "play");
        router.push(`/table/${sessionId}`);
      } catch {
        // The row stays; a second tap retries.
      } finally {
        setBusy(false);
      }
    },
    [token, programId, busy],
  );

  const kinds = [...new Set((detail?.items ?? []).map((i) => i.kind))];

  return (
    <Screen>
      <ScreenHeader title="Collection" backTo="/library" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
      >
        {!detail ? (
          <Text style={styles.emptyBox}>{loadError ?? "Loading…"}</Text>
        ) : (
          <>
            <Text style={styles.title}>{detail.collection.name}</Text>
            {detail.collection.description ? (
              <Text style={styles.lede}>{detail.collection.description}</Text>
            ) : null}

            {kinds.map((kind) => (
              <View key={kind}>
                <Text style={styles.sectionLabel}>{KIND_LABEL[kind] ?? kind.toUpperCase()}</Text>
                {detail.items
                  .filter((i) => i.kind === kind)
                  .map((i) => {
                    const meta = [
                      i.content.dealer && `dealer ${i.content.dealer}`,
                      i.content.vul && `vul ${i.content.vul}`,
                      i.content.contractLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const playable =
                      (kind === "board" || kind === "deal" || kind === "play") &&
                      !!i.content.hands;
                    return (
                      <View key={i.id} style={styles.itemRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.itemTitle} numberOfLines={1}>
                            {i.name}
                          </Text>
                          <Text style={styles.itemMeta} numberOfLines={1}>
                            {meta || i.kind}
                          </Text>
                        </View>
                        {playable && (
                          <Pressable
                            onPress={() => play(i.id)}
                            disabled={busy}
                            style={({ pressed }) => [
                              styles.playButton,
                              (pressed || busy) && styles.pressed,
                            ]}
                          >
                            <Text style={styles.playButtonText}>Play</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
              </View>
            ))}

            {detail.items.length === 0 && (
              <Text style={styles.emptyLine}>This collection is empty.</Text>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: Fonts.display, fontSize: 26, color: Brand.ink, marginTop: 5 },
  lede: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 20, color: "#5e5749", marginTop: 8 },
  sectionLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10.5,
    letterSpacing: 1.9,
    color: "#a49d8e",
    marginTop: 20,
    marginBottom: 2,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fffefa",
    borderWidth: 1,
    borderColor: "#e7e1d3",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 13,
    marginTop: 9,
  },
  itemTitle: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.ink },
  itemMeta: { fontFamily: Fonts.body, fontSize: 11.5, color: "#a49d8e", marginTop: 3 },
  playButton: {
    backgroundColor: Brand.green,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  playButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: Brand.white },
  emptyLine: { fontFamily: Fonts.body, fontSize: 13, color: "#a49d8e", marginTop: 18 },
  emptyBox: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    color: "#a49d8e",
    textAlign: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d3ccbb",
    borderRadius: 12,
    padding: 16,
    marginTop: 18,
  },
  pressed: { opacity: 0.75 },
});
