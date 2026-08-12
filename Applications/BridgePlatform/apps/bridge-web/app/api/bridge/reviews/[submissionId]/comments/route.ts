// POST /api/bridge/reviews/[submissionId]/comments — add one comment to a
// review thread. The lift of addReviewCommentAction: party-only (learner or
// coach), and the FIRST coach comment closes the loop, flipping the
// submission submitted → reviewed.
//
// Body: { body: string } → { commentId, status } (the submission's status
// after the write, so the client can update its row without a refetch).

import { NextResponse, type NextRequest } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { submissionStore } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  try {
    const context = await requireContext();
    const { submissionId } = await params;
    const payload = (await request.json().catch(() => ({}))) as { body?: string };
    const body = String(payload.body ?? "").trim();
    if (!body) {
      return NextResponse.json(
        { error: "Write a comment first." },
        { status: 400, headers: CORS },
      );
    }

    const store = submissionStore();
    const submission = await store.getSubmission(submissionId);
    if (!submission) throw new AccessError("Submission not found");
    const isParty =
      submission.learnerId === context.nexusUserId ||
      submission.coachId === context.nexusUserId;
    if (!isParty) throw new AccessError("Only the learner and their coach can comment");

    const { newId } = await import("@bridge/kb");
    const commentId = newId("pc");
    await store.addComment({
      commentId,
      submissionId,
      authorId: context.nexusUserId,
      authorName: context.displayName ?? undefined,
      body,
      createdAt: new Date().toISOString(),
    });

    // The first coach comment closes the loop: submitted → reviewed.
    let status = submission.status;
    if (submission.coachId === context.nexusUserId && submission.status === "submitted") {
      status = "reviewed";
      await store.putSubmission({
        ...submission,
        status: "reviewed",
        reviewedAt: new Date().toISOString(),
      });
    }
    await audit(context, "play.comment", "play_submission", submissionId, {});
    return NextResponse.json({ commentId, status }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
