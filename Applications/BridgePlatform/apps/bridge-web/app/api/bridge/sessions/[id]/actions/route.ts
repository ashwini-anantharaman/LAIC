import type { Seat } from "@bridge/events";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

/**
 * POST /api/bridge/sessions/:id/actions — commit a human action.
 * Body: { seat, kind: "bid", call } or { seat, kind: "play", cardId }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const body = (await request.json()) as
      | { seat: Seat; kind: "bid"; call: string }
      | { seat: Seat; kind: "play"; cardId: string };
    const view = await sessionService().applyExternalAction(
      id,
      context,
      body.seat,
      body.kind === "bid"
        ? { kind: "bid", call: body.call }
        : { kind: "play", cardId: body.cardId },
    );
    return NextResponse.json(view);
  } catch (e) {
    return apiError(e);
  }
}
