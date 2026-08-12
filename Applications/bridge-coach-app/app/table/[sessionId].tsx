import { Stack, useLocalSearchParams } from "expo-router";

import { BridgeEmbed } from "../../components/bridge-embed";
import { NativeTable } from "../../components/table/native-table";

/** One board at the table — opened by Resume, or from a list of unfinished
 *  boards. THE WEBVIEW BOARD IS THE DEFAULT (owner direction 2026-08-12,
 *  reversing the same day's native flip): the platform's table2 page and its
 *  coach, embedded — with the app's own chrome (the fade door, the felt
 *  loading cover, the quit pull-out) unchanged around it.
 *
 *  `view=hands` opens the four-hand RECORD page (My Games' "View board");
 *  `from=…` tells the platform page which journey a record came from.
 *
 *  ?native=1 renders the NATIVE board instead — the platform table's phone
 *  tier and the original coach, ported 1:1 and fed by the JSON API. It is
 *  strictly opt-in; any future default flip is the owner's call alone. */
export default function TableScreen() {
  const { sessionId, view, from, native } = useLocalSearchParams<{
    sessionId: string;
    view?: string;
    from?: string;
    native?: string;
  }>();

  // A board door fades in rather than sliding — with the felt loading cover
  // inside, the tap→felt journey reads as one motion.
  const fade = <Stack.Screen options={{ animation: "fade" }} />;

  if (native === "1" && !(typeof view === "string" && view)) {
    // The native table owns its whole screen — the pull-out exit, the
    // leave-board dialog, the ☰ and Seats overlays — because the
    // save-or-discard question reads its own store.
    return (
      <>
        {fade}
        <NativeTable sessionId={String(sessionId ?? "")} />
      </>
    );
  }

  const params = new URLSearchParams();
  if (typeof view === "string" && view) params.set("view", view);
  if (typeof from === "string" && from) params.set("from", from);
  const query = params.toString();
  return (
    <>
    {fade}
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
