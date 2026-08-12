// POST /api/bridge/sessions/:id/discard — "don't save my progress", the JSON
// twin of the WebView-era GET /m/table/[sessionId]/discard (which stays for
// the embeds). Same guards: only the session's own creator, only while the
// board is unfinished — a finished board is history (My Games), not clutter.
// Already-gone confirms rather than raises: that IS the asked-for outcome.

import { NextResponse } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { sessionService } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;

    let record;
    try {
      record = await sessionService().requireSession(id);
    } catch {
      return NextResponse.json({ discarded: true }, { headers: CORS });
    }

    if (record.createdBy !== context.nexusUserId) {
      throw new AccessError("Only your own boards can be discarded");
    }
    if (record.status === "completed") {
      return NextResponse.json(
        { error: "A finished board is history, not clutter — remove it from My Games instead." },
        { status: 400, headers: CORS },
      );
    }

    await sessionService().deleteSession(id);
    await audit(context, "session.discard", "session", id, { board: record.board.name });
    return NextResponse.json({ discarded: true }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
