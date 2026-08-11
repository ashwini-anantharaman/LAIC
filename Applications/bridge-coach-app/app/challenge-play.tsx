// Playing the latest challenge, inside the app.
//
// The Club tab's LATEST CHALLENGE thumbnail lands here. There is deliberately no
// challenge id in this route: the app has no way to learn one (challenge records
// live in the bridge schema, carry no program_id, and Nexus does not query those
// tables), so the bridge resolves "latest" itself at
// /bridge/challenges/latest/play and redirects into the table.
//
// The launch is minted for the SELECTED CLUB, not the app-wide program — a club's
// people have no standing in that program, and every challenge route would render
// its 404-for-forbidden. See launchBridgePlatform's note.
//
// Back goes to /club rather than unwinding the web history: the embed may be
// several redirects deep (latest → [id]/play → table2/[sessionId]) and walking
// back through those would re-enter play.

import { BridgeEmbed } from "../components/bridge-embed";
import { useSelectedClubId } from "../lib/club-context";

export default function ChallengePlayScreen() {
  const clubId = useSelectedClubId();
  return (
    <BridgeEmbed
      title="Challenge"
      next="/bridge/challenges/latest/play"
      backTo="/club"
      programId={clubId ?? undefined}
    />
  );
}
