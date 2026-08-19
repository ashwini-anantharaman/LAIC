"use server";

// Editing one assignment (0028): its instruction, its learners, its reviewers.
//
// Two rules run through every action here.
//
// 1. CREATORSHIP, NOT REVIEWERSHIP, grants the right to change things. Without
//    that split a named reviewer could add learners and thereby hand themselves
//    threads on plays nobody asked them to review.
// 2. DETACH, NEVER DESTROY (owner direction 2026-08-09). Removing a learner
//    leaves the game they played and the feedback on it standing; removing a
//    reviewer keeps everything they already wrote. Only a review that was never
//    opened — still 'submitted', not one word on it — is cleaned up, because
//    nothing of anyone's is lost in that case.

import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { fanOutBriefToReviewer } from "@/lib/assignments";
import { deleteAssignmentSet } from "@/lib/assignmentEdit";
import { adoptLegacyGroup, loadAssignment } from "@/lib/assignmentSets";
import { copyForAssign, libraryPrincipalOf } from "@/lib/libraryComponent";
import { getMyLearners } from "@/lib/nexus";
import { findReviewerCandidate } from "@/lib/reviewers";
import { assignmentStore, submissionStore } from "@/lib/sessions";
import type { LoadedAssignment } from "@/lib/assignmentSets";
import type { NexusBridgeContext } from "@laic/learner-contracts";

/** Load the set and refuse anyone who may not change it. */
async function requireEditable(
  key: string,
): Promise<{ context: NexusBridgeContext; set: LoadedAssignment }> {
  const context = await requireContext();
  const set = await loadAssignment(key, context);
  if (!set) redirect("/m/assignments");
  // A reviewer may look, never change — creatorship is what grants edit rights.
  // Read from the package's view so this can never disagree with what the page
  // rendered (it did once, and the UI hid controls the server allowed).
  if (!set.view.canEdit) redirect(back(key));
  return { context, set };
}

/**
 * Back to the OPEN SHEET over the list (owner direction 2026-08-09: the editor is
 * a popup, not its own screen), so a save or a removal leaves the coach exactly
 * where they were rather than on a page of their own.
 *
 * `edit=<key>` does two jobs: it says which sheet shows the result banner, and it
 * forces that sheet open. A fragment cannot do the second job here — this is a
 * client-side redirect, and browsers do not re-evaluate `:target` for one.
 */
function back(key: string, param?: string): string {
  const q = `edit=${encodeURIComponent(key)}${param ? `&${param}` : ""}`;
  return `/m/assignments?${q}`;
}

/**
 * Give a legacy group a brief so it can hold reviewers at all. Without this the
 * ✎ on a pre-0028 card would offer controls that silently do nothing.
 */
export async function adoptAssignmentAction(formData: FormData): Promise<void> {
  const key = String(formData.get("key"));
  const { context, set } = await requireEditable(key);
  if (set.brief) redirect(back(set.view.key));
  const briefId = await adoptLegacyGroup(set, context);
  await audit(context, "assignment.brief.created", "assignment", briefId, {
    adoptedFrom: key,
    learners: set.issues.length,
  });
  redirect(back(briefId, "saved=1"));
}

export async function updateAssignmentNoteAction(formData: FormData): Promise<void> {
  const key = String(formData.get("key"));
  const { context, set } = await requireEditable(key);
  if (!set.brief) redirect(back(key));
  const note = String(formData.get("note") ?? "").trim();

  // ONE copy of the instruction, on the brief. It used to be mirrored onto every
  // per-learner row as well, so the learner's inbox could render `a.note` — two
  // writable copies of one sentence with nothing keeping them equal, and a
  // guaranteed drift the moment anything wrote one without the other. The
  // readers now prefer the brief (see /m/assigned), and a row's own `note`
  // survives only for assignments made before briefs existed.
  await assignmentStore().putBrief({
    ...set.brief,
    ...(note ? { note } : { note: undefined }),
    updatedAt: new Date().toISOString(),
  });
  await audit(context, "assignment.brief.updated", "assignment", set.brief.briefId, {
    field: "note",
  });
  redirect(back(set.view.key, "saved=1"));
}

export async function addLearnerAction(formData: FormData): Promise<void> {
  const key = String(formData.get("key"));
  const { context, set } = await requireEditable(key);
  if (!set.brief) redirect(back(key));
  const learnerId = String(formData.get("learnerId") ?? "");

  // Only someone actually on this coach's roster, checked server-side.
  const roster = await getMyLearners();
  const learner = roster.find((l) => l.user_id === learnerId);
  if (!learner?.user_id) {
    redirect(back(set.view.key, `error=${encodeURIComponent("That learner isn't on your roster.")}`));
  }
  if (set.issues.some((a) => a.learnerId === learnerId)) redirect(back(set.view.key));

  const content = set.brief.contents.find((c) => c.kind === "entry");
  if (!content) {
    redirect(back(set.view.key, `error=${encodeURIComponent("This assignment has no board to give.")}`));
  }

  const { newId } = await import("@bridge/kb");
  // Copy-on-assign, the same primitive the create flow uses: the learner gets
  // their OWN copy, idempotent per (source, learner) — which is what makes
  // re-adding someone safe — with a curated overlay brought forward onto a
  // copy that predates it.
  const copy = await copyForAssign(await libraryPrincipalOf(context), content.entryId, learnerId);
  await assignmentStore().putAssignment({
    assignmentId: newId("as"),
    programOrganizationId: set.brief.programOrganizationId,
    nexusProgramId: set.brief.nexusProgramId,
    briefId: set.brief.briefId,
    coachId: set.brief.createdBy,
    coachName: set.brief.createdByName,
    learnerId,
    learnerName: learner.name ?? learner.email ?? undefined,
    entryId: copy.entryId,
    sourceEntryId: content.entryId,
    entryKind: content.entryKind,
    entryName: content.entryName,
    // No note copied onto the row: the brief owns the instruction, and readers
    // take it from there. A row-level note now only exists on pre-brief data.
    status: "assigned",
    createdAt: new Date().toISOString(),
  });
  await audit(context, "assignment.created", "assignment", set.brief.briefId, {
    addedLearner: learnerId,
  });
  redirect(back(set.view.key, "added=learner"));
}

/**
 * Delete the whole assignment (owner request 2026-08-17): the coach could
 * take learners off one at a time but never put the assignment itself away,
 * so a board asked for by mistake stayed on every learner's list for good.
 *
 * Detach, never destroy — see deleteAssignmentSet. Games and feedback stand.
 */
export async function deleteAssignmentAction(formData: FormData): Promise<void> {
  const key = String(formData.get("key"));
  const { context, set } = await requireEditable(key);
  await deleteAssignmentSet(context, set);
  // Back to the LIST, not the sheet — the sheet's assignment is gone.
  redirect("/m/assignments?deleted=1");
}

export async function removeLearnerAction(formData: FormData): Promise<void> {
  const key = String(formData.get("key"));
  const { context, set } = await requireEditable(key);
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const issue = set.issues.find((a) => a.assignmentId === assignmentId);
  if (!issue) redirect(back(set.view.key));

  // The row, and NOTHING else: their session, their submissions and any feedback
  // on them are left exactly as they are.
  await assignmentStore().deleteAssignment(assignmentId);
  await audit(context, "assignment.learner.removed", "assignment", set.view.key, {
    learnerId: issue.learnerId,
    status: issue.status,
    keptSession: issue.sessionId ?? null,
  });
  redirect(back(set.view.key, "removed=learner"));
}

export async function addReviewerAction(formData: FormData): Promise<void> {
  const key = String(formData.get("key"));
  const { context, set } = await requireEditable(key);
  if (!set.brief) redirect(back(key));
  const reviewerId = String(formData.get("reviewerId") ?? "");

  // Checked against the ONE reviewer policy, never trusted from the form: a
  // free-typed id would be a thread on a learner's play nobody granted.
  const candidate = await findReviewerCandidate(context, reviewerId);
  if (!candidate) {
    redirect(back(set.view.key, `error=${encodeURIComponent("That coach can't be a reviewer here.")}`));
  }
  if (set.reviewers.some((r) => r.reviewerId === reviewerId)) redirect(back(set.view.key));

  const store = assignmentStore();
  await store.putReviewer({
    briefId: set.brief.briefId,
    reviewerId: candidate.reviewerId,
    reviewerName: candidate.name,
    isCreator: false,
    addedBy: context.nexusUserId,
    addedAt: new Date().toISOString(),
  });
  // Learners who already finished get their plays sent to the new reviewer too —
  // otherwise naming a reviewer for finished work gives them an empty queue,
  // which is exactly the silent nothing this feature must not do.
  const { created } = await fanOutBriefToReviewer(set.brief, {
    id: candidate.reviewerId,
    name: candidate.name,
    isCreator: false,
  });
  await audit(context, "assignment.reviewer.added", "assignment", set.brief.briefId, {
    reviewerId: candidate.reviewerId,
    backfilled: created,
  });
  redirect(
    back(
      set.view.key,
      created > 0 ? `added=reviewer&sent=${created}` : "added=reviewer",
    ),
  );
}

export async function removeReviewerAction(formData: FormData): Promise<void> {
  const key = String(formData.get("key"));
  const { context, set } = await requireEditable(key);
  if (!set.brief) redirect(back(key));
  const reviewerId = String(formData.get("reviewerId") ?? "");
  const reviewer = set.reviewers.find((r) => r.reviewerId === reviewerId);
  if (!reviewer) redirect(back(set.view.key));
  // Refused server-side, not merely hidden: the creator always reviews.
  if (reviewer.isCreator) {
    redirect(
      back(set.view.key, `error=${encodeURIComponent("The creator always reviews this assignment.")}`),
    );
  }

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
  redirect(back(set.view.key, "removed=reviewer"));
}
