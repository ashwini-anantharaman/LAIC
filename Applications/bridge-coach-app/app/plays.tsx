import { BridgeEmbed } from "../components/bridge-embed";

/** My Games: the learner's played boards (session history) — review or send
 *  to their coach. Distinct from the library's "Plays" shelf, which holds
 *  SAVED snapshots — one word per concept. */
export default function MyPlaysScreen() {
  return <BridgeEmbed title="My Games" next="/m/plays" />;
}
