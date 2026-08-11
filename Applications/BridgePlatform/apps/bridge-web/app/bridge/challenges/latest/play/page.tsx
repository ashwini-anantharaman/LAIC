// /bridge/challenges/latest/play — "play my most recent challenge", with no id.
//
// The Bridge Bird app's Club tab shows a LATEST CHALLENGE tile, and tapping it
// should drop the person straight into playing. The app cannot name a challenge:
// challenge records live in the bridge schema, carry no program_id, and Nexus
// neither creates nor queries those tables — so there is nothing for the app to
// read an id from. This route resolves "latest" on the side that already holds
// the data, and then hands off to the ordinary entry.
//
// It adds no new rule about who may play. Everything below reuses the same
// readers the challenge LIST uses, and the redirect lands on
// /bridge/challenges/[id]/play, which is still the only door into a table —
// including its invite check (entry.ts: nothing opens until an invite is
// accepted).
//
// A static segment beats a dynamic one in Next's router, so this wins over
// [id]/play. The cost is that a challenge whose id were literally "latest"
// would be unreachable by URL; ids are generated, so that cannot happen.

import { redirect } from "next/navigation";
import { requireFeature } from "@/lib/access";
import { listChallengesForUser, listInvitesForUser } from "@/lib/challenges";
import { getBridgeContext } from "@/lib/nexus";

const LIST = "/bridge/challenges";

export default async function LatestChallengePlayPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.challenges");

  const userId = context.nexusUserId;
  const [challenges, invites] = await Promise.all([
    listChallengesForUser(userId),
    listInvitesForUser(userId),
  ]);

  // Only challenges this person has ACCEPTED can be entered. A pending invite
  // has to be accepted on the list card first — sending them to /play would
  // bounce them back here anyway — and a declined one is not theirs to play.
  const accepted = new Set(
    invites.filter((i) => i.status === "accepted").map((i) => i.challengeId),
  );
  const playable = challenges
    .filter((c) => accepted.has(c.challengeId) && c.status !== "archived")
    // Newest first. createdAt is an ISO string, so lexical order IS chronological.
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  // Nothing to drop into: the list is the honest destination, since it is where
  // a pending invite is accepted and where "no challenges yet" is explained.
  if (!playable.length) redirect(LIST);

  redirect(`/bridge/challenges/${playable[0].challengeId}/play`);
}
