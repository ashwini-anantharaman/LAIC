"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { submissionStore } from "@/lib/sessions";

export async function addReviewCommentAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const submissionId = String(formData.get("submissionId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const store = submissionStore();
  const submission = await store.getSubmission(submissionId);
  if (!submission) throw new Error("Submission not found");
  const isParty =
    submission.learnerId === context.nexusUserId ||
    submission.coachId === context.nexusUserId;
  if (!isParty) throw new Error("Only the learner and their coach can comment");

  const { newId } = await import("@bridge/kb");
  await store.addComment({
    commentId: newId("pc"),
    submissionId,
    authorId: context.nexusUserId,
    authorName: context.displayName ?? undefined,
    body,
    createdAt: new Date().toISOString(),
  });

  // The first coach comment closes the loop: submitted → reviewed.
  if (submission.coachId === context.nexusUserId && submission.status === "submitted") {
    await store.putSubmission({
      ...submission,
      status: "reviewed",
      reviewedAt: new Date().toISOString(),
    });
  }
  await audit(context, "play.comment", "play_submission", submissionId, {});
  revalidatePath(`/m/review/${submissionId}`);
}
