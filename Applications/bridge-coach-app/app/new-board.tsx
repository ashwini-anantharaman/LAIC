import { BridgeEmbed } from "../components/bridge-embed";

/** "New" from Play: the platform deals a fresh board against the house and
 *  drops you straight at the table (/m/quick-play creates the session). */
export default function NewBoardScreen() {
  return <BridgeEmbed title="New board" next="/m/quick-play" />;
}
