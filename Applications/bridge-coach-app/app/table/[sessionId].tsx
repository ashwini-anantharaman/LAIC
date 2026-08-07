import { useLocalSearchParams } from "expo-router";

import { BridgeEmbed } from "../../components/bridge-embed";

/** One board at the table — opened by Resume, or from a list of unfinished
 *  boards. The table itself is the platform's (fluid design components). */
export default function TableScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <BridgeEmbed
      title="Board"
      next={`/m/table/${encodeURIComponent(sessionId ?? "")}`}
      // Opened from Play, Resume, Assignments or My Games — `back` returns to
      // whichever. With no history (a reloaded web tab, a deep link) a board
      // belongs to Play.
      backTo="/play"
      // Leaving mid-board asks: save it for Resume, or discard it.
      confirmUnfinishedExit
    />
  );
}
