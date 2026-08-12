// POST /api/bridge/sessions/:id/actions — a human call or card. Accepts an
// optional `sinceSeq` cursor and answers with the mutation envelope (events
// past the cursor + head + turn facts + state), so the native table folds
// the authoritative pair without a follow-up read. The old {state,
// actingSeat, actingIsHuman} consumers read the same fields unchanged.

import type { Card } from "@bridge/events";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { sessionService } from "@/lib/sessions";
import { sessionEnvelope } from "@/lib/tableView";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireContext();
    const { id } = await params;
    const body = (await request.json()) as {
      call?: string;
      card?: Card;
      sinceSeq?: number;
    };
    const view = await sessionService().act(id, { call: body.call, card: body.card });
    return NextResponse.json(
      sessionEnvelope(view, Number.isFinite(body.sinceSeq) ? body.sinceSeq : undefined),
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
