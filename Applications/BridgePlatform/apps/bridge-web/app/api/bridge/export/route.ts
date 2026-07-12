import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { exportSession } from "@/lib/formats";
import { sessionService } from "@/lib/sessions";

/**
 * GET /api/bridge/export?sessionId=…&format=pbn|lin — the session's board
 * plus everything played so far, as downloadable PBN or LIN (§7.2).
 */
export async function GET(request: NextRequest) {
  try {
    const context = await requireContext();
    const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
    const format = request.nextUrl.searchParams.get("format") === "lin" ? "lin" : "pbn";
    const view = await sessionService().getSession(sessionId, context);
    const text = exportSession(view.record, view.state, format);
    return new NextResponse(text, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${sessionId}.${format}"`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
