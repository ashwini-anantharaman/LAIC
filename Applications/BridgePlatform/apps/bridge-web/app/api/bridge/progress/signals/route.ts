import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { progressService } from "@/lib/progress";

/** GET /api/bridge/progress/signals?domainId=bridge&sessionId=... */
export async function GET(request: NextRequest) {
  try {
    const context = await requireContext();
    const domainId = request.nextUrl.searchParams.get("domainId");
    if (domainId !== "bridge")
      return NextResponse.json({ error: "domainId=bridge is required" }, { status: 400 });
    const signals = await progressService().listSignals(
      {
        nexusUserId: request.nextUrl.searchParams.get("userId") ?? undefined,
        bridgeSessionId: request.nextUrl.searchParams.get("sessionId") ?? undefined,
      },
      context,
    );
    return NextResponse.json({ signals });
  } catch (e) {
    return apiError(e);
  }
}
