import { ProgressAccessError } from "@bridge/progress";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { progressService } from "@/lib/progress";

/**
 * Export/sync for the Coaching Platform's interpreted model (LM doc §7):
 * summarized, domain-labeled profile + signals. Coaching owns its own
 * storage — this endpoint makes no assumptions about it (LM §2 spec seam).
 * Context params required; tenant rules identical to the progress APIs.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await requireContext();
    const userId = request.nextUrl.searchParams.get("userId");
    const domainId = request.nextUrl.searchParams.get("domainId");
    if (!userId || domainId !== "bridge")
      return NextResponse.json(
        { error: "userId and domainId=bridge are required" },
        { status: 400 },
      );
    const summary = await progressService().getSummary(userId, context, domainId);
    const signals = await progressService().listSignals({ nexusUserId: userId }, context);
    return NextResponse.json({
      domainId: "bridge",
      profile: summary.profile,
      totals: summary.totals,
      bySkill: summary.bySkill,
      mistakePatterns: summary.patterns,
      signals,
    });
  } catch (e) {
    if (e instanceof ProgressAccessError)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return apiError(e);
  }
}
