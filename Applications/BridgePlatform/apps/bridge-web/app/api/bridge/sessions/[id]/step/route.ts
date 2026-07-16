// POST /api/bridge/sessions/:id/step — advance one AI decision.

import { AwaitingHumanError } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
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
    return apiError(e);
  }
}
