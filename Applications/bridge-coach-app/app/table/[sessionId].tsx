import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { StyleSheet } from "react-native";

import { showBoard } from "../../components/table-host";
import { Screen } from "../../components/ui";

/** One board at the table — opened by Resume, or from a list of unfinished
 *  boards. The table is the platform's table2 page and its coach, embedded —
 *  THE implementation (boss decision 2026-08-12).
 *
 *  This screen is a CLAIM, not the WebView's owner: the app keeps ONE
 *  persistent board WebView alive at the root (components/table-host), and
 *  this screen shows it with its board URL while focused and parks it on
 *  blur. The first board of a session boots the browser; every later one is
 *  an in-place navigation of that warm browser — most of what made opening a
 *  table slow. The felt underlay + the stack's fade keep the door identical.
 *
 *  `view=hands` opens the hand-record view (all four hands, auction, play) —
 *  what My Games' "View board" means by a finished board. `from=games` tells
 *  the platform page which journey this is (no "⟵ table" door on a record
 *  opened from history — owner decision 2026-08-07). */
export default function TableScreen() {
  const { sessionId, view, from } = useLocalSearchParams<{
    sessionId: string;
    view?: string;
    from?: string;
  }>();

  const params = new URLSearchParams();
  if (typeof view === "string" && view) params.set("view", view);
  if (typeof from === "string" && from) params.set("from", from);
  const query = params.toString();
  const next = `/bridge/table2/${encodeURIComponent(sessionId ?? "")}${query ? `?${query}` : ""}`;

  // Hand the persistent host this board's URL (on focus, so a popped Hands
  // record re-asserts the board underneath). Visibility is NOT managed here:
  // the host itself listens to the navigation container's state events and
  // is shown exactly while the current route is a table screen — no screen
  // lifecycle to miss, no exit path that can strand it.
  useFocusEffect(
    useCallback(() => {
      showBoard({ next });
    }, [next]),
  );

  return (
    <>
      {/* A board door fades in rather than sliding — the felt underlay below
          matches the host's loading cover, so the journey reads as one
          motion. */}
      <Stack.Screen options={{ animation: "fade" }} />
      <Screen style={styles.felt}>{null}</Screen>
    </>
  );
}

const styles = StyleSheet.create({
  /** The safe areas wear the felt too — no cream bars behind the board. */
  felt: { backgroundColor: "#1d5c46" },
});
