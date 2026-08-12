// GET /api/bridge/reviews/[submissionId] — one submitted play under review:
// the frozen board snapshot, the learner's note, and the comment thread.
// Party-or-admin gate, same as the /m/review page; everyone else gets 404.

import { canAccessAdminArea } from "@bridge/nexus-client";
import { NextResponse } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { submissionStore } from "@/lib/sessions";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  try {
    const context = await requireContext();
    const { submissionId } = await params;

    const store = submissionStore();
    const submission = await store.getSubmission(submissionId);
    if (!submission) throw new AccessError("No such submission");
    const isParty =
      submission.learnerId === context.nexusUserId ||
      submission.coachId === context.nexusUserId;
    if (!isParty && !canAccessAdminArea(context)) {
      throw new AccessError("Not a party to this review");
    }

    const comments = await store.listComments(submissionId);
    return NextResponse.json(
      {
        submission,
        comments,
        viewer: { isCoach: submission.coachId === context.nexusUserId },
      },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}
