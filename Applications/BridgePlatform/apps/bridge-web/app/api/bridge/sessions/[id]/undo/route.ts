import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

/** POST /api/bridge/sessions/:id/undo — roll back the last action (§16.2). */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const view = await sessionService().undo(id, context);
    const { audit } = await import("@/lib/audit");
    await audit(context, "session.undo", "bridge_session", id, { via: "api" });
    return NextResponse.json({ view });
  } catch (e) {
    return apiError(e);
  }
}
