// GET /api/bridge/sessions/:id/events — the traced stream, whole or from a
// cursor. ?since=N returns only events with seq > N plus the head — the
// native table's catch-up read after a gap or a foreground resync.

import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { sessionService } from "@/lib/sessions";
import { sessionEnvelope } from "@/lib/tableView";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireContext();
    const { id } = await params;
    const sinceRaw = request.nextUrl.searchParams.get("since");
    const since = sinceRaw === null ? undefined : Number(sinceRaw);
    const view = await sessionService().view(id);
    return NextResponse.json(
      sessionEnvelope(view, Number.isFinite(since) ? since : undefined),
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
