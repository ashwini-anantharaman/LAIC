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

export default function LiveChallengesScreen() {
  return <BridgeEmbed title="Challenges" next="/bridge/challenges" backTo="/club" />;
}
