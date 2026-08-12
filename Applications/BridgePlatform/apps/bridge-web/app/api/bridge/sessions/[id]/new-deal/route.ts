// POST /api/bridge/sessions/:id/new-deal — fresh cards for the SAME table:
// same lineup, same pinned compile. The lift of newDealAction (unlike
// quick-play, which re-derives a default lineup from the KB's live compile).
// → { sessionId } of the new board to open.

import { NextResponse } from "next/server";

import { canUse } from "@/lib/access";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "table.new_deal"))) throw new AccessError("No new deals");
    const { id } = await params;

    const service = sessionService();
    const record = await service.requireSession(id);
    const compiled = await service.compiledFor(record);
    const next = await service.createSession({
      kbId: record.kbId,
      compiled,
      seats: record.seats,
      seed: (Date.now() % 100_000) + 1,
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    });
    await audit(context, "profile.update", "kb_session", next.sessionId, {
      kbId: record.kbId,
      newDealFrom: id,
    });
    return NextResponse.json({ sessionId: next.sessionId }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
