// POST /api/bridge/challenges/:challengeId/baseline — compute ONE board's BEN
// baseline per invocation. GET — what is still outstanding.
//
// ONE BOARD, ONE INVOCATION (spec §10). BEN answers a bid in ~1.5 s but a card
// in ~21 s, so a whole board is minutes of wall clock — far past any function
// limit. This endpoint therefore does as much of one board as its budget
// allows and answers `{ status: "pending", resumable: true }`; because every
// BEN decision is cached, calling it again replays the settled part instantly
// and continues. The caller (the create-time kick-off, or a results view
// repairing a hole) just POSTs again until `resumable` is false.
//
// WHO CALLS IT. The background kick-off at create is a client-side loop over
// the challenge's boards — one POST each, sequential — because a server action
// cannot outlive its own invocation either. Server-side callers that already
// hold the user's context can import `ensureFullBenBaseline` directly instead.
//
// `{ "warm": true }` pings BEN so the cold start happens before a participant
// is waiting on it (spec §2, BEN latency).

import { NextResponse, type NextRequest } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import {
  BaselineInputError,
  ensureFromPointBaseline,
  ensureFullBenBaseline,
  ensureYourContractBaseline,
  pendingFullBenBoards,
  type BaselineResult,
} from "@/lib/challengeBaselines";
import { benConfigured, challengeBenCallCount, warmBen } from "@/lib/challengeBen";
import { challengeStore, challengeViewerAccess } from "@/lib/challenges";

/** The board can take the whole function; the baseline budget stops first. */
export const maxDuration = 300;

interface BaselineRequest {
  warm?: boolean;
  boardNo?: number;
  kind?: "full_ben" | "your_contract" | "from_point";
  /** Defaults to the caller; another user's line needs unlocked results. */
  userId?: string;
  /** `from_point` only — an index into the user's call-then-card timeline. */
  ply?: number;
  force?: boolean;
  budgetMs?: number;
}

/** The caller must actually be in this challenge before it spends BEN calls. */
async function requireParticipant(challengeId: string, userId: string) {
  const access = await challengeViewerAccess(challengeId, userId);
  if (!access.challenge) throw new AccessError("No such challenge");
  const invite = await challengeStore().getInvite(challengeId, userId);
  if (!access.viewerIsModerator && invite?.status !== "accepted")
    throw new AccessError("Not a participant");
  return access;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const context = await requireContext();
    const { challengeId } = await params;
    const body = (await request.json().catch(() => ({}))) as BaselineRequest;

    if (body.warm) return NextResponse.json({ warm: await warmBen() });

    const access = await requireParticipant(challengeId, context.nexusUserId);

    if (!benConfigured())
      return NextResponse.json(
        { error: "BEN is not configured on this server — baselines need BEN" },
        { status: 503 },
      );

    const boardNo = Number(body.boardNo);
    if (!Number.isInteger(boardNo))
      throw new BaselineInputError("boardNo is required (one board per request)");

    const kind = body.kind ?? "full_ben";
    const userId = body.userId ?? context.nexusUserId;
    // Someone else's line is only computable by a viewer who may already see
    // the standings — the same one rule the rest of the feature uses.
    if (userId !== context.nexusUserId && !access.resultsUnlocked)
      throw new AccessError("Not visible yet");

    const opts = { force: body.force, budgetMs: body.budgetMs };
    let result: BaselineResult;
    if (kind === "full_ben") {
      result = await ensureFullBenBaseline(challengeId, boardNo, opts);
    } else if (kind === "your_contract") {
      result = await ensureYourContractBaseline(challengeId, boardNo, userId, opts);
    } else if (kind === "from_point") {
      if (!Number.isInteger(Number(body.ply)))
        throw new BaselineInputError("from_point needs a ply");
      result = await ensureFromPointBaseline(challengeId, boardNo, userId, Number(body.ply), opts);
    } else {
      throw new BaselineInputError(`unknown baseline kind "${String(kind)}"`);
    }

    const { baseline } = result;
    return NextResponse.json({
      challengeId,
      boardNo,
      kind,
      userId: baseline.userId,
      ply: baseline.ply,
      status: baseline.status,
      // Honest annotation on anything that is not ready: why it failed, or how
      // far an interrupted playout got.
      note: baseline.error,
      resumable: result.resumable,
      actions: result.actions,
      benCalls: result.benCalls,
      /** Running BEN volume for this challenge (spec §10 cost check). */
      decisions: await challengeBenCallCount(challengeId),
    });
  } catch (e) {
    if (e instanceof BaselineInputError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    return apiError(e);
  }
}

/** Which boards still owe a full-BEN baseline — the kick-off loop's worklist. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const context = await requireContext();
    const { challengeId } = await params;
    await requireParticipant(challengeId, context.nexusUserId);
    return NextResponse.json({
      challengeId,
      pendingBoards: await pendingFullBenBoards(challengeId),
      decisions: await challengeBenCallCount(challengeId),
      benConfigured: benConfigured(),
    });
  } catch (e) {
    return apiError(e);
  }
}
