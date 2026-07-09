import { NextResponse } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

/** GET /api/bridge/sessions/:id/events — the full ordered event log. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const events = await sessionService().getEvents(id, context);
    return NextResponse.json({ events });
  } catch (e) {
    return apiError(e);
  }
}
