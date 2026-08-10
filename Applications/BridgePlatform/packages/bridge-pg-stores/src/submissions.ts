// SubmissionStore over 0020 (jsonb-primary board; scalar columns for filters).

import type {
  PlayComment,
  PlaySubmission,
  SubmissionFilter,
  SubmissionStore,
} from "@bridge/sessions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

function toSubmissionRow(s: PlaySubmission) {
  return {
    submission_id: s.submissionId,
    program_organization_id: s.programOrganizationId ?? null,
    nexus_program_id: s.nexusProgramId ?? null,
    session_id: s.sessionId,
    learner_id: s.learnerId,
    learner_name: s.learnerName ?? null,
    coach_id: s.coachId,
    coach_name: s.coachName ?? null,
    status: s.status,
    note: s.note ?? null,
    board: s.board,
    created_at: s.createdAt,
    reviewed_at: s.reviewedAt ?? null,
  };
}

function fromSubmissionRow(r: any): PlaySubmission {
  return {
    submissionId: r.submission_id,
    programOrganizationId: r.program_organization_id ?? undefined,
    nexusProgramId: r.nexus_program_id ?? undefined,
    sessionId: r.session_id,
    learnerId: r.learner_id,
    learnerName: r.learner_name ?? undefined,
    coachId: r.coach_id,
    coachName: r.coach_name ?? undefined,
    status: r.status,
    note: r.note ?? undefined,
    board: r.board,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at ?? undefined,
  };
}

export class PgSubmissionStore implements SubmissionStore {
  constructor(private readonly db: SupabaseClient) {}

  async putSubmission(submission: PlaySubmission) {
    check(
      await this.db
        .from("bridge_play_submissions")
        .upsert(toSubmissionRow(submission), { onConflict: "submission_id" }),
      "submissions.put",
    );
  }
  async getSubmission(submissionId: string) {
    const rows = check(
      await this.db
        .from("bridge_play_submissions")
        .select("*")
        .eq("submission_id", submissionId),
      "submissions.get",
    );
    return rows.length ? fromSubmissionRow(rows[0]) : null;
  }
  async listSubmissions(filter?: SubmissionFilter) {
    let query = this.db
      .from("bridge_play_submissions")
      .select("*")
      .order("created_at", { ascending: false })
      // Raised from 200: one finished play now yields one submission PER
      // REVIEWER (0028 fan-out), so a learner's visible history was being
      // divided by their reviewer count with nothing to show it had been cut.
      .limit(1000);
    if (filter?.programOrganizationId !== undefined)
      query = query.eq("program_organization_id", filter.programOrganizationId);
    if (filter?.nexusProgramId !== undefined)
      query = query.eq("nexus_program_id", filter.nexusProgramId);
    if (filter?.learnerId !== undefined) query = query.eq("learner_id", filter.learnerId);
    if (filter?.coachId !== undefined) query = query.eq("coach_id", filter.coachId);
    if (filter?.sessionId !== undefined) query = query.eq("session_id", filter.sessionId);
    // One round trip for many sessions. An empty list must match NOTHING, so it
    // short-circuits rather than falling through to an unfiltered read.
    if (filter?.sessionIds !== undefined) {
      if (filter.sessionIds.length === 0) return [];
      query = query.in("session_id", [...filter.sessionIds]);
    }
    const rows = check(await query, "submissions.list");
    return rows.map(fromSubmissionRow);
  }
  async addComment(comment: PlayComment) {
    check(
      await this.db.from("bridge_play_comments").insert({
        comment_id: comment.commentId,
        submission_id: comment.submissionId,
        author_id: comment.authorId,
        author_name: comment.authorName ?? null,
        body: comment.body,
        created_at: comment.createdAt,
      }),
      "comments.add",
    );
  }
  async deleteSubmission(submissionId: string) {
    // bridge_play_comments.submission_id is ON DELETE CASCADE (bridge schema
    // 0001), so the conversation goes with the submission in one statement.
    check(
      await this.db
        .from("bridge_play_submissions")
        .delete()
        .eq("submission_id", submissionId),
      "submissions.delete",
    );
  }
  async listComments(submissionId: string) {
    const rows = check(
      await this.db
        .from("bridge_play_comments")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: true }),
      "comments.list",
    );
    return rows.map((r: any) => ({
      commentId: r.comment_id,
      submissionId: r.submission_id,
      authorId: r.author_id,
      authorName: r.author_name ?? undefined,
      body: r.body,
      createdAt: r.created_at,
    }));
  }
}
