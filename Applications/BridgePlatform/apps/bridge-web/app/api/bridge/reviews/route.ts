// GET /api/bridge/reviews — the coach's review queue: plays their learners
// sent in. Coach-GATED like /m/reviews (a permission, never just an empty
// filter — one filter mistake turns a queue into a leak). Submissions carry
// their frozen board snapshots; the client splits open ("submitted") from
// done, same as the page.

import { NextResponse } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { isBridgeCoach, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { submissionStore } from "@/lib/sessions";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET() {
  try {
    const context = await requireContext();
    if (!isBridgeCoach(context)) throw new AccessError("Coach access required");

    const programId = (await nexusProgramIdOf()) ?? undefined;
    const submissions = await submissionStore().listSubmissions({
      programOrganizationId: orgScopeOf(context),
      ...(programId ? { nexusProgramId: programId } : {}),
      coachId: context.nexusUserId,
    });

    return NextResponse.json({ submissions }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
