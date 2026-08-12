import { Stack, useLocalSearchParams } from "expo-router";

import { BridgeEmbed } from "../../components/bridge-embed";

/** One board at the table — opened by Resume, or from a list of unfinished
 *  boards. The table is the platform's table2 page and its coach, embedded —
 *  THE implementation (boss decision 2026-08-12: the app continues on the
 *  webview; the native ports were removed the same day, and live in git
 *  history at 31f0f5ba should that ever reverse). The app's own chrome — the
 *  fade door, the felt loading cover, the quit pull-out — wraps it here.
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

  // A board door fades in rather than sliding — with the felt loading cover
  // inside, the tap→felt journey reads as one motion.
  const params = new URLSearchParams();
  if (typeof view === "string" && view) params.set("view", view);
  if (typeof from === "string" && from) params.set("from", from);
  const query = params.toString();
  return (
    <>
    <Stack.Screen options={{ animation: "fade" }} />
    <BridgeEmbed
      title="Board"
      // The table page itself, not the /m/table redirect stub — the stub is
      // one more serverless hop between the tap and the felt.
      next={`/bridge/table2/${encodeURIComponent(sessionId ?? "")}${query ? `?${query}` : ""}`}
      // Opened from Play, Resume, Assignments or My Games — `back` returns to
      // whichever. With no history (a reloaded web tab, a deep link) a board
      // belongs to Play.
      backTo="/play"
      // Leaving mid-board asks: save it for Resume, or discard it.
      confirmUnfinishedExit
      // The board and its coach own the whole screen; the back chip floats.
      fullScreen
    />
    </>
  );
}
