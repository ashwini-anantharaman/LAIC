"use server";

// Phase 3: a coach assigns a library entry to learners on their roster —
// one assignment row per learner so status tracks individually.
//
// Since 0028 the submit also creates the BRIEF that owns those rows: the thing
// that holds the creator, the reviewers, and (later) embedded contents. Write
// order is load-bearing — brief, then the creator's reviewer row, then the
// picked reviewers, then the per-learner rows carrying briefId. A child row
// written without a briefId falls back to the creator alone at fan-out time and
// the named reviewers get nothing, silently; aborting before any child row is
// what prevents that.

import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { bridgeLibrary, copyForAssign, libraryPrincipalOf } from "@/lib/libraryComponent";
import { getMyLearners, isBridgeCoach, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { findReviewerCandidate, selfReviewer } from "@/lib/reviewers";
import { assignmentStore, libraryStore } from "@/lib/sessions";

export async function assignEntryAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  if (!isBridgeCoach(context)) throw new Error("Coach access required");

  const entryId = String(formData.get("entryId"));
  const note = String(formData.get("note") ?? "").trim();
  const learnerIds = formData.getAll("learner").map(String).filter(Boolean);
  if (learnerIds.length === 0) {
    redirect(`/m/assign?entry=${encodeURIComponent(entryId)}&error=${encodeURIComponent("Pick at least one learner.")}`);
  }

  const entry = await libraryStore().getEntry(entryId);
  if (!entry) throw new Error("That library entry no longer exists");

  // Assign only to people actually on this coach's roster (server-checked).
  const roster = await getMyLearners();
  const byId = new Map(
    roster.filter((l) => l.user_id).map((l) => [l.user_id as string, l]),
  );

  const { newId } = await import("@bridge/kb");
  const store = assignmentStore();
  const service = bridgeLibrary();
  const principal = await libraryPrincipalOf(context);
  const orgId = orgScopeOf(context);
  const programId = (await nexusProgramIdOf()) ?? undefined;
  const now = new Date().toISOString();

  // Every posted reviewer id is checked against the policy — never trusted from
  // the form. A free-typed id would let a coach mint themselves a thread on a
  // learner's play.
  const picked = formData.getAll("reviewer").map(String).filter(Boolean);
  const reviewers = [selfReviewer(context)];
  for (const id of picked) {
    if (id === context.nexusUserId) continue; // already the creator's row
    const candidate = await findReviewerCandidate(context, id);
    if (candidate) reviewers.push(candidate);
  }

  // The brief and its reviewers FIRST: if either fails, nothing is assigned,
  // rather than assigned to nobody's review.
  const briefId = newId("ab");
  await store.putBrief({
    briefId,
    programOrganizationId: orgId,
    nexusProgramId: programId,
    createdBy: context.nexusUserId,
    createdByName: context.displayName ?? undefined,
    title: entry.name,
    ...(note ? { note } : {}),
    contents: [
      { kind: "entry", entryId, entryKind: entry.kind, entryName: entry.name },
    ],
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  for (const r of reviewers) {
    await store.putReviewer({
      briefId,
      reviewerId: r.reviewerId,
      reviewerName: r.name,
      isCreator: r.reviewerId === context.nexusUserId,
      addedBy: context.nexusUserId,
      addedAt: now,
    });
  }

  let created = 0;
  for (const learnerId of learnerIds) {
    const learner = byId.get(learnerId);
    if (!learner) continue; // not on the roster — skip silently
    // Idempotent per BRIEF+learner. Deliberately not (coach, learner, source)
    // any more: that key made a SECOND assignment of the same board to the same
    // learner create nothing at all — no row, no submission, no error — so its
    // reviewers would have waited on feedback that could never arrive.
    const existing = await store.listAssignments({ briefId, learnerId });
    if (existing.length > 0) continue;

    // Copy-on-assign (0022) via the library component: the learner receives
    // their OWN copy in their instance, stamped with provenance. Idempotent
    // per (source, learner), and it refreshes a curated overlay onto a copy
    // that predates the curation — see copyForAssign.
    const copy = await copyForAssign(principal, entryId, learnerId);

    await store.putAssignment({
      assignmentId: newId("as"),
      programOrganizationId: orgId,
      nexusProgramId: programId,
      briefId,
      coachId: context.nexusUserId,
      coachName: context.displayName ?? undefined,
      learnerId,
      learnerName: learner.name ?? learner.email ?? undefined,
      entryId: copy.entryId,
      sourceEntryId: entryId,
      entryKind: entry.kind,
      entryName: entry.name,
      ...(note ? { note } : {}),
      status: "assigned",
      createdAt: now,
    });
    created++;
  }
  await audit(context, "assignment.brief.created", "assignment", briefId, {
    assigned: created,
    learners: learnerIds.length,
    reviewers: reviewers.length,
    sourceEntryId: entryId,
  });
  redirect(`/m/assignments?assigned=${created}&brief=${encodeURIComponent(briefId)}`);
}
