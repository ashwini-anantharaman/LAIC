// AssignmentStore over 0021 (per-learner rows: scalar columns, no jsonb needed)
// plus the 0028 BRIEF and its REVIEWERS, which ARE jsonb-primary like
// 0026/0027 — the brief's whole record lives in `record` so embedded drills and
// tutorials need no future DDL.

import type {
  Assignment,
  AssignmentBrief,
  AssignmentBriefFilter,
  AssignmentFilter,
  AssignmentReviewer,
  AssignmentStore,
  ReviewerFilter,
} from "@bridge/sessions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

function toRow(a: Assignment) {
  return {
    assignment_id: a.assignmentId,
    program_organization_id: a.programOrganizationId ?? null,
    nexus_program_id: a.nexusProgramId ?? null,
    coach_id: a.coachId,
    coach_name: a.coachName ?? null,
    learner_id: a.learnerId,
    learner_name: a.learnerName ?? null,
    entry_id: a.entryId,
    source_entry_id: a.sourceEntryId ?? null,
    entry_kind: a.entryKind,
    entry_name: a.entryName,
    note: a.note ?? null,
    status: a.status,
    session_id: a.sessionId ?? null,
    brief_id: a.briefId ?? null,
    created_at: a.createdAt,
    started_at: a.startedAt ?? null,
    completed_at: a.completedAt ?? null,
  };
}

function fromRow(r: any): Assignment {
  return {
    assignmentId: r.assignment_id,
    programOrganizationId: r.program_organization_id ?? undefined,
    nexusProgramId: r.nexus_program_id ?? undefined,
    coachId: r.coach_id,
    coachName: r.coach_name ?? undefined,
    learnerId: r.learner_id,
    learnerName: r.learner_name ?? undefined,
    entryId: r.entry_id,
    sourceEntryId: r.source_entry_id ?? undefined,
    entryKind: r.entry_kind,
    entryName: r.entry_name,
    note: r.note ?? undefined,
    status: r.status,
    sessionId: r.session_id ?? undefined,
    // Absent on every pre-0028 row; the fan-out reads that as "the assigning
    // coach alone", which is exactly the pre-0028 behaviour.
    briefId: r.brief_id ?? undefined,
    createdAt: r.created_at,
    startedAt: r.started_at ?? undefined,
    completedAt: r.completed_at ?? undefined,
  };
}

export class PgAssignmentStore implements AssignmentStore {
  constructor(private readonly db: SupabaseClient) {}

  async putAssignment(assignment: Assignment) {
    check(
      await this.db
        .from("bridge_assignments")
        .upsert(toRow(assignment), { onConflict: "assignment_id" }),
      "assignments.put",
    );
  }
  async getAssignment(assignmentId: string) {
    const rows = check(
      await this.db
        .from("bridge_assignments")
        .select("*")
        .eq("assignment_id", assignmentId),
      "assignments.get",
    );
    return rows.length ? fromRow(rows[0]) : null;
  }
  async listAssignments(filter?: AssignmentFilter) {
    let query = this.db
      .from("bridge_assignments")
      .select("*")
      .order("created_at", { ascending: false })
      // Raised from 200: one brief issues one row per learner, and a coach with
      // a term's worth of assignments would silently lose the tail.
      .limit(1000);
    if (filter?.programOrganizationId !== undefined)
      query = query.eq("program_organization_id", filter.programOrganizationId);
    if (filter?.nexusProgramId !== undefined)
      query = query.eq("nexus_program_id", filter.nexusProgramId);
    if (filter?.coachId !== undefined) query = query.eq("coach_id", filter.coachId);
    if (filter?.learnerId !== undefined) query = query.eq("learner_id", filter.learnerId);
    if (filter?.entryId !== undefined) query = query.eq("entry_id", filter.entryId);
    if (filter?.sourceEntryId !== undefined)
      query = query.eq("source_entry_id", filter.sourceEntryId);
    // Pushed down, not filtered in memory: the retroactive fan-out asks for one
    // brief's COMPLETED issues, and a client-side filter over a capped page
    // would quietly skip learners.
    if (filter?.briefId !== undefined) query = query.eq("brief_id", filter.briefId);
    if (filter?.status !== undefined) query = query.eq("status", filter.status);
    const rows = check(await query, "assignments.list");
    return rows.map(fromRow);
  }
  async deleteAssignment(assignmentId: string) {
    check(
      await this.db
        .from("bridge_assignments")
        .delete()
        .eq("assignment_id", assignmentId),
      "assignments.delete",
    );
  }

  // ── briefs (jsonb-primary; scalars DERIVED from the record so they cannot
  //    drift from it) ────────────────────────────────────────────────────────
  async putBrief(b: AssignmentBrief) {
    check(
      await this.db.from("bridge_assignment_briefs").upsert(
        {
          brief_id: b.briefId,
          program_organization_id: b.programOrganizationId ?? null,
          nexus_program_id: b.nexusProgramId ?? null,
          created_by: b.createdBy,
          created_by_name: b.createdByName ?? null,
          title: b.title,
          status: b.status,
          record: b,
          created_at: b.createdAt,
          updated_at: b.updatedAt,
        },
        { onConflict: "brief_id" },
      ),
      "briefs.put",
    );
  }
  async getBrief(briefId: string) {
    const rows = check(
      await this.db
        .from("bridge_assignment_briefs")
        .select("record")
        .eq("brief_id", briefId),
      "briefs.get",
    );
    return rows.length ? ((rows[0] as any).record as AssignmentBrief) : null;
  }
  async listBriefs(filter?: AssignmentBriefFilter) {
    let query = this.db
      .from("bridge_assignment_briefs")
      .select("record")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (filter?.programOrganizationId !== undefined)
      query = query.eq("program_organization_id", filter.programOrganizationId);
    if (filter?.nexusProgramId !== undefined)
      query = query.eq("nexus_program_id", filter.nexusProgramId);
    if (filter?.createdBy !== undefined) query = query.eq("created_by", filter.createdBy);
    if (filter?.status !== undefined) query = query.eq("status", filter.status);
    const rows = check(await query, "briefs.list");
    return rows.map((r: any) => r.record as AssignmentBrief);
  }
  async deleteBrief(briefId: string) {
    // No FK from reviewers to briefs (see 0028), so the cleanup is explicit —
    // and kept identical to the in-memory store's.
    check(
      await this.db
        .from("bridge_assignment_reviewers")
        .delete()
        .eq("brief_id", briefId),
      "reviewers.deleteForBrief",
    );
    check(
      await this.db.from("bridge_assignment_briefs").delete().eq("brief_id", briefId),
      "briefs.delete",
    );
    // The per-learner assignment rows are deliberately NOT touched: the games
    // played and the feedback on them outlive the brief.
  }

  // ── reviewers ─────────────────────────────────────────────────────────────
  async putReviewer(r: AssignmentReviewer) {
    check(
      await this.db.from("bridge_assignment_reviewers").upsert(
        {
          brief_id: r.briefId,
          reviewer_id: r.reviewerId,
          reviewer_name: r.reviewerName ?? null,
          is_creator: r.isCreator,
          added_by: r.addedBy,
          added_at: r.addedAt,
        },
        { onConflict: "brief_id,reviewer_id" },
      ),
      "reviewers.put",
    );
  }
  async listReviewers(filter?: ReviewerFilter) {
    let query = this.db
      .from("bridge_assignment_reviewers")
      .select("*")
      .order("added_at", { ascending: true });
    // NO row limit, deliberately: a brief has a handful of reviewers, and a cap
    // here would silently drop one from the completion fan-out — the worst
    // failure this feature has.
    if (filter?.briefId !== undefined) query = query.eq("brief_id", filter.briefId);
    if (filter?.reviewerId !== undefined) query = query.eq("reviewer_id", filter.reviewerId);
    const rows = check(await query, "reviewers.list");
    return rows.map(
      (r: any): AssignmentReviewer => ({
        briefId: r.brief_id,
        reviewerId: r.reviewer_id,
        reviewerName: r.reviewer_name ?? undefined,
        isCreator: Boolean(r.is_creator),
        addedBy: r.added_by,
        addedAt: r.added_at,
      }),
    );
  }
  async removeReviewer(briefId: string, reviewerId: string) {
    check(
      await this.db
        .from("bridge_assignment_reviewers")
        .delete()
        .eq("brief_id", briefId)
        .eq("reviewer_id", reviewerId),
      "reviewers.remove",
    );
  }
}
