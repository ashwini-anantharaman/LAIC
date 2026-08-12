import { useLocalSearchParams } from "expo-router";

import { BridgeEmbed } from "../../components/bridge-embed";
import { NativeTable } from "../../components/table/native-table";

/** One board at the table — opened by Resume, or from a list of unfinished
 *  boards. The table itself is the platform's (fluid design components).
 *
 *  `view=hands` opens the hand-record view (all four hands, auction, play) —
 *  what My Games' "View board" means by a finished board. `from=games` tells
 *  the platform page which journey this is (no "⟵ table" door on a record
 *  opened from history — owner decision 2026-08-07).
 *
 *  ?native=1 renders the NATIVE board instead (Part II, view-only for now) —
 *  the flag stays until the native table reaches parity, then flips default. */
export default function TableScreen() {
  const { sessionId, view, from, native } = useLocalSearchParams<{
    sessionId: string;
    view?: string;
    from?: string;
    native?: string;
  }>();

  if (native === "1") {
    // The native table owns its whole screen — header, leave-board dialog,
    // transport — because the save-or-discard question reads its own store.
    return <NativeTable sessionId={String(sessionId ?? "")} />;
  }

  const params = new URLSearchParams();
  if (typeof view === "string" && view) params.set("view", view);
  if (typeof from === "string" && from) params.set("from", from);
  const query = params.toString();
  return (
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
  );
}
