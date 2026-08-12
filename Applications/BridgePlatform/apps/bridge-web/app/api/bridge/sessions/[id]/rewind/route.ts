// POST /api/bridge/sessions/:id/rewind — undo's big sibling: back to the
// deal. Same gate, same audit trail (toStart), same paused-return semantics
// carried by the envelope's collapsed headSeq.

import { NextResponse } from "next/server";
import { canUse } from "@/lib/access";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { sessionService } from "@/lib/sessions";
import { sessionEnvelope } from "@/lib/tableView";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "table.undo"))) throw new AccessError("No undo here");
    const { id } = await params;
    await sessionService().rewindToStart(id);
    await audit(context, "session.undo", "kb_session", id, { toStart: true });
    const view = await sessionService().view(id);
    return NextResponse.json(sessionEnvelope(view), { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
