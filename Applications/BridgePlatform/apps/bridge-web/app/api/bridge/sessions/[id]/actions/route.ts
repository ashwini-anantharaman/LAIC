// POST /api/bridge/sessions/:id/actions — a human call or card. Accepts an
// optional `sinceSeq` cursor and answers with the mutation envelope (events
// past the cursor + head + turn facts + state), so the native table folds
// the authoritative pair without a follow-up read. The old {state,
// actingSeat, actingIsHuman} consumers read the same fields unchanged.

import type { Call, Card } from "@bridge/events";
import { NextResponse, type NextRequest } from "next/server";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { assertCoachLine, OffLineError } from "@/lib/curatedGate";
import { sessionService } from "@/lib/sessions";
import { studioAccess } from "@/lib/studioSession";
import { sessionEnvelope } from "@/lib/tableView";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const body = (await request.json()) as {
      call?: string;
      card?: Card;
      sinceSeq?: number;
    };
    // A LOCKED curated board refuses off-line actions before they commit
    // (curated v2). One cheap record read decides whether the gate runs at
    // all — ordinary tables pay nothing.
    const record = await sessionService().requireSession(id);
    // A STUDIO AUCTION ACCEPTS A CALL AT A CHAIR NOBODY SITS IN — the coach
    // bids all four hands (@bridge/sessions coachBidsThisSeat). The session
    // service checks seat KIND and never identity, by design, so the door owes
    // that check: this has to be the coach's own board.
    if (record.authoring && !studioAccess(record, context.nexusUserId).studio)
      throw new AccessError("Not your authoring session");
    if (record.curated) {
      await assertCoachLine(await sessionService().view(id), {
        call: body.call as Call | undefined,
        card: body.card,
      });
    }
    const view = await sessionService().act(id, { call: body.call, card: body.card });
    return NextResponse.json(
      sessionEnvelope(view, Number.isFinite(body.sinceSeq) ? body.sinceSeq : undefined),
      { headers: CORS },
    );
  } catch (e) {
    if (e instanceof OffLineError)
      return NextResponse.json(
        { offLine: true, ...(e.why ? { why: e.why } : {}), hintAvailable: e.hintAvailable },
        { status: 409, headers: CORS },
      );
    return withCors(apiError(e), "POST");
  }
}
