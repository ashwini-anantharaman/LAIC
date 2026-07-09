import { ProgressAccessError } from "@bridge/progress";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { progressService } from "@/lib/progress";

/** GET /api/bridge/progress/users/:userId?domainId=bridge&appId=... (coach view). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const context = await requireContext();
    const { userId } = await params;
    const domainId = request.nextUrl.searchParams.get("domainId");
    const appId = request.nextUrl.searchParams.get("appId");
    if (!domainId || !appId)
      return NextResponse.json(
        { error: "domainId and appId query params are required" },
        { status: 400 },
      );
    const summary = await progressService().getSummary(userId, context, domainId);
    return NextResponse.json(summary);
  } catch (e) {
    if (e instanceof ProgressAccessError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return apiError(e);
  }
}
