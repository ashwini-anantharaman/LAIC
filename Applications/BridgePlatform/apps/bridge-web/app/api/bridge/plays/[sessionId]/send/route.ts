// POST /api/bridge/plays/[sessionId]/send — send a COMPLETED play to one of
// the caller's hired coaches for review. The lift of sendPlayToCoachAction:
// the coach id must be one of their own hires (never a free-typed id), the
// submission freezes a render-ready board snapshot so later forks/rewinds of
// the session can't drift the review, and re-sending to the same coach is
// idempotent.
//
// Body: { coachId?, note? } — no coachId keeps the first hire (legacy form
// behavior). Errors carry the action's exact copy.

import type { SubmissionBoard } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { getMyCoaches, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { sessionService, submissionStore } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: CORS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const context = await requireContext();
    const { sessionId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      coachId?: string;
      note?: string;
    };
    const note = String(body.note ?? "").trim();

    const coaches = await getMyCoaches();
    if (coaches.length === 0) {
      return bad("You don't have a coach yet — hire one in the app first.");
    }
    const pickedId = String(body.coachId ?? "");
    const coach = pickedId ? coaches.find((co) => co.coach_id === pickedId) : coaches[0]!;
    if (!coach) {
      return bad("That coach isn't on your list any more — pick another.");
    }

    const { record, state } = await sessionService().view(sessionId);
    if (record.createdBy !== context.nexusUserId) {
      throw new AccessError("Only your own plays can be sent for review");
    }
    if (state.phase !== "complete") {
      return bad("Finish the board before sending it for review.");
    }

    // Idempotent: the same play, already with this coach, doesn't duplicate.
    const existing = await submissionStore().listSubmissions({ sessionId });
    const already = existing.find(
      (s) => s.learnerId === context.nexusUserId && s.coachId === coach.coach_id,
    );
    if (already) {
      return NextResponse.json(
        { submissionId: already.submissionId, alreadySent: true },
        { headers: CORS },
      );
    }

    const { seededDeal, resultLabel, scoreBoard } = await import("@bridge/engine");
    const { callLabel } = await import("@bridge/events");
    const { newId } = await import("@bridge/kb");

    const score = scoreBoard(state);
    const board: SubmissionBoard = {
      name: record.board.name,
      dealer: record.board.dealer,
      vul: record.board.vul,
      hands: record.board.hands ?? seededDeal(record.board.seed),
      auction: state.auction.map((a) => ({ seat: a.seat, call: a.call })),
      play: state.tricks.flatMap((t) => t.plays.map((p) => ({ seat: p.seat, card: p.card }))),
      contractLabel: state.contract
        ? `${callLabel(`${state.contract.level}${state.contract.strain}`)} by ${state.contract.declarer}`
        : undefined,
      resultLabel: score ? resultLabel(score) : undefined,
    };

    const submissionId = newId("ps");
    await submissionStore().putSubmission({
      submissionId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
      sessionId,
      learnerId: context.nexusUserId,
      learnerName: context.displayName ?? undefined,
      coachId: coach.coach_id,
      coachName: coach.name,
      status: "submitted",
      ...(note ? { note } : {}),
      board,
      createdAt: new Date().toISOString(),
    });
    await audit(context, "play.submitted", "play_submission", submissionId, {
      sessionId,
      coachId: coach.coach_id,
    });
    return NextResponse.json({ submissionId, alreadySent: false }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
