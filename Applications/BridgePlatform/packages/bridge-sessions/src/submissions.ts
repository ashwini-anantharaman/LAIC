// Play submissions + coach comments (coach/learner Phase 2, migration 0020).
// A learner sends a COMPLETED play to their hired coach. The submission
// freezes a render-ready board snapshot — the same reasoning as
// KbSuggestion.board: the source session can be forked or rewound later, the
// review must not drift. The coach↔learner relationship itself lives in
// Nexus (roster groups); these records only reference people by their
// org-scoped profile ids.

import type { Call, Card, Seat, Vul } from "@bridge/events";

/** Frozen, render-ready picture of the play under review. */
export interface SubmissionBoard {
  name: string;
  dealer: Seat;
  vul: Vul;
  hands: Record<Seat, Card[]>;
  auction: { seat: Seat; call: Call }[];
  play: { seat: Seat; card: Card }[];
  contractLabel?: string;
  resultLabel?: string;
}

export interface PlaySubmission {
  submissionId: string;
  programOrganizationId?: string;
  /** The REAL Nexus program uuid partition (0022). */
  nexusProgramId?: string;
  sessionId: string;
  learnerId: string;
  learnerName?: string;
  coachId: string;
  coachName?: string;
  status: "submitted" | "reviewed";
  /** The learner's optional message to the coach. */
  note?: string;
  board: SubmissionBoard;
  createdAt: string;
  reviewedAt?: string;
}

export interface PlayComment {
  commentId: string;
  submissionId: string;
  authorId: string;
  authorName?: string;
  body: string;
  createdAt: string;
}

export interface SubmissionFilter {
  programOrganizationId?: string;
  nexusProgramId?: string;
  learnerId?: string;
  coachId?: string;
  sessionId?: string;
  /** Several sessions at once — one query where a loop would have made one per
   *  learner. Empty array means "nothing", never "everything". */
  sessionIds?: readonly string[];
}

export interface SubmissionStoreData {
  submissions: PlaySubmission[];
  comments: PlayComment[];
}

export interface SubmissionStore {
  putSubmission(submission: PlaySubmission): Promise<void>;
  getSubmission(submissionId: string): Promise<PlaySubmission | null>;
  listSubmissions(filter?: SubmissionFilter): Promise<PlaySubmission[]>;
  addComment(comment: PlayComment): Promise<void>;
  listComments(submissionId: string): Promise<PlayComment[]>;
  /**
   * Drop a submission and the whole conversation on it. The learner removing
   * one of their games takes its review with it (owner direction 2026-08-09),
   * so this deletes for BOTH sides — the coach's queue and their written
   * feedback included. Idempotent: an id that isn't there is a no-op.
   */
  deleteSubmission(submissionId: string): Promise<void>;
}

function matchesSubmission(s: PlaySubmission, f?: SubmissionFilter): boolean {
  if (!f) return true;
  if (
    f.programOrganizationId !== undefined &&
    s.programOrganizationId !== f.programOrganizationId
  )
    return false;
  if (f.nexusProgramId !== undefined && s.nexusProgramId !== f.nexusProgramId) return false;
  if (f.learnerId !== undefined && s.learnerId !== f.learnerId) return false;
  if (f.coachId !== undefined && s.coachId !== f.coachId) return false;
  if (f.sessionId !== undefined && s.sessionId !== f.sessionId) return false;
  if (f.sessionIds !== undefined && !f.sessionIds.includes(s.sessionId)) return false;
  return true;
}

export class InMemorySubmissionStore implements SubmissionStore {
  constructor(
    protected data: SubmissionStoreData = { submissions: [], comments: [] },
  ) {}
  protected persist(): void {}
  async putSubmission(submission: PlaySubmission) {
    const i = this.data.submissions.findIndex(
      (s) => s.submissionId === submission.submissionId,
    );
    if (i >= 0) this.data.submissions[i] = submission;
    else this.data.submissions.push(submission);
    this.persist();
  }
  async getSubmission(submissionId: string) {
    return (
      this.data.submissions.find((s) => s.submissionId === submissionId) ?? null
    );
  }
  async listSubmissions(filter?: SubmissionFilter) {
    return this.data.submissions
      .filter((s) => matchesSubmission(s, filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async addComment(comment: PlayComment) {
    this.data.comments.push(comment);
    this.persist();
  }
  async listComments(submissionId: string) {
    return this.data.comments
      .filter((c) => c.submissionId === submissionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async deleteSubmission(submissionId: string) {
    this.data.submissions = this.data.submissions.filter(
      (s) => s.submissionId !== submissionId,
    );
    // Postgres cascades this via the comments FK; in memory it is on us, and a
    // stranded comment would resurface under a REUSED id.
    this.data.comments = this.data.comments.filter(
      (c) => c.submissionId !== submissionId,
    );
    this.persist();
  }
}
