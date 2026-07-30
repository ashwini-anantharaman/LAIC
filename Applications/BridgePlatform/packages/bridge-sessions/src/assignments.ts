// Coach assignments (coach/learner Phase 3, migration 0021). A coach
// delegates a library entry to learners on their roster — one record per
// learner, so status tracks individually: assigned → started (a session was
// dealt from the entry) → completed (that session finished). Completion is
// reconciled lazily by the read surfaces; the game engine stays unaware of
// assignments. People are Nexus org-scoped profile ids; the roster lives in
// Nexus.

import type { LibraryKind } from "./library";

export type AssignmentStatus = "assigned" | "started" | "completed";

export interface Assignment {
  assignmentId: string;
  programOrganizationId?: string;
  /** The REAL Nexus program uuid partition (0022). */
  nexusProgramId?: string;
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
}

export interface AssignmentStoreData {
  assignments: Assignment[];
}

export interface AssignmentStore {
  putAssignment(assignment: Assignment): Promise<void>;
  getAssignment(assignmentId: string): Promise<Assignment | null>;
  listAssignments(filter?: AssignmentFilter): Promise<Assignment[]>;
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
  return true;
}

export class InMemoryAssignmentStore implements AssignmentStore {
  constructor(protected data: AssignmentStoreData = { assignments: [] }) {}
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
}
