import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

/** GET /api/bridge/sessions/:id/events — the full gap-free event log (§16.2). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const events = await sessionService().getEvents(id, context);
    const lifecycle = await sessionService().getLifecycle(id, context);
    return NextResponse.json({ events, lifecycle });
  } catch (e) {
    return apiError(e);
  }
}
