import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

/**
 * POST /api/bridge/sessions/:id/start — §16.2: advance AI seats until the
 * board completes or a human seat is on play (409 with the awaiting seat).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const view = await sessionService().autoplay(id, context);
    return NextResponse.json({ view });
  } catch (e) {
    return apiError(e);
  }
}
