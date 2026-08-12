// GET /api/bridge/plays — "My games" as one JSON read model: the lift of
// /m/plays. Finished boards as SUMMARIES (names and dates — never the whole
// SessionRecord; see the page for the 2.8MB lesson), every submission thread
// the learner owns, and their hired coaches. The ?coach=<id> focus view is a
// client-side narrowing of this same payload — everything it needs is here.

import { NextResponse } from "next/server";

import { apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { getMyCoaches, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { sessionService, submissionStore } from "@/lib/sessions";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET() {
  try {
    const context = await requireContext();

    const programId = (await nexusProgramIdOf()) ?? undefined;
    const scope = {
      programOrganizationId: orgScopeOf(context),
      ...(programId ? { nexusProgramId: programId } : {}),
    };
    const [completed, submissions, coaches] = await Promise.all([
      sessionService().listRecentSummaries({
        ...scope,
        createdBy: context.nexusUserId,
        status: "completed",
      }),
      submissionStore().listSubmissions({ ...scope, learnerId: context.nexusUserId }),
      getMyCoaches().catch(() => []),
    ]);

    return NextResponse.json({ completed, submissions, coaches }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
