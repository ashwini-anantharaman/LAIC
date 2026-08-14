// GET /api/bridge/challenges/summary — the caller's challenges with their
// standings, as ONE read model for the club app's native Challenges screen.
//
// The results surface is a server component, which a React Native screen
// cannot render — so this route serves the same records through the same
// gates: challenges come from the caller's invites (listChallengesForUser),
// standings go through challengeViewerAccess, whose resultsUnlocked is the
// one visibility rule (A3) — a locked leaderboard is `null` here, never an
// empty array, so "hidden from you" and "nobody has finished" stay distinct.
//
// AUTH. Two credentials, one context:
//   - `Authorization: Bearer <nexus token>` (+ `x-program-id`) — the native
//     app, whose fetch has no WebView cookies to send.
//   - the launch cookie — anything already inside the embed.
// The bearer is the same Nexus session token the cookie would carry, resolved
// through the same client. CORS is open because the route never reads cookies
// for the bearer path and answers only for the token it was handed.

import { challengeScores, type ChallengeScoring, type ChallengeStatus } from "@bridge/challenges";
import { stubDisplayName } from "@bridge/nexus-client";
import { NextResponse, type NextRequest } from "next/server";

import { formatTotal } from "@/app/bridge/challenges/[id]/results/resultsView";
import { canUse } from "@/lib/access";
import { AccessError, apiError } from "@/lib/api";
import {
  challengeViewerAccess,
  listChallengeBaselines,
  listChallengeBoards,
  listChallengeInvites,
  listChallengePlays,
  listChallengesForUser, listPersonalChallengesForUser, challengeOwnerScope } from "@/lib/challenges";
import { corsHeaders, corsOptions } from "@/lib/cors";
import { getBridgeContext, getBridgeContextFromToken } from "@/lib/nexus";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

interface SummaryLeaderboardRow {
  rank: number;
  name: string;
  isYou: boolean;
  /** The challenge total in the mode's own unit (avg % for mp, sum otherwise). */
  total: number;
  /** The total as the results page would print it — "56.2%", "+14", "+3,120". */
  totalDisplay: string;
  /** Matchpoints won across the boards (mp mode only). */
  matchpoints: number | null;
}

interface ChallengeSummary {
  challengeId: string;
  title: string;
  description: string;
  createdByName: string;
  scoring: ChallengeScoring;
  boardCount: number;
  createdAt: string;
  /** Archived challenges are retired: their results stay readable, play does not.
   *  The app needs it to label one, and to offer a moderator the reverse. */
  status: ChallengeStatus;
  inviteStatus: "pending" | "accepted" | "declined" | "none";
  viewer: {
    finishedBoards: number;
    totalBoards: number;
    finished: boolean;
    moderator: boolean;
    resultsUnlocked: boolean;
    /**
     * When THIS viewer last touched a board here — the latest completedAt, or
     * startedAt for a board still open. Null if they have never played one.
     *
     * It exists so a client can say "resume what you were last playing" and mean
     * it. Ordering by the challenge's own createdAt cannot: the challenge you are
     * mid-way through is often not the newest one, which is exactly the case that
     * made a single "latest" card hide an in-progress game.
     */
    lastPlayedAt: string | null;
  };
  /** Null while the viewer's results are locked — not the same as []. */
  leaderboard: SummaryLeaderboardRow[] | null;
  benTotalDisplay: string | null;
}

async function summarize(
  challengeId: string,
  viewerId: string,
): Promise<ChallengeSummary | null> {
  const access = await challengeViewerAccess(challengeId, viewerId);
  const challenge = access.challenge;
  // Archived challenges ARE returned, and `status` below says which they are.
  //
  // They used to be dropped here, which was right while the app had no way to show
  // one: an archived challenge among the playable tiles is just confusing. The app now
  // has an archive view, and a row it never receives cannot appear in it — so the
  // decision moves to the client, which splits the list by status. Excluding them here
  // made the archive permanently empty.
  if (!challenge) return null;

  const [boards, plays, invites, baselines] = await Promise.all([
    listChallengeBoards(challengeId),
    listChallengePlays(challengeId),
    listChallengeInvites(challengeId),
    listChallengeBaselines(challengeId),
  ]);

  // Names resolve exactly as on the results page: the invite row (written at
  // invite time), then the creator's own name, then the dev stub roster.
  const inviteName = new Map(
    invites.filter((i) => i.userName).map((i) => [i.userId, i.userName as string]),
  );
  const nameOf = (userId: string): string =>
    inviteName.get(userId) ??
    (userId === challenge.createdBy ? challenge.createdByName : undefined) ??
    stubDisplayName(userId) ??
    userId;

  // The results page's own gate (A1): an invite that was never accepted opens
  // nothing, moderators excepted — the summary hands out no more than the page.
  const mayViewResults =
    access.resultsUnlocked && (access.viewerAccepted || access.viewerIsModerator);

  let leaderboard: SummaryLeaderboardRow[] | null = null;
  let benTotalDisplay: string | null = null;
  if (mayViewResults) {
    const completed = plays.filter(
      (p) => p.status === "completed" && typeof p.rawScore === "number",
    );
    const benRawByBoard = new Map<number, number>();
    for (const b of baselines) {
      if (b.kind === "full_ben" && b.status === "ready" && typeof b.rawScore === "number") {
        benRawByBoard.set(b.boardNo, b.rawScore);
      }
    }
    const scores = challengeScores({
      mode: challenge.scoring,
      boards: boards.map((b) => ({
        boardNo: b.boardNo,
        scores: completed
          .filter((p) => p.boardNo === b.boardNo)
          .map((p) => ({ userId: p.userId, rawScore: p.rawScore as number })),
        benRawScore: benRawByBoard.get(b.boardNo),
      })),
    });

    // The MP column: matchpoints won, summed over the boards. The percentage
    // (the ranked figure) is the total itself.
    const matchpointsByUser = new Map<string, number>();
    if (challenge.scoring === "mp") {
      for (const board of scores.boards) {
        for (const s of board.field.scores) {
          if (typeof s.matchpoints === "number") {
            matchpointsByUser.set(s.userId, (matchpointsByUser.get(s.userId) ?? 0) + s.matchpoints);
          }
        }
      }
    }

    leaderboard = scores.standings.map((s) => ({
      rank: s.rank,
      name: nameOf(s.userId),
      isYou: s.userId === viewerId,
      total: s.total,
      totalDisplay: formatTotal(challenge.scoring, s.total),
      matchpoints: matchpointsByUser.get(s.userId) ?? null,
    }));
    // BEN is measured against the field — no field, no benchmark (A5).
    benTotalDisplay =
      scores.benTotal === null || scores.standings.length === 0
        ? null
        : formatTotal(challenge.scoring, scores.benTotal);
  }

  const invite = invites.find((i) => i.userId === viewerId);
  // The viewer's own plays only: `plays` is the whole field's.
  const lastPlayedAt =
    plays
      .filter((p) => p.userId === viewerId)
      .map((p) => p.completedAt ?? p.startedAt)
      .filter((t): t is string => !!t)
      // ISO strings, so lexical max IS chronological max.
      .sort()
      .at(-1) ?? null;
  return {
    challengeId,
    title: challenge.title,
    description: challenge.description ?? "",
    createdByName: nameOf(challenge.createdBy),
    scoring: challenge.scoring,
    boardCount: access.totalBoards,
    createdAt: challenge.createdAt,
    // The app needs this to label an archived challenge and to offer a moderator
    // the reverse — without it the archive control could only ever be one-way.
    status: challenge.status,
    inviteStatus:
      invite?.status ?? (challenge.createdBy === viewerId ? "accepted" : "none"),
    viewer: {
      finishedBoards: access.finishedBoards,
      totalBoards: access.totalBoards,
      finished: access.viewerFinished,
      moderator: access.viewerIsModerator,
      resultsUnlocked: mayViewResults,
      lastPlayedAt,
    },
    leaderboard,
    benTotalDisplay,
  };
}

export async function GET(request: NextRequest) {
  try {
    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const programId =
      request.headers.get("x-program-id") ?? request.nextUrl.searchParams.get("program_id");
    const context = bearer
      ? await getBridgeContextFromToken(bearer, programId)
      : await getBridgeContext();
    if (!context) throw new AccessError("Not signed in");
    if (!(await canUse(context, "page.challenges"))) throw new AccessError("No access");

    const viewerId = context.nexusUserId;
    // The club the app asked about (x-program-id) now FILTERS, where before it only
    // resolved auth. Two clubs, two lists.
    // `?scope=personal` asks for PRIVATE TABLES — the viewer's own, from any club or
    // none. Anything else is the club read, which excludes them. One route, because
    // the shape of a summarised challenge is identical either way; two listings,
    // because the question is not.
    const personal = request.nextUrl.searchParams.get("scope") === "personal";
    const mine = personal
      ? await listPersonalChallengesForUser(viewerId)
      : await listChallengesForUser(viewerId, challengeOwnerScope(context));
    const summaries = (
      await Promise.all(mine.map((c) => summarize(c.challengeId, viewerId)))
    ).filter((s): s is ChallengeSummary => s !== null);
    summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ challenges: summaries }, { headers: CORS });
  } catch (e) {
    const res = apiError(e);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  }
}
