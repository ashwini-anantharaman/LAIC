// POST /api/bridge/sessions/:id/step — advance one AI decision.

import { AwaitingHumanError } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { isBenUnavailable } from "@/lib/challengeBen";
import { sessionService } from "@/lib/sessions";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireContext();
    const { id } = await params;
    const view = await sessionService().step(id);
    return NextResponse.json({
      state: view.state,
      actingSeat: view.actingSeat,
      actingIsHuman: view.actingIsHuman,
    });
  } catch (e) {
    if (e instanceof AwaitingHumanError)
      return NextResponse.json({ error: e.message, awaitingSeat: e.seat }, { status: 409 });
    // A CHALLENGE table's BEN could not answer. There is no KB fallback in
    // challenges (spec §2), so this is the one seat failure that reaches the
    // client — flagged, so the table can render "BEN is thinking… / retry"
    // instead of stalling silently (spec §2, BEN latency). Ordinary tables
    // never take this branch: their decider degrades rather than throwing.
    if (isBenUnavailable(e))
      return NextResponse.json(
        { error: e.message, benUnavailable: true, stage: e.stage, seat: e.seat },
        { status: 503 },
      );
    return apiError(e);
  }
}
