// Library — NATIVE (M3c; this was a BridgeEmbed of /m/library with a
// cache-busting resetOnFocus). Shelves of saved boards/packs/tables/plays,
// the designated-collections strip, and one action per row: Play a board,
// Resume a saved play, Start a table lineup. Creation gates come server-
// resolved from /api/bridge/me (library.canCreate → the + buttons,
// library.resume → the action buttons, programScope → whose shelf this is).
//
// Coaches get an Assign chip on playable rows — it lands on the native
// assign picker (/assign), which copies the entry to each learner.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen, ScreenHeader } from "../components/ui";
import { TabLoading } from "../components/tab-loading";
import { Brand, Fonts, Spacing, TAB_BAR_CLEARANCE } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { BridgeApiError } from "../lib/bridge-api";
import { useSelectedClubId } from "../lib/club-context";
import { PROGRAM_ID } from "../lib/config";
import {
  peekLibrary,
  playLibraryEntry,
  refreshLibrary,
  subscribeToLibrary,
  type LibraryItem,
  type LibraryModel,
  type LibraryShelfKind,
} from "../lib/library";
import { useBridgeMe } from "../lib/use-bridge-can";

/** Shelf order from the mobile design (Boards default, like desktop). */
const SHELVES: { kind: LibraryShelfKind; label: string; reserved?: boolean }[] = [
  { kind: "board", label: "Boards" },
  { kind: "deal", label: "Packs" },
  { kind: "table", label: "Tables" },
  { kind: "play", label: "Deals" },
  { kind: "drill", label: "Drills", reserved: true },
  { kind: "puzzle", label: "Puzzles", reserved: true },
];

function metaLine(e: LibraryItem): string {
  if (e.kind === "table") {
    const labels = Object.values(e.content.seats ?? {})
      .map((s) => s?.label)
      .filter(Boolean);
    return `lineup · ${labels.join(", ")}`;
  }
  return (
    [
      // A coach's board says so first: before an Edit chip can be found, the
      // rows that have one have to be tellable apart.
      e.content.curatedJson ? "curated" : null,
      e.content.dealer && `dealer ${e.content.dealer}`,
      e.content.vul && `vul ${e.content.vul}`,
      e.content.auction?.length ? `${e.content.auction.length} calls` : null,
      e.content.play?.length ? `${e.content.play.length} cards` : null,
      e.content.contractLabel,
      e.content.resultLabel,
    ]
      .filter(Boolean)
      .join(" · ") || "pack only"
  );
}

export default function LibraryScreen() {
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const programId = clubId ?? PROGRAM_ID;
  const me = useBridgeMe();
  // ONE library per person, decided by the access policy — admins curate the
  // program instance, everyone else works in their own. No toggle.
  const view: "mine" | "program" = me?.library.programScope ? "program" : "mine";
  const canCreate = me?.library.canCreate ?? false;
  const canResume = me?.features["library.resume"] ?? true;
  const coach = me?.isCoach ?? false;

  const [model, setModel] = useState<LibraryModel | null>(() =>
    token ? peekLibrary(token, programId, view) : null,
  );
  const [active, setActive] = useState<LibraryShelfKind>("board");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      setModel(peekLibrary(token, programId, view));
      refreshLibrary(token, programId, view)
        .then(() => setLoadError(null))
        .catch((e) => {
          if (!peekLibrary(token, programId, view)) {
            setLoadError(
              e instanceof BridgeApiError ? e.message : "Couldn't load the library.",
            );
          }
        });
      return subscribeToLibrary(setModel);
    }, [token, programId, view]),
  );

  const byKind = useMemo(() => {
    const map = new Map<string, LibraryItem[]>();
    for (const s of SHELVES) map.set(s.kind, []);
    for (const e of model?.items ?? []) map.get(e.kind)?.push(e);
    return map;
  }, [model]);

  const entries = byKind.get(active) ?? [];
  const shelf = SHELVES.find((s) => s.kind === active)!;
  const collections = model?.collections ?? [];

  const openEntry = useCallback(
    async (entry: LibraryItem) => {
      if (!token || busy) return;
      const mode = entry.kind === "table" ? "table" : entry.kind === "play" ? "resume" : "play";
      setBusy(true);
      try {
        const { sessionId } = await playLibraryEntry(token, programId, entry.id, mode);
        router.push(`/table/${sessionId}`);
      } catch (e) {
        setActionError(
          e instanceof BridgeApiError ? e.message : "Couldn't open that — try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [token, programId, busy],
  );

  return (
    <Screen>
      <ScreenHeader title="Library" backTo="/home" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
      >
        <Text style={styles.title}>Library</Text>
        <Text style={styles.lede}>
          Snapshots you save from the table, author in the deal editor, or import as
          LIN / PBN.
        </Text>

        {actionError && (
          <Pressable onPress={() => setActionError(null)}>
            <Text style={styles.errorBanner}>{actionError}</Text>
          </Pressable>
        )}

        {/* Creation row — capability-gated (library.create, server-resolved). */}
        {canCreate && (
          <View style={styles.createRow}>
            <Pressable
              onPress={() => router.push("/deal-editor?kind=board")}
              style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
            >
              <Text style={styles.createButtonText}>+ New board</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/deal-editor?kind=deal")}
              style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
            >
              <Text style={styles.createButtonText}>+ New pack</Text>
            </Pressable>
          </View>
        )}

        {/* Designated collections — curated program groupings, read in place. */}
        {collections.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>COLLECTIONS</Text>
            {collections.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/collection/${c.id}`)}
                style={({ pressed }) => [styles.collectionCard, pressed && styles.pressed]}
              >
                <Text style={{ fontSize: 18 }}>🗂️</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.collectionName}>{c.name}</Text>
                  <Text style={styles.collectionMeta}>
                    {c.itemCount} item{c.itemCount === 1 ? "" : "s"}
                    {c.description ? ` · ${c.description}` : ""}
                  </Text>
                </View>
                <Text style={styles.collectionChevron}>›</Text>
              </Pressable>
            ))}
          </>
        )}

        {/* Shelf chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 18 }}
          contentContainerStyle={{ gap: 8 }}
        >
          {SHELVES.map((s) => {
            const on = s.kind === active;
            return (
              <Pressable
                key={s.kind}
                onPress={() => setActive(s.kind)}
                style={[styles.shelfChip, on && styles.shelfChipOn]}
              >
                <Text style={[styles.shelfChipText, on && styles.shelfChipTextOn]}>
                  {s.label}{" "}
                  <Text style={{ color: on ? "rgba(255,255,255,.7)" : "#a49d8e" }}>
                    {byKind.get(s.kind)?.length ?? 0}
                  </Text>
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Entries */}
        {model === null ? (
          <Text style={styles.emptyBox}>{loadError ?? "Loading the shelves…"}</Text>
        ) : shelf.reserved ? (
          <Text style={styles.emptyBox}>
            This shelf is reserved — {shelf.label.toLowerCase()} arrive later.
          </Text>
        ) : entries.length === 0 ? (
          <Text style={styles.emptyBox}>
            Nothing on this shelf yet — save from a live board or import LIN/PBN on
            desktop.
          </Text>
        ) : (
          entries.map((e) => {
            const label = e.kind === "table" ? "Start" : e.kind === "play" ? "Resume" : "Play";
            const playable = canResume && (e.kind === "table" || !!e.content.hands);
            return (
              <View key={e.id} style={styles.entryRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.entryTitle} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <Text style={styles.entryMeta} numberOfLines={1}>
                    {metaLine(e)}
                  </Text>
                </View>
                {coach && !!e.content.curatedJson && (
                  <Pressable
                    onPress={() => router.push(`/curated-edit?entry=${encodeURIComponent(e.id)}`)}
                    style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </Pressable>
                )}
                {coach && !!e.content.hands && e.kind !== "table" && (
                  <Pressable
                    onPress={() => router.push(`/assign?entry=${encodeURIComponent(e.id)}`)}
                    style={({ pressed }) => [styles.assignButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.assignButtonText}>Assign</Text>
                  </Pressable>
                )}
                {playable && (
                  <Pressable
                    onPress={() => openEntry(e)}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.entryButton,
                      (pressed || busy) && styles.pressed,
                    ]}
                  >
                    <Text style={styles.entryButtonText}>{label}</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <TabLoading ready={model !== null || loadError !== null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: Fonts.display, fontSize: 30, color: Brand.ink, marginTop: 4 },
  lede: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 21,
    color: "#7b7466",
    marginTop: 2,
    maxWidth: 340,
  },
  sectionLabel: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10.5,
    letterSpacing: 1.9,
    color: "#a49d8e",
    marginTop: 20,
    marginBottom: 2,
  },
  errorBanner: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    backgroundColor: "#b91c1c",
    color: Brand.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
    overflow: "hidden",
  },

  createRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 20 },
  createButton: {
    borderWidth: 1,
    borderColor: Brand.green,
    backgroundColor: Brand.white,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  createButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.green },

  collectionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    // The app's card language: maroon face, cream text, stacked-edge shadow.
    backgroundColor: Brand.maroon,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginTop: 9,
  },
  collectionName: { fontFamily: Fonts.bodySemibold, fontSize: 14, color: Brand.cream },
  collectionMeta: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    color: "rgba(255,244,215,.72)",
    marginTop: 2,
  },
  collectionChevron: { fontFamily: Fonts.bodySemibold, fontSize: 14, color: Brand.cream },

  shelfChip: {
    borderWidth: 1,
    borderColor: "#d3ccbb",
    backgroundColor: Brand.white,
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  shelfChipOn: { borderColor: Brand.green, backgroundColor: Brand.green },
  shelfChipText: { fontFamily: Fonts.body, fontSize: 13, color: "#5e5749" },
  shelfChipTextOn: { fontFamily: Fonts.bodySemibold, color: Brand.white },

  emptyBox: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: "#a49d8e",
    textAlign: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d3ccbb",
    borderRadius: 10,
    padding: 16,
    marginTop: 18,
  },

  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Brand.white,
    borderWidth: 1,
    borderColor: "#e0d7c2",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginTop: 11,
  },
  entryTitle: { fontFamily: Fonts.bodySemibold, fontSize: 14, color: Brand.ink },
  entryMeta: { fontFamily: Fonts.body, fontSize: 11, color: "#7b7466", marginTop: 2 },
  entryButton: {
    backgroundColor: Brand.green,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  entryButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 12, color: Brand.white },
  assignButton: {
    borderWidth: 1,
    borderColor: Brand.green,
    backgroundColor: Brand.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  assignButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 12, color: Brand.green },

  // Quieter than Assign and Resume on purpose: three green chips on one row
  // would make a shelf of curated boards read as three equal invitations, and
  // editing is the one a coach reaches for least often.
  editButton: {
    borderWidth: 1,
    borderColor: "#e0d7c2",
    backgroundColor: "#fffdf6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  editButtonText: { fontFamily: Fonts.bodySemibold, fontSize: 12, color: Brand.ink },

  pressed: { opacity: 0.75 },
});
