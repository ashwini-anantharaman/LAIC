import { useLocalSearchParams } from "expo-router";

import { BridgeEmbed } from "../components/bridge-embed";

/** My Games: the learner's played boards (session history) — review or send
 *  to their coach. Distinct from the library's "Plays" shelf, which holds
 *  SAVED snapshots — one word per concept.
 *
 *  With ?coach=<id> the same surface narrows to ONE COACH'S FEEDBACK: the games
 *  that coach holds, and what's left to send them. That is where a coach card
 *  on the Coach tab lands. Reusing this screen rather than adding another keeps
 *  one route per surface — the platform page does the filtering. */
export default function MyPlaysScreen() {
  const { coach } = useLocalSearchParams<{ coach?: string }>();
  const forCoach = typeof coach === "string" && coach.length > 0;
  return (
    <BridgeEmbed
      // Not the coach's name: ScreenHeader's title is centred with no line
      // clamp, so a long real name would run into the back arrow's gutter. The
      // platform page carries their name as its own heading.
      title={forCoach ? "Feedback" : "My Games"}
      next={forCoach ? `/m/plays?coach=${encodeURIComponent(coach)}` : "/m/plays"}
      // Opened from the Coach tab, so a cold start with no history must go back
      // there rather than to Home.
      {...(forCoach ? { backTo: "/coach" as const } : {})}
    />
  );
}
