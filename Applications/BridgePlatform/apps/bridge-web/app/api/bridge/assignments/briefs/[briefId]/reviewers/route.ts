// /api/bridge/assignments/briefs/[briefId]/reviewers — who reviews this
// assignment. The lifts of addReviewerAction / removeReviewerAction:
//
//   POST   { reviewerId }  add a coach from the ONE reviewer policy
//                          (lib/reviewers.ts) — finished plays are fanned out
//                          to them immediately so their queue is never a
//                          silent nothing → { backfilled }
//   DELETE { reviewerId }  detach a reviewer — everything they wrote stands;
//                          only never-opened, comment-free submissions are
//                          cleaned up. The creator can never be removed.

import { NextResponse, type NextRequest } from "next/server";

import { requireEditableAssignment } from "@/lib/assignmentEdit";
import { apiError } from "@/lib/api";
import { fanOutBriefToReviewer } from "@/lib/assignments";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { findReviewerCandidate } from "@/lib/reviewers";
import { assignmentStore, submissionStore } from "@/lib/sessions";

const CORS = corsHeaders("POST", "DELETE");

export const OPTIONS = corsOptions("POST", "DELETE");

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: CORS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ briefId: string }> },
) {
  try {
    const { briefId: key } = await params;
    const { context, set } = await requireEditableAssignment(decodeURIComponent(key));
    if (!set.brief) return bad("This assignment has no brief yet — adopt it first.");
    const body = (await request.json().catch(() => ({}))) as { reviewerId?: string };
    const reviewerId = String(body.reviewerId ?? "");

    // Checked against the ONE reviewer policy, never trusted from the client.
    const candidate = await findReviewerCandidate(context, reviewerId);
    if (!candidate) return bad("That coach can't be a reviewer here.");
    if (set.reviewers.some((r) => r.reviewerId === reviewerId)) {
      return NextResponse.json({ backfilled: 0, existing: true }, { headers: CORS });
    }

    const store = assignmentStore();
    await store.putReviewer({
      briefId: set.brief.briefId,
      reviewerId: candidate.reviewerId,
      reviewerName: candidate.name,
      isCreator: false,
      addedBy: context.nexusUserId,
      addedAt: new Date().toISOString(),
    });
    // Learners who already finished get their plays sent to the new reviewer
    // too — otherwise naming a reviewer for finished work gives them an empty
    // queue, the silent nothing this feature must not do.
    const { created } = await fanOutBriefToReviewer(set.brief, {
      id: candidate.reviewerId,
      name: candidate.name,
      isCreator: false,
    });
    await audit(context, "assignment.reviewer.added", "assignment", set.brief.briefId, {
      reviewerId: candidate.reviewerId,
      backfilled: created,
    });
    return NextResponse.json({ backfilled: created, existing: false }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ briefId: string }> },
) {
  try {
    const { briefId: key } = await params;
    const { context, set } = await requireEditableAssignment(decodeURIComponent(key));
    if (!set.brief) return bad("This assignment has no brief yet.");
    const body = (await request.json().catch(() => ({}))) as { reviewerId?: string };
    const reviewerId = String(body.reviewerId ?? "");
    const reviewer = set.reviewers.find((r) => r.reviewerId === reviewerId);
    if (!reviewer) return bad("No such reviewer on this assignment.");
    // Refused server-side, not merely hidden: the creator always reviews.
    if (reviewer.isCreator) return bad("The creator always reviews this assignment.");

    const store = assignmentStore();
    const subs = submissionStore();
    await store.removeReviewer(set.brief.briefId, reviewerId);

    // Clean up ONLY the untouched ones. `status === "submitted"` alone is not
    // enough: a LEARNER's comment leaves the status at submitted while words
    // exist, and deleting a submission cascades its comments.
    let dropped = 0;
    for (const s of set.threads.filter((t) => t.coachId === reviewerId)) {
      if (s.status !== "submitted") continue;
      try {
        if ((await subs.listComments(s.submissionId)).length > 0) continue;
        await subs.deleteSubmission(s.submissionId);
        dropped++;
      } catch {
        // Leaving a row behind is the safe direction — it stays readable.
      }
    }
    await audit(context, "assignment.reviewer.removed", "assignment", set.brief.briefId, {
      reviewerId,
      droppedUntouched: dropped,
      keptWritten: set.threads.filter((t) => t.coachId === reviewerId).length - dropped,
    });
    return NextResponse.json({ removed: true, droppedUntouched: dropped }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "DELETE");
  }
}
