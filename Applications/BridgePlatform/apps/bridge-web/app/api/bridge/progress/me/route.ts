import { ProgressAccessError } from "@bridge/progress";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { progressService } from "@/lib/progress";

/**
 * GET /api/bridge/progress/me?domainId=bridge&appId=...
 * Context params are REQUIRED (LM doc §6: no context-free progress reads).
 */
export async function GET(request: NextRequest) {
  try {
    const context = await requireContext();
    const domainId = request.nextUrl.searchParams.get("domainId");
    const appId = request.nextUrl.searchParams.get("appId");
    if (!domainId || !appId)
      return NextResponse.json(
        { error: "domainId and appId query params are required (no context-free progress reads)" },
        { status: 400 },
      );
    const summary = await progressService().getSummary(context.nexusUserId, context, domainId);
    return NextResponse.json(summary);
  } catch (e) {
    if (e instanceof ProgressAccessError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return apiError(e);
  }
}
