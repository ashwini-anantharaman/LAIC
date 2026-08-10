// Loading ONE assignment: the rows, and the package's view of them.
//
// There is exactly ONE definition of what an assignment IS and who may change
// it — buildAssignmentView in @bridge/assignments. This file only fetches. It
// briefly had its own copy of that logic (including its own `canEdit`), which
// immediately drifted from the package's: the page hid controls the actions
// would have accepted. Never re-introduce a second assembler here.
//
// The raw rows come back alongside the view because WRITES need them: mirroring
// a note onto each issue, or re-putting a row, needs every field the store
// keeps, not the view's summary of it.

import {
  buildAssignmentView,
  isLegacyKey,
  legacyKey,
  type AssignmentView,
} from "@bridge/assignments";
import type {
  Assignment,
  AssignmentBrief,
  AssignmentReviewer,
  PlaySubmission,
} from "@bridge/sessions";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { canAccessAdminArea } from "@bridge/nexus-client";
import { nexusProgramIdOf, orgScopeOf } from "./nexus";
import { assignmentStore, submissionStore } from "./sessions";

export { isLegacyKey, legacyKey };

export interface LoadedAssignment {
  /** The one shared view — what every surface reads and every gate consults. */
  view: AssignmentView;
  brief: AssignmentBrief | null;
  /** Raw per-learner rows, for writes. */
  issues: Assignment[];
  reviewers: AssignmentReviewer[];
  threads: PlaySubmission[];
}

/**
 * Load one assignment for this caller, or null when there is nothing they may
 * see. Accepts a brief id or a legacy key, so the pencil on an un-adopted group
 * never 404s.
 */
export async function loadAssignment(
  key: string,
  context: NexusBridgeContext,
): Promise<LoadedAssignment | null> {
  const store = assignmentStore();
  const programId = (await nexusProgramIdOf()) ?? undefined;
  const scope = {
    programOrganizationId: orgScopeOf(context),
    ...(programId ? { nexusProgramId: programId } : {}),
  };

  let brief: AssignmentBrief | null = null;
  let issues: Assignment[] = [];
  let reviewers: AssignmentReviewer[] = [];

  if (isLegacyKey(key)) {
    const sourceEntryId = key.slice("legacy:".length);
    if (!sourceEntryId) return null;
    // A legacy group belongs to the coach who assigned it — the only grouping
    // pre-0028 data supports.
    issues = (
      await store.listAssignments({ ...scope, coachId: context.nexusUserId, sourceEntryId })
    ).filter((a) => !a.briefId);
    if (issues.length === 0) return null;
  } else {
    brief = await store.getBrief(key);
    if (!brief) return null;
    [issues, reviewers] = await Promise.all([
      store.listAssignments({ ...scope, briefId: key }),
      store.listReviewers({ briefId: key }),
    ]);
  }

  // One query for every board in this assignment, not one per learner.
  const sessionIds = [...new Set(issues.map((a) => a.sessionId).filter(Boolean) as string[])];
  const threads =
    sessionIds.length === 0
      ? []
      : await submissionStore()
          .listSubmissions({ sessionIds })
          .catch(() => [] as PlaySubmission[]);

  const view = buildAssignmentView({
    key,
    brief,
    issues,
    reviewers,
    threads,
    viewerId: context.nexusUserId,
    viewerIsAdmin: canAccessAdminArea(context),
  });
  // Nothing to show someone who neither owns it nor reviews it.
  if (!view.canEdit && !view.isReviewer) return null;

  return { view, brief, issues, reviewers, threads };
}

/**
 * Mint a brief for a legacy group — adopt-on-first-edit.
 *
 * Deliberately NOT a migration backfill: `(coach, sourceEntry)` is a grouping
 * key, not an intent key. A coach who assigned the same board to the same learner
 * twice has two logical assignments a blind backfill would fuse into one, and
 * adding a reviewer to the fused brief would hand them a play from months ago
 * nobody meant to share. Doing it here means the coach is looking at exactly the
 * rows they mean.
 */
export async function adoptLegacyGroup(
  loaded: LoadedAssignment,
  context: NexusBridgeContext,
): Promise<string> {
  const { newId } = await import("@bridge/kb");
  const store = assignmentStore();
  const now = new Date().toISOString();
  const first = loaded.issues[0]!;
  const briefId = newId("ab");

  await store.putBrief({
    briefId,
    programOrganizationId: first.programOrganizationId,
    nexusProgramId: first.nexusProgramId,
    createdBy: first.coachId,
    createdByName: first.coachName,
    title: first.entryName,
    ...(first.note ? { note: first.note } : {}),
    contents: [
      {
        kind: "entry",
        entryId: first.sourceEntryId ?? first.entryId,
        entryKind: first.entryKind,
        entryName: first.entryName,
      },
    ],
    status: "active",
    createdAt: first.createdAt,
    updatedAt: now,
  });
  // The assigning coach was always the reviewer before 0028 — preserve that
  // exactly, so adoption changes nothing about who reviews what.
  await store.putReviewer({
    briefId,
    reviewerId: first.coachId,
    reviewerName: first.coachName,
    isCreator: true,
    addedBy: context.nexusUserId,
    addedAt: now,
  });
  for (const a of loaded.issues) {
    await store.putAssignment({ ...a, briefId });
  }
  return briefId;
}
