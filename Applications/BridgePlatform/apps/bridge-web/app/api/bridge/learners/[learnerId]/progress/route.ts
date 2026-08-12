// GET /api/bridge/learners/[learnerId]/progress — the coach's view of ONE
// learner: their assignments and every feedback thread with this coach. The
// lift of /m/learner/[learnerId]: roster membership is the access rule (this
// learner must be YOURS; admins see anyone), and a coach sees only their own
// coaching relationship — an admin sees everything.

import { NextResponse } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { reconcileAssignments } from "@/lib/assignments";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { getMyLearners, isBridgeCoach, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assignmentStore, submissionStore } from "@/lib/sessions";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ learnerId: string }> },
) {
  try {
    const context = await requireContext();
    if (!isBridgeCoach(context)) throw new AccessError("Coach access required");
    const { learnerId } = await params;

    // Roster membership is the access rule (admins get the whole program back
    // from the same endpoint).
    const roster = await getMyLearners();
    const learner = roster.find((l) => l.user_id === learnerId);
    if (!learner) throw new AccessError("Not on your roster");

    const programId = (await nexusProgramIdOf()) ?? undefined;
    const scope = {
      programOrganizationId: orgScopeOf(context),
      ...(programId ? { nexusProgramId: programId } : {}),
    };
    const [rawAssignments, allSubs] = await Promise.all([
      assignmentStore().listAssignments({ ...scope, learnerId }),
      submissionStore().listSubmissions({ ...scope, learnerId }),
    ]);
    // Coaches see their own coaching relationship; admins see everything.
    const mine = <T extends { coachId: string }>(rows: T[]) =>
      context.is_admin ? rows : rows.filter((r) => r.coachId === context.nexusUserId);
    const assignments = mine(await reconcileAssignments(rawAssignments)).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const submissions = mine(allSubs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json(
      {
        learner: {
          user_id: learner.user_id,
          name: learner.name ?? null,
          email: learner.email ?? null,
        },
        assignments,
        submissions,
      },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
