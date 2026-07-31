import { useLocalSearchParams } from "expo-router";

import { BridgeEmbed } from "../../components/bridge-embed";

/** One board at the table — opened by Resume, or from a list of unfinished
 *  boards. The table itself is the platform's (fluid design components). */
export default function TableScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <BridgeEmbed title="Board" next={`/m/table/${encodeURIComponent(sessionId ?? "")}`} />
  );
}
