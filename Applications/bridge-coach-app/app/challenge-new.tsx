// New Challenge — the club mode of the shared wizard (components/
// challenge-wizard.tsx). Everything lives there; this screen owns only the
// chrome. The wizard reads ?draft=<entryId> itself, so "keep building" from
// the club's Drafts shelf lands here unchanged.

import { Screen, ScreenHeader } from "../components/ui";
import { ChallengeWizard } from "../components/challenge-wizard";

export default function ChallengeNewScreen() {
  return (
    <Screen>
      <ScreenHeader title="New Challenge" backTo="/club-challenges" />
      <ChallengeWizard />
    </Screen>
  );
}
