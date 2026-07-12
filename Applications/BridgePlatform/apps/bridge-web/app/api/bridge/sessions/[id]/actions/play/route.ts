import type { Seat } from "@bridge/events";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

/** POST /api/bridge/sessions/:id/actions/play — body { seat, cardId } (§16.2). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { seat?: Seat; cardId?: string };
    if (!body.seat || !body.cardId)
      return NextResponse.json({ error: "Body must include seat and cardId" }, { status: 400 });
    const view = await sessionService().applyExternalAction(id, context, body.seat, {
      kind: "play",
      cardId: body.cardId,
    });
    return NextResponse.json({ view });
  } catch (e) {
    return apiError(e);
  }
}
