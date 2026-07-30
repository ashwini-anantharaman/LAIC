import { BridgeEmbed } from "../../components/bridge-embed";

/** Play: the bridge platform's mobile library (boards, deals, tables). */
export default function PlayScreen() {
  return <BridgeEmbed title="Play" next="/m/library" resetOnFocus />;
}
