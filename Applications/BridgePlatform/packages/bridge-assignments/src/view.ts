// The view model every assignment surface reads.
//
// Rows in, view out — a PURE function. The host does the fetching (it owns the
// stores and the request context); this decides what the thing IS: who created
// it, who plays it, who reviews it, what has come back, and what the viewer may
// change. Keeping it pure is what makes the whole family testable with plain
// objects, and what stops a second surface re-deriving "canEdit" differently.

import type {
  Assignment,
  AssignmentBrief,
  AssignmentContent,
  AssignmentReviewer,
  AssignmentStatus,
  PlaySubmission,
} from "@bridge/sessions";

/** `legacy:<sourceEntryId>` — a group from before briefs existed. */
export function legacyKey(sourceEntryId: string): string {
  return `legacy:${sourceEntryId}`;
}

export function isLegacyKey(key: string): boolean {
  return key.startsWith("legacy:");
}

/** One learner's issue of an assignment, with their feedback threads attached. */
export interface AssignmentLearnerView {
  assignmentId: string;
  learnerId: string;
  name: string;
  status: AssignmentStatus;
  sessionId?: string;
  /** Every thread on this learner's play, whoever the reviewer is. */
  threads: PlaySubmission[];
  /** Only the threads the VIEWER may open — their own. */
  mine: PlaySubmission[];
}

export interface AssignmentReviewerView {
  reviewerId: string;
  name: string;
  isCreator: boolean;
  isViewer: boolean;
  /** How much of this assignment has reached them. */
  sent: number;
  reviewed: number;
}

export interface AssignmentView {
  /** URL key: a brief id, or a legacy key for an un-adopted group. */
  key: string;
  /** Absent for a legacy group — the surfaces offer to adopt it. */
  brief: AssignmentBrief | null;
  title: string;
  note?: string;
  contents: AssignmentContent[];
  creatorId: string;
  creatorName: string;
  /** True when the viewer is the creator (so copy can say "you"). */
  creatorIsViewer: boolean;
  createdAt: string;
  /** The coach's own source entry, for "open the board". */
  sourceEntryId?: string;
  learners: AssignmentLearnerView[];
  reviewers: AssignmentReviewerView[];
  /** May the viewer change it? Creatorship, never reviewership. */
  canEdit: boolean;
  /** Is the viewer a named reviewer (a read-only interest)? */
  isReviewer: boolean;
}

export interface BuildAssignmentViewInput {
  key: string;
  brief: AssignmentBrief | null;
  /** One row per learner. */
  issues: Assignment[];
  reviewers: AssignmentReviewer[];
  /** Threads across these learners' plays — filtered here, not by the caller. */
  threads: PlaySubmission[];
  viewerId: string;
  /** The host decides: creator, or an admin. Passed in because "who is an
   *  admin" is the host's authorization model, not this package's. */
  viewerIsAdmin?: boolean;
}

export function buildAssignmentView(input: BuildAssignmentViewInput): AssignmentView {
  const { key, brief, issues, reviewers, threads, viewerId } = input;
  const first = issues[0];
  const creatorId = brief?.createdBy ?? first?.coachId ?? "";
  const creatorIsViewer = creatorId === viewerId;

  const learners: AssignmentLearnerView[] = issues.map((a) => {
    const mineAll = threads.filter(
      (t) => t.sessionId === a.sessionId && t.learnerId === a.learnerId,
    );
    return {
      assignmentId: a.assignmentId,
      learnerId: a.learnerId,
      name: a.learnerName ?? "Learner",
      status: a.status,
      ...(a.sessionId ? { sessionId: a.sessionId } : {}),
      threads: mineAll,
      mine: mineAll.filter((t) => t.coachId === viewerId),
    };
  });

  const reviewerViews: AssignmentReviewerView[] = reviewers.map((r) => {
    const theirs = threads.filter((t) => t.coachId === r.reviewerId);
    return {
      reviewerId: r.reviewerId,
      name: r.reviewerName ?? "Coach",
      isCreator: r.isCreator,
      isViewer: r.reviewerId === viewerId,
      sent: theirs.length,
      reviewed: theirs.filter((t) => t.status === "reviewed").length,
    };
  });

  // A legacy group has no brief and therefore no reviewer rows; the creator is
  // its only reviewer, which is exactly the pre-brief behaviour.
  if (!brief && reviewerViews.length === 0 && creatorId) {
    reviewerViews.push({
      reviewerId: creatorId,
      name: creatorIsViewer ? "you" : (first?.coachName ?? "a coach"),
      isCreator: true,
      isViewer: creatorIsViewer,
      sent: 0,
      reviewed: 0,
    });
  }

  return {
    key,
    brief,
    title: brief?.title ?? first?.entryName ?? "Assignment",
    ...(brief?.note ?? first?.note ? { note: brief?.note ?? first?.note } : {}),
    contents:
      brief?.contents ??
      (first
        ? [
            {
              kind: "entry",
              entryId: first.sourceEntryId ?? first.entryId,
              entryKind: first.entryKind,
              entryName: first.entryName,
            },
          ]
        : []),
    creatorId,
    creatorName: brief?.createdByName ?? first?.coachName ?? "a coach",
    creatorIsViewer,
    createdAt: brief?.createdAt ?? first?.createdAt ?? "",
    ...(first ? { sourceEntryId: first.sourceEntryId ?? first.entryId } : {}),
    learners,
    reviewers: reviewerViews,
    canEdit: creatorIsViewer || input.viewerIsAdmin === true,
    isReviewer: reviewers.some((r) => r.reviewerId === viewerId),
  };
}

/** Group per-learner rows into the assignments they belong to, newest first.
 *  Legacy rows keep the old render-time grouping by the coach's source entry. */
export function groupIntoAssignments(rows: Assignment[]): Map<string, Assignment[]> {
  const out = new Map<string, Assignment[]>();
  for (const a of rows) {
    const key = a.briefId ?? legacyKey(a.sourceEntryId ?? a.entryId);
    const list = out.get(key) ?? [];
    list.push(a);
    out.set(key, list);
  }
  return out;
}
