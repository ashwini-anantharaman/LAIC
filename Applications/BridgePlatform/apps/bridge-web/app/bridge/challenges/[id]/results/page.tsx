// /bridge/challenges/[id]/results — the results view (spec §6, ADDENDUM A5).
//
// A challenge has no landing page (A1): tapping it starts or resumes play, and
// once you have finished it opens THIS. So everything here is retrospective —
// standings, the board-by-board grid, your own boards to review — and nothing
// on it starts a scored board.
//
// The server does all the arithmetic (buildResultsView) and hands the client
// component finished props. Access is decided in exactly two places: the
// catalogue key `page.challenges`, and `challengeViewerAccess`, which is the
// only caller of `resultsUnlocked` (A3: one rule, one place).

import { stubDisplayName } from "@bridge/nexus-client";
import { notFound, redirect } from "next/navigation";
import { requireFeature } from "@/lib/access";
import {
  challengeViewerAccess,
  listChallengeBaselines,
  listChallengeBoards,
  listChallengeInvites,
  listChallengePlays,
} from "@/lib/challenges";
import { getBridgeContext } from "@/lib/nexus";
import { ResultsClient } from "./ResultsClient";
import { buildResultsView } from "./resultsView";

export default async function ChallengeResultsPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.challenges");

  const { id } = await params;
  const viewerId = context.nexusUserId;
  const access = await challengeViewerAccess(id, viewerId);
  const challenge = access.challenge;
  // Unreadable, archived away, or simply not this person's challenge: an
  // invite that was never accepted opens nothing (A1), and a stranger's
  // results are a 404, never a 403.
  if (!challenge) notFound();
  if (!access.viewerAccepted && !access.viewerIsModerator) notFound();

  const [boards, plays, invites, baselines] = await Promise.all([
    listChallengeBoards(id),
    listChallengePlays(id),
    listChallengeInvites(id),
    listChallengeBaselines(id),
  ]);

  // Names come from the invite rows (the platform-wide people search wrote
  // them there at invite time); the dev stub roster fills in the rest.
  const inviteName = new Map(
    invites.filter((i) => i.userName).map((i) => [i.userId, i.userName as string]),
  );
  const names: Record<string, string> = {};
  for (const userId of new Set([
    ...invites.map((i) => i.userId),
    ...plays.map((p) => p.userId),
    challenge.createdBy,
  ])) {
    names[userId] =
      inviteName.get(userId) ??
      (userId === challenge.createdBy ? challenge.createdByName : undefined) ??
      stubDisplayName(userId) ??
      userId;
  }

  const view = buildResultsView({
    challenge,
    boards,
    plays,
    invites,
    baselines,
    viewerId,
    viewerFinished: access.viewerFinished,
    viewerIsModerator: access.viewerIsModerator,
    resultsUnlocked: access.resultsUnlocked,
    names,
  });

  return <ResultsClient view={view} viewerId={viewerId} />;
}
