import { NextResponse } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

/** GET /api/bridge/sessions/:id — record + reconstructed current state. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const view = await sessionService().getSession(id, context);
    return NextResponse.json(view);
  } catch (e) {
    return apiError(e);
  }
}
