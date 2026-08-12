// DELETE /api/bridge/plays/[sessionId] — remove a finished board from My
// Games. The lift of removeBoardAction, same semantics VERBATIM: the board is
// DELETED, not hidden, and IT REMOVES THE GAME EVERYWHERE (owner direction
// 2026-08-09) — the caller's submissions of it go too, with the coach's queue
// entries and any feedback written on them. It cannot be undone; the native
// confirm dialog must say so in those words.

import { NextResponse } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { sessionService, submissionStore } from "@/lib/sessions";

const CORS = corsHeaders("DELETE");

export const OPTIONS = corsOptions("DELETE");

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const context = await requireContext();
    const { sessionId } = await params;

    const service = sessionService();
    let record;
    try {
      record = await service.requireSession(sessionId);
    } catch {
      // Already gone (a double tap, or removed elsewhere). That IS the
      // asked-for outcome, so confirm it rather than raise.
      return NextResponse.json({ removed: true, reviewsRemoved: 0 }, { headers: CORS });
    }
    if (record.createdBy !== context.nexusUserId) {
      throw new AccessError("Only your own boards can be removed");
    }

    // Only the CALLER'S OWN submissions of this board — filtering by learnerId
    // as well as session is what stops one learner's removal from reaching
    // into another's review of a shared board.
    const store = submissionStore();
    const mine = (await store.listSubmissions({ sessionId })).filter(
      (s) => s.learnerId === context.nexusUserId,
    );
    for (const sub of mine) {
      await store.deleteSubmission(sub.submissionId);
      await audit(context, "play.submitted", "play_submission", sub.submissionId, {
        sessionId,
        coachId: sub.coachId,
        removed: true,
      });
    }

    await service.deleteSession(sessionId);
    await audit(context, "session.discard", "session", sessionId, {
      board: record.board.name,
      from: "games",
      reviewsRemoved: mine.length,
    });
    return NextResponse.json(
      { removed: true, reviewsRemoved: mine.length },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "DELETE");
  }
}
