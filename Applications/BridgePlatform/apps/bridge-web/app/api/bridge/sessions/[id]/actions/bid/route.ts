import type { Call, Seat } from "@bridge/events";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

/** POST /api/bridge/sessions/:id/actions/bid — body { seat, call } (§16.2). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { seat?: Seat; call?: Call };
    if (!body.seat || !body.call)
      return NextResponse.json({ error: "Body must include seat and call" }, { status: 400 });
    const view = await sessionService().applyExternalAction(id, context, body.seat, {
      kind: "bid",
      call: body.call,
    });
    return NextResponse.json({ view });
  } catch (e) {
    return apiError(e);
  }
}
