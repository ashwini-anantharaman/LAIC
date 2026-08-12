// POST /api/bridge/sessions/:id/step — advance one AI decision. Accepts an
// optional `sinceSeq` cursor and answers with the mutation envelope; keeps
// the two failure shapes the clients render on: 409 awaitingSeat (a human's
// turn) and 503 benUnavailable (a challenge BEN that couldn't answer — no KB
// fallback in challenges, spec §2, so the table shows "BEN is thinking…").

import { AwaitingHumanError } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { isBenUnavailable } from "@/lib/challengeBen";
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
    const body = (await request.json().catch(() => ({}))) as { sinceSeq?: number };
    const view = await sessionService().step(id);
    return NextResponse.json(
      sessionEnvelope(view, Number.isFinite(body.sinceSeq) ? body.sinceSeq : undefined),
      { headers: CORS },
    );
  } catch (e) {
    if (e instanceof AwaitingHumanError)
      return NextResponse.json(
        { error: e.message, awaitingSeat: e.seat },
        { status: 409, headers: CORS },
      );
    // A CHALLENGE table's BEN could not answer. There is no KB fallback in
    // challenges (spec §2), so this is the one seat failure that reaches the
    // client — flagged, so the table can render "BEN is thinking… / retry"
    // instead of stalling silently. Ordinary tables never take this branch:
    // their decider degrades rather than throwing.
    if (isBenUnavailable(e))
      return NextResponse.json(
        { error: e.message, benUnavailable: true, stage: e.stage, seat: e.seat },
        { status: 503, headers: CORS },
      );
    return withCors(apiError(e), "POST");
  }
}
