// AssignmentStore over 0021 (scalar columns; no jsonb payload needed).

import type { Assignment, AssignmentFilter, AssignmentStore } from "@bridge/sessions";
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
      .limit(200);
    if (filter?.programOrganizationId !== undefined)
      query = query.eq("program_organization_id", filter.programOrganizationId);
    if (filter?.nexusProgramId !== undefined)
      query = query.eq("nexus_program_id", filter.nexusProgramId);
    if (filter?.coachId !== undefined) query = query.eq("coach_id", filter.coachId);
    if (filter?.learnerId !== undefined) query = query.eq("learner_id", filter.learnerId);
    if (filter?.entryId !== undefined) query = query.eq("entry_id", filter.entryId);
    if (filter?.sourceEntryId !== undefined)
      query = query.eq("source_entry_id", filter.sourceEntryId);
    const rows = check(await query, "assignments.list");
    return rows.map(fromRow);
  }
}
