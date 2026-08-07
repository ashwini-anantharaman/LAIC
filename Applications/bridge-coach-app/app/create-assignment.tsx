import { BridgeEmbed } from "../components/bridge-embed";

/** Create Assignment (coach, from the Coach tab): author a board on the
 *  platform's deal editor, then — because of ?flow=assign — the save lands
 *  straight on the assign picker, and assigning lands on Assignments. One
 *  flow, three platform pages, one embed. */
export default function CreateAssignmentScreen() {
  return <BridgeEmbed title="Create Assignment" next="/m/library/new?flow=assign" backTo="/coach" />;
}
