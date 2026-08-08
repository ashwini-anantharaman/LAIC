import { BridgeEmbed } from "../components/bridge-embed";

/** "New" from Play: the platform deals a fresh board against the house and
 *  drops you straight at the table (/m/quick-play creates the session). */
export default function NewBoardScreen() {
  return (
    <BridgeEmbed
      title="New board"
      next="/m/quick-play"
      backTo="/play"
      // A fresh deal is a session like any other — leaving it mid-board asks
      // whether to keep it for Resume or discard it.
      confirmUnfinishedExit
      // The board and its coach own the whole screen; the back chip floats.
      fullScreen
    />
  );
}
