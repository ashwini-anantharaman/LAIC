import { NextResponse } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { progressService } from "@/lib/progress";
import { sessionService } from "@/lib/sessions";

/** POST /api/bridge/progress/recompute-session/:id — rebuild signals from raw events. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    await sessionService().getSession(id, context); // tenant gate (throws 404-mapped)
    const signals = await progressService().recomputeSession(id);
    return NextResponse.json({ recomputed: signals.length });
  } catch (e) {
    return apiError(e);
  }
}
