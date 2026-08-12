// POST /api/bridge/sessions/:id/undo — take back the last decision. The lift
// of undoAction: gated on table.undo, audited, and the envelope's LOWER
// headSeq is the client's signal to rebuild and come back PAUSED (undo is
// for inspecting, not for auto-play to instantly redo).

import { NextResponse, type NextRequest } from "next/server";
import { canUse } from "@/lib/access";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { sessionService } from "@/lib/sessions";
import { sessionEnvelope } from "@/lib/tableView";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "table.undo"))) throw new AccessError("No undo here");
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { sinceSeq?: number };
    await sessionService().undo(id);
    await audit(context, "session.undo", "kb_session", id);
    const view = await sessionService().view(id);
    return NextResponse.json(
      sessionEnvelope(view, Number.isFinite(body.sinceSeq) ? body.sinceSeq : undefined),
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
