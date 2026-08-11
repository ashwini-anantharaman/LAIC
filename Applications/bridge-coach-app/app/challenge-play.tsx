// Playing a challenge, inside the app.
//
// Two callers, one screen. The Club tab's LATEST CHALLENGE thumbnail lands
// here with no id — the bridge resolves "latest" itself at
// /bridge/challenges/latest/play and redirects into the table. The Challenges
// screen's tiles land here WITH an id (the summary endpoint told the app which
// challenges exist), and open that specific challenge: play if it still has
// boards for you, results once you have finished — the platform's entry page
// decides, same as tapping it on the web.
//
// The launch is minted for the SELECTED CLUB, not the app-wide program — a club's
// people have no standing in that program, and every challenge route would render
// its 404-for-forbidden. See launchBridgePlatform's note.
//
// Back goes to /club rather than unwinding the web history: the embed may be
// several redirects deep (latest → [id]/play → table2/[sessionId]) and walking
// back through those would re-enter play.

import { useLocalSearchParams } from "expo-router";

import { BridgeEmbed } from "../components/bridge-embed";
import { useSelectedClubId } from "../lib/club-context";

export default function ChallengePlayScreen() {
  const clubId = useSelectedClubId();
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <BridgeEmbed
      title="Challenge"
      next={id ? `/bridge/challenges/${id}/play` : "/bridge/challenges/latest/play"}
      backTo="/club"
      programId={clubId ?? undefined}
      // The entry route bounces an unaccepted invite to the platform's OWN
      // challenges list — a different-looking product the app must never show
      // (owner direction 2026-08-11). Land back on the app's screens instead:
      // this challenge's info page (where Accept now lives), or the native
      // Challenges screen when the id is the platform's to resolve.
      escapeTo={
        id
          ? { path: "/bridge/challenges", href: { pathname: "/challenge-info", params: { id } } }
          : { path: "/bridge/challenges", href: "/club-challenges" }
      }
    />
  );
}
