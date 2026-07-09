import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { wrapEvent } from "@/lib/envelope";
import { sessionService } from "@/lib/sessions";

/**
 * Coaching event subscription (EP Phase 12; Coaching plan §23.2): cursor-based
 * polling over a session's event log, delivered in the shared
 * PlatformEventEnvelope. GET ?sessionId=...&since=<seq> — returns events with
 * seq > since plus the next cursor. (Webhook push can be added on top; the
 * envelope and cursor semantics are the contract.)
 */
export async function GET(request: NextRequest) {
  try {
    const context = await requireContext();
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId)
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    const since = Number(request.nextUrl.searchParams.get("since") ?? -1);
    const view = await sessionService().getSession(sessionId, context); // tenant gate
    const events = (await sessionService().getEvents(sessionId, context)).filter(
      (e) => e.seq > since,
    );
    return NextResponse.json({
      envelopes: events.map((e) => wrapEvent(view.record, e)),
      cursor: events.length ? events[events.length - 1]!.seq : since,
    });
  } catch (e) {
    return apiError(e);
  }
}
