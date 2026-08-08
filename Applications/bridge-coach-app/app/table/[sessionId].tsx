import { useLocalSearchParams } from "expo-router";

import { BridgeEmbed } from "../../components/bridge-embed";

/** One board at the table — opened by Resume, or from a list of unfinished
 *  boards. The table itself is the platform's (fluid design components). */
export default function TableScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <BridgeEmbed
      title="Board"
      // The table page itself, not the /m/table redirect stub — the stub is
      // one more serverless hop between the tap and the felt.
      next={`/bridge/table2/${encodeURIComponent(sessionId ?? "")}`}
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
