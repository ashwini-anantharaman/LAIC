import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

/**
 * POST /api/bridge/sessions/:id/step — advance one AI decision.
 * Body: { autoplay?: true } runs AI turns until completion or a human turn.
 * 409 with { awaitingSeat } when a human seat must act.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { autoplay?: boolean };
    const view = body.autoplay
      ? await sessionService().autoplay(id, context)
      : await sessionService().step(id, context);
    return NextResponse.json(view);
  } catch (e) {
    return apiError(e);
  }
}
