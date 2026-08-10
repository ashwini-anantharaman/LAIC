// The platform's real Challenges, embedded (Phase 1).
//
// The app's own Challenges screen is still a designed shell over seeded data.
// This is the working feature: /bridge/challenges on the bridge platform, where a
// challenge is actually assembled, played against BEN, scored and compared.
//
// It is deliberately the DESKTOP route, not an /m/ mobile twin — challenges have
// no mobile route, and their own commits claim a phone-sized canvas ("a true
// iPhone 13 canvas", "the phone nav is always one slim row, folded behind the
// ☰"). Embedding it is how we find out whether that holds at 390pt; if the
// platform's own chrome intrudes, the answer is an /m/challenges route on the
// platform, not more work here.

import { BridgeEmbed } from "../components/bridge-embed";
import { useSelectedClubId } from "../lib/club-context";

export default function LiveChallengesScreen() {
  // Launch as the CLUB, not the app-wide program. A club's people are not in that
  // program, so launching it gave them no standing and every challenge route
  // answered 404 — which is how this page reports "forbidden". Launching the club
  // takes the partner path, which emits bridge_club_member: page.challenges and
  // challenge.create, nothing else on the platform.
  const clubId = useSelectedClubId();
  return (
    <BridgeEmbed
      title="Challenges"
      next="/bridge/challenges"
      backTo="/club"
      programId={clubId ?? undefined}
    />
  );
}
