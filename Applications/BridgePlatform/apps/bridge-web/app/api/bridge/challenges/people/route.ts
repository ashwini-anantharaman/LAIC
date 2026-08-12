// GET /api/bridge/challenges/people — who this caller may invite to a
// challenge: the ONE directory policy (app/bridge/challenges/people.ts, the
// club-scoped subset), served as JSON for the native create wizard. Gated
// like the wizard page: page.challenges + the challenge-create capability.

import { NextResponse } from "next/server";

import { listChallengePeople } from "@/app/bridge/challenges/people";
import { canCreateChallenge, canUse } from "@/lib/access";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET() {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "page.challenges"))) throw new AccessError("No access");
    if (!(await canCreateChallenge(context))) throw new AccessError("No create access");
    const people = await listChallengePeople(context);
    return NextResponse.json({ people }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
