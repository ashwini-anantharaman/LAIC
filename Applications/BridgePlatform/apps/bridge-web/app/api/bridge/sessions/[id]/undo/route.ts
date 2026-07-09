import { NextResponse } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

/** POST /api/bridge/sessions/:id/undo — rewind the last committed action. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const view = await sessionService().undo(id, context);
    return NextResponse.json(view);
  } catch (e) {
    return apiError(e);
  }
}
