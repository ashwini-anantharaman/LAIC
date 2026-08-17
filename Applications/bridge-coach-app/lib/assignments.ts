// Assignments — native client for the assign/assigned/assignments routes
// (M3d of the webview→native migration). Three surfaces, one file:
//   • the learner's inbox (GET /api/bridge/assigned + start)
//   • the coach's manager (GET /api/bridge/assignments — the package's
//     AssignmentView, THE one shared view model — plus the brief-edit routes)
//   • creating an assignment (POST /api/bridge/assignments)
//
// The edit routes take the view's `key` — a brief id, or "legacy:<entryId>"
// for a pre-brief group (URL-encoded here, decoded by the route).

import { bridgeRequest } from "./bridge-api";
import { createBridgeCache } from "./bridge-cache";
import type { PlaySubmission } from "./plays";

// ── Types (mirroring what the routes serialize) ─────────────────────────────

export type AssignmentStatus = "assigned" | "started" | "completed";

export type AssignedRow = {
  assignmentId: string;
  briefId?: string;
  coachName?: string;
  entryName: string;
  status: AssignmentStatus;
  createdAt: string;
  sessionId?: string;
  /** The brief's instruction (or a legacy row's own) — resolved server-side. */
  note?: string;
  reviewerCount: number | null;
};

export type AssignedModel = {
  assignments: AssignedRow[];
  /** Every feedback thread on every board this learner owns, by session. */
  threads: Record<string, PlaySubmission[]>;
};

export type AssignmentLearnerView = {
  assignmentId: string;
  learnerId: string;
  name: string;
  status: AssignmentStatus;
  sessionId?: string;
  threads: PlaySubmission[];
  /** Only the threads the VIEWER may open — their own. */
  mine: PlaySubmission[];
};

export type AssignmentReviewerView = {
  reviewerId: string;
  name: string;
  isCreator: boolean;
  isViewer: boolean;
  sent: number;
  reviewed: number;
};

export type AssignmentView = {
  key: string;
  brief: { briefId: string } | null;
  title: string;
  note?: string;
  creatorName: string;
  creatorIsViewer: boolean;
  createdAt: string;
  sourceEntryId?: string;
  learners: AssignmentLearnerView[];
  reviewers: AssignmentReviewerView[];
  canEdit: boolean;
  isReviewer: boolean;
};

export type RosterLearner = { user_id: string; name: string | null; email: string | null };
export type ReviewerCandidate = { reviewerId: string; name: string; detail?: string };

export type CoachAssignments = {
  views: AssignmentView[];
  reviewing: AssignmentView[];
  roster: RosterLearner[];
  candidates: ReviewerCandidate[];
};

// ── The learner's inbox ──────────────────────────────────────────────────────

const inbox = createBridgeCache<AssignedModel>();

export function peekAssigned(token: string, programId: string): AssignedModel | null {
  return inbox.peek(`${token}::${programId}::assigned`);
}

export function refreshAssigned(token: string, programId: string): Promise<AssignedModel> {
  return inbox.refresh(`${token}::${programId}::assigned`, () =>
    bridgeRequest<AssignedModel>("/api/bridge/assigned", { token, programId }),
  );
}

export function subscribeToAssigned(notify: (v: AssignedModel) => void): () => void {
  return inbox.subscribe((_k, v) => notify(v));
}

/** Start (or resume) an assigned board → the session to open. */
export function startAssignment(
  token: string,
  programId: string,
  assignmentId: string,
): Promise<{ sessionId: string; resumed: boolean }> {
  return bridgeRequest(
    `/api/bridge/assignments/${encodeURIComponent(assignmentId)}/start`,
    { token, programId, method: "POST" },
  );
}

// ── The coach's manager ──────────────────────────────────────────────────────

const manager = createBridgeCache<CoachAssignments>();

export function peekCoachAssignments(
  token: string,
  programId: string,
): CoachAssignments | null {
  return manager.peek(`${token}::${programId}::assignments`);
}

export function refreshCoachAssignments(
  token: string,
  programId: string,
): Promise<CoachAssignments> {
  return manager.refresh(`${token}::${programId}::assignments`, () =>
    bridgeRequest<CoachAssignments>("/api/bridge/assignments", { token, programId }),
  );
}

export function subscribeToCoachAssignments(
  notify: (v: CoachAssignments) => void,
): () => void {
  return manager.subscribe((_k, v) => notify(v));
}

// ── Creating ─────────────────────────────────────────────────────────────────

export function createAssignment(
  token: string,
  programId: string,
  input: { entryId: string; learnerIds: string[]; note?: string; reviewerIds?: string[] },
): Promise<{ briefId: string; created: number }> {
  return bridgeRequest("/api/bridge/assignments", {
    token,
    programId,
    method: "POST",
    body: input,
  });
}

/** One library entry, for the assign screen's heading (policy-checked). */
export function fetchAssignEntry(
  token: string,
  programId: string,
  entryId: string,
): Promise<{ item: { id: string; kind: string; name: string } }> {
  return bridgeRequest(`/api/bridge/library/entries/${encodeURIComponent(entryId)}`, {
    token,
    programId,
  });
}

// ── Editing one assignment (creatorship, never reviewership) ────────────────

function briefPath(key: string, tail = ""): string {
  return `/api/bridge/assignments/briefs/${encodeURIComponent(key)}${tail}`;
}

/** Mint a brief for a pre-brief group so it can hold reviewers at all. */
export function adoptAssignment(
  token: string,
  programId: string,
  key: string,
): Promise<{ briefId: string }> {
  return bridgeRequest(briefPath(key), {
    token,
    programId,
    method: "PATCH",
    body: { adopt: true },
  });
}

export function updateAssignmentNote(
  token: string,
  programId: string,
  key: string,
  note: string,
): Promise<{ briefId: string }> {
  return bridgeRequest(briefPath(key), {
    token,
    programId,
    method: "PATCH",
    body: { note },
  });
}

export function addAssignmentLearner(
  token: string,
  programId: string,
  key: string,
  learnerId: string,
): Promise<{ assignmentId: string; existing: boolean }> {
  return bridgeRequest(briefPath(key, "/learners"), {
    token,
    programId,
    method: "POST",
    body: { learnerId },
  });
}

/** Detach a learner — their session, submissions and feedback stand. */
export function removeAssignmentLearner(
  token: string,
  programId: string,
  key: string,
  assignmentId: string,
): Promise<{ removed: boolean }> {
  return bridgeRequest(briefPath(key, "/learners"), {
    token,
    programId,
    method: "DELETE",
    body: { assignmentId },
  });
}

/**
 * Retire the whole assignment (owner request 2026-08-17).
 *
 * Detach, never destroy — the same rule removing one learner follows. The
 * brief and every learner's row go; the boards they played, their submissions
 * and the feedback on them stay exactly where they are.
 */
export function deleteAssignment(
  token: string,
  programId: string,
  key: string,
): Promise<{ deleted: boolean; learners: number; keptSessions: number }> {
  return bridgeRequest(briefPath(key), { token, programId, method: "DELETE" });
}

export function addAssignmentReviewer(
  token: string,
  programId: string,
  key: string,
  reviewerId: string,
): Promise<{ backfilled: number; existing: boolean }> {
  return bridgeRequest(briefPath(key, "/reviewers"), {
    token,
    programId,
    method: "POST",
    body: { reviewerId },
  });
}

export function removeAssignmentReviewer(
  token: string,
  programId: string,
  key: string,
  reviewerId: string,
): Promise<{ removed: boolean }> {
  return bridgeRequest(briefPath(key, "/reviewers"), {
    token,
    programId,
    method: "DELETE",
    body: { reviewerId },
  });
}
