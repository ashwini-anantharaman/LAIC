import { NextResponse } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { progressService } from "@/lib/progress";
import { sessionService } from "@/lib/sessions";

/**
 * Completion result for a Learning activity launch (LP §13.3
 * BridgeLearningActivityResult): status + the bridge signal ids so Learning
 * records course progress while Bridge keeps the detailed events/signals.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ launchId: string }> },
) {
  try {
    const context = await requireContext();
    const { launchId } = await params;
    const session = (await sessionService().listSessions(context)).find(
      (s) => s.launchRef === launchId,
    );
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const signals = await progressService().listSignals(
      { bridgeSessionId: session.bridgeSessionId },
      context,
    );
    return NextResponse.json({
      launchId,
      bridgeSessionId: session.bridgeSessionId,
      status: session.status === "completed" ? "completed" : "in_progress",
      completedAt: session.completedAt,
      bridgeSignalIds: signals.map((s) => s.progressSignalId),
    });
  } catch (e) {
    return apiError(e);
  }
}
