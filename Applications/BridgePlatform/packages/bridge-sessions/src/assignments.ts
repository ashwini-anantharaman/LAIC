// Coach assignments (coach/learner Phase 3, migration 0021). A coach
// delegates a library entry to learners on their roster — one record per
// learner, so status tracks individually: assigned → started (a session was
// dealt from the entry) → completed (that session finished). Completion is
// reconciled lazily by the read surfaces; the game engine stays unaware of
// assignments. People are Nexus org-scoped profile ids; the roster lives in
// Nexus.

import type { LibraryKind } from "./library";

export type AssignmentStatus = "assigned" | "started" | "completed";

/**
 * What an assignment CONTAINS. One library entry today; drills, tutorials and
 * several boards later. New kinds are new members of this union and need NO
 * schema change in either migration tree, because the whole brief record lives
 * in one jsonb column — that is the reason the brief is jsonb-primary.
 */
export type AssignmentContent = {
  kind: "entry";
  entryId: string;
  entryKind: LibraryKind;
  entryName: string;
};
/* LATER (0028 leaves room, nothing is built):
 *   | { kind: "drill"; drillId: string; name: string }
 *   | { kind: "tutorial"; href: string; name: string }
 */

export type AssignmentBriefStatus = "active" | "archived";

/**
 * THE ASSIGNMENT as the coach composes it (0028) — the parent the per-learner
 * rows below hang off. Its ISSUES are Assignment rows carrying briefId.
 *
 * Deleting a brief does NOT delete its issues: the learner's game and the
 * feedback on it survive (detach, never destroy — owner direction 2026-08-09).
 */
export interface AssignmentBrief {
  briefId: string;
  programOrganizationId?: string;
  /** The REAL Nexus program uuid partition (0025). MUST be stamped, or every
   *  program-scoped read excludes the brief while its children stay visible. */
  nexusProgramId?: string;
  /** The coach who MADE it. Editing is theirs (plus bridge admins) — being a
   *  reviewer grants no edit rights. */
  createdBy: string;
  createdByName?: string;
  /** What the assignment is called. Defaults to the first content's name. */
  title: string;
  /** The coach's instruction. MIRRORED onto every per-learner row's `note` so
   *  the pre-0028 read paths that render `a.note` keep working untouched. */
  note?: string;
  contents: AssignmentContent[];
  status: AssignmentBriefStatus;
  /** The coach deliberately emptied the reviewer list. The fan-out then creates
   *  nothing — this flag is what tells that CHOICE apart from a bug that lost
   *  the reviewers. */
  reviewNotRequired?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * One coach named on a brief. Their access is scoped to the plays they were
 * asked to review and nothing else: being named here does NOT hire them, does
 * not touch bridge_learner_coaches, and does not put them on the learner's
 * Coach tab.
 */
export interface AssignmentReviewer {
  briefId: string;
  /**
   * Nexus PROFILE id, taken verbatim from the reviewer-candidate policy. This
   * is the same id space bridge_play_submissions.coach_id uses. A mismatch here
   * fails SILENTLY — the reviewer's queue is simply empty forever.
   */
  reviewerId: string;
  reviewerName?: string;
  /** True for the brief's creator, seeded at create time. */
  isCreator: boolean;
  addedBy: string;
  addedAt: string;
}

export interface Assignment {
  assignmentId: string;
  programOrganizationId?: string;
  /** The REAL Nexus program uuid partition (0022). */
  nexusProgramId?: string;
  /**
   * The parent brief (0028). UNDEFINED on every pre-0028 row, and on any row
   * whose brief was deleted — every read path tolerates it, and the completion
   * fan-out falls back to `coachId` alone, which IS the pre-0028 behaviour.
   */
  briefId?: string;
  /** The coach who assigned it — the CREATOR, never a reviewer. */
  coachId: string;
  coachName?: string;
  learnerId: string;
  learnerName?: string;
  /** The LEARNER'S copy of the board (copy-on-assign, 0022). */
  entryId: string;
  /** The coach's source entry — the id assignments group by. */
  sourceEntryId?: string;
  entryKind: LibraryKind;
  entryName: string;
  /** The coach's instruction ("focus on your opening lead"). */
  note?: string;
  status: AssignmentStatus;
  /** The learner's sitting, once they start. */
  sessionId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AssignmentFilter {
  programOrganizationId?: string;
  nexusProgramId?: string;
  coachId?: string;
  learnerId?: string;
  entryId?: string;
  sourceEntryId?: string;
  /** Every issue of one brief. Pushed down to SQL — filtering in memory after a
   *  capped page would silently lose rows. */
  briefId?: string;
  status?: AssignmentStatus;
}

export interface AssignmentBriefFilter {
  programOrganizationId?: string;
  nexusProgramId?: string;
  createdBy?: string;
  status?: AssignmentBriefStatus;
}

export interface ReviewerFilter {
  briefId?: string;
  reviewerId?: string;
}

export interface AssignmentStoreData {
  assignments: Assignment[];
  briefs: AssignmentBrief[];
  reviewers: AssignmentReviewer[];
}

export interface AssignmentStore {
  /** Upsert by assignmentId — this IS the update path. There is deliberately no
   *  updateAssignment: two ways to write one row is how they drift. */
  putAssignment(assignment: Assignment): Promise<void>;
  getAssignment(assignmentId: string): Promise<Assignment | null>;
  listAssignments(filter?: AssignmentFilter): Promise<Assignment[]>;
  /**
   * Drop ONE per-learner row — a learner removed from the assignment. Detach,
   * never destroy: their session, their submissions and any feedback written on
   * them are untouched. Idempotent.
   */
  deleteAssignment(assignmentId: string): Promise<void>;

  putBrief(brief: AssignmentBrief): Promise<void>;
  getBrief(briefId: string): Promise<AssignmentBrief | null>;
  listBriefs(filter?: AssignmentBriefFilter): Promise<AssignmentBrief[]>;
  /** Drop the brief and its reviewer rows. The per-learner assignment rows STAY,
   *  parentless — the games played and the feedback on them survive. */
  deleteBrief(briefId: string): Promise<void>;

  putReviewer(reviewer: AssignmentReviewer): Promise<void>;
  listReviewers(filter?: ReviewerFilter): Promise<AssignmentReviewer[]>;
  /** Idempotent. The CALLER decides what happens to any pending submissions —
   *  written feedback is never collateral. */
  removeReviewer(briefId: string, reviewerId: string): Promise<void>;
}

function matchesAssignment(a: Assignment, f?: AssignmentFilter): boolean {
  if (!f) return true;
  if (
    f.programOrganizationId !== undefined &&
    a.programOrganizationId !== f.programOrganizationId
  )
    return false;
  if (f.nexusProgramId !== undefined && a.nexusProgramId !== f.nexusProgramId) return false;
  if (f.coachId !== undefined && a.coachId !== f.coachId) return false;
  if (f.learnerId !== undefined && a.learnerId !== f.learnerId) return false;
  if (f.entryId !== undefined && a.entryId !== f.entryId) return false;
  if (f.sourceEntryId !== undefined && a.sourceEntryId !== f.sourceEntryId) return false;
  if (f.briefId !== undefined && a.briefId !== f.briefId) return false;
  if (f.status !== undefined && a.status !== f.status) return false;
  return true;
}

function matchesBrief(b: AssignmentBrief, f?: AssignmentBriefFilter): boolean {
  if (!f) return true;
  if (
    f.programOrganizationId !== undefined &&
    b.programOrganizationId !== f.programOrganizationId
  )
    return false;
  if (f.nexusProgramId !== undefined && b.nexusProgramId !== f.nexusProgramId) return false;
  if (f.createdBy !== undefined && b.createdBy !== f.createdBy) return false;
  if (f.status !== undefined && b.status !== f.status) return false;
  return true;
}

function matchesReviewer(r: AssignmentReviewer, f?: ReviewerFilter): boolean {
  if (!f) return true;
  if (f.briefId !== undefined && r.briefId !== f.briefId) return false;
  if (f.reviewerId !== undefined && r.reviewerId !== f.reviewerId) return false;
  return true;
}

export class InMemoryAssignmentStore implements AssignmentStore {
  constructor(
    protected data: AssignmentStoreData = { assignments: [], briefs: [], reviewers: [] },
  ) {}
  protected persist(): void {}
  async putAssignment(assignment: Assignment) {
    const i = this.data.assignments.findIndex(
      (a) => a.assignmentId === assignment.assignmentId,
    );
    if (i >= 0) this.data.assignments[i] = assignment;
    else this.data.assignments.push(assignment);
    this.persist();
  }
  async getAssignment(assignmentId: string) {
    return (
      this.data.assignments.find((a) => a.assignmentId === assignmentId) ?? null
    );
  }
  async listAssignments(filter?: AssignmentFilter) {
    return this.data.assignments
      .filter((a) => matchesAssignment(a, filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async deleteAssignment(assignmentId: string) {
    this.data.assignments = this.data.assignments.filter(
      (a) => a.assignmentId !== assignmentId,
    );
    this.persist();
  }

  async putBrief(brief: AssignmentBrief) {
    const i = this.data.briefs.findIndex((b) => b.briefId === brief.briefId);
    if (i >= 0) this.data.briefs[i] = brief;
    else this.data.briefs.push(brief);
    this.persist();
  }
  async getBrief(briefId: string) {
    return this.data.briefs.find((b) => b.briefId === briefId) ?? null;
  }
  async listBriefs(filter?: AssignmentBriefFilter) {
    return this.data.briefs
      .filter((b) => matchesBrief(b, filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async deleteBrief(briefId: string) {
    this.data.briefs = this.data.briefs.filter((b) => b.briefId !== briefId);
    // Neither backend has an FK here, so both clean up their own reviewer rows
    // explicitly — kept identical so a test passing in memory means something.
    this.data.reviewers = this.data.reviewers.filter((r) => r.briefId !== briefId);
    // The per-learner assignment rows are deliberately NOT touched.
    this.persist();
  }

  async putReviewer(reviewer: AssignmentReviewer) {
    const i = this.data.reviewers.findIndex(
      (r) => r.briefId === reviewer.briefId && r.reviewerId === reviewer.reviewerId,
    );
    if (i >= 0) this.data.reviewers[i] = reviewer;
    else this.data.reviewers.push(reviewer);
    this.persist();
  }
  async listReviewers(filter?: ReviewerFilter) {
    return this.data.reviewers
      .filter((r) => matchesReviewer(r, filter))
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  }
  async removeReviewer(briefId: string, reviewerId: string) {
    this.data.reviewers = this.data.reviewers.filter(
      (r) => !(r.briefId === briefId && r.reviewerId === reviewerId),
    );
    this.persist();
  }
}
