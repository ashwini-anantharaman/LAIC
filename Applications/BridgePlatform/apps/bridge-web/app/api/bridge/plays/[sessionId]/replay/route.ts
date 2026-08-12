// POST /api/bridge/plays/[sessionId]/replay — replay a finished board: a
// FRESH fork (same deal, same pinned compile, same lineup, zero events),
// returning the new sessionId to open. The original session and any review
// of it stay untouched — that's what fork is for. Lift of replayBoardAction.

import { NextResponse } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { sessionService } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(
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
      return NextResponse.json(
        { error: "That board doesn't exist any more." },
        { status: 400, headers: CORS },
      );
    }
    if (record.createdBy !== context.nexusUserId) {
      throw new AccessError("Only your own boards can be replayed");
    }

    let next;
    try {
      next = await service.fork(sessionId, record.seats, context.nexusUserId, { fresh: true });
    } catch {
      return NextResponse.json(
        { error: "Couldn't set up the replay — try again." },
        { status: 400, headers: CORS },
      );
    }
    await audit(context, "session.fork", "session", next.sessionId, {
      replayOf: sessionId,
      fresh: true,
    });
    return NextResponse.json({ sessionId: next.sessionId }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
