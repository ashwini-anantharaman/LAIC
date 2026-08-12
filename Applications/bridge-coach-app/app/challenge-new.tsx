// Making a real challenge: the platform's own create page, in the app's frame.
//
// The app's `+` used to open a native panel that saved a DEVICE-LOCAL challenge —
// a row that existed on one phone, that nobody could be invited to and that no
// table could be played from. Its own comment admitted the position: "real
// challenges are assembled on the platform".
//
// They still are. Boards, seats, scoring, BEN and the invite list are the platform's
// wizard, and reimplementing that natively would be a second product to keep in step
// with the first. So the `+` comes here instead.
//
// WHY THIS IS NOT THE SCREEN QUAN REMOVED. What BridgeEmbed refuses to show is the
// platform's challenge LIST (`/bridge/challenges`, matched exactly) — a rival
// index inside the app's frame, with its own Accept buttons. This is the CREATE page
// below it, which the app has no equivalent of.
//
// And that refusal is exactly what makes the exit right: the wizard redirects to the
// list when it finishes, so `escapeTo` catches that one moment and returns to the
// app's own challenges screen. Creating therefore ends where it started, and the
// list the app does not want is never drawn.

import { BridgeEmbed } from "../components/bridge-embed";
import { useSelectedClubId } from "../lib/club-context";

export default function ChallengeNewScreen() {
  // The club decides which program the launch resolves against — a club's people
  // have no standing in the app-wide program.
  const clubId = useSelectedClubId();

  return (
    <BridgeEmbed
      title="New Challenge"
      next="/bridge/challenges/new"
      backTo="/club-challenges"
      programId={clubId ?? undefined}
      // The wizard's own "done" is a redirect to the platform's list; leaving at
      // that instant is what turns it into "back to the app's challenges".
      escapeTo={{ path: "/bridge/challenges", href: "/club-challenges" }}
    />
  );
}
