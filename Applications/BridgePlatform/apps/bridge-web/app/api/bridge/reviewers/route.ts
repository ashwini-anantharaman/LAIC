// GET /api/bridge/reviewers — who the caller may name as a reviewer on an
// assignment, plus their own fixed creator row. Coach-gated like the /m/assign
// page. The pool comes from lib/reviewers.ts — the ONE policy file — so when
// the owner narrows it (promised 2026-08-09), this route narrows with it.

import { NextResponse } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { isBridgeCoach } from "@/lib/nexus";
import { reviewerCandidates, selfReviewer } from "@/lib/reviewers";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET() {
  try {
    const context = await requireContext();
    if (!isBridgeCoach(context)) throw new AccessError("Coach access required");
    const candidates = await reviewerCandidates(context);
    return NextResponse.json(
      { self: selfReviewer(context), candidates },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
