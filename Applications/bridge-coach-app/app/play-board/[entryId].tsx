import { useLocalSearchParams } from "expo-router";

import { BridgeEmbed } from "../../components/bridge-embed";

/** Learn↔Play landing: deals the lesson's embedded board onto a live table
 *  (the bridge platform's /m/play-entry deep link creates the session). */
export default function PlayBoardScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  return (
    <BridgeEmbed
      title="Play"
      next={`/m/play-entry/${encodeURIComponent(entryId ?? "")}`}
      backTo="/play"
    />
  );
}
