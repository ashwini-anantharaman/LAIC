import type { SeatAssignment } from "@bridge/sessions";
import type { Seat } from "@bridge/events";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

/**
 * POST /api/bridge/sessions/:id/seat-assignments — §16.2: seating is mutable
 * ONLY between creation and the first committed action.
 * Body: { seats: { N?: SeatAssignment, E?: ..., S?: ..., W?: ... } }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      seats?: Partial<Record<Seat, SeatAssignment>>;
    };
    if (!body.seats || !Object.keys(body.seats).length)
      return NextResponse.json({ error: "Body must include seats" }, { status: 400 });
    const record = await sessionService().assignSeats(id, context, body.seats);
    return NextResponse.json({ seats: record.seats });
  } catch (e) {
    return apiError(e);
  }
}
