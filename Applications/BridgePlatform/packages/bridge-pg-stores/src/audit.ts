// AuditStore over db/migrations/0010 (append-only: insert + select only).

import type { AuditQuery, AuditRecord, AuditStore } from "@bridge/audit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

export class PgAuditStore implements AuditStore {
  constructor(private readonly db: SupabaseClient) {}

  async append(record: AuditRecord) {
    const { error } = await this.db.from("bridge_audit_log").insert({
      audit_id: record.auditId,
      ts: record.ts,
      actor_user_id: record.actorUserId,
      actor_access_level: record.actorAccessLevel,
      program_organization_id: record.programOrganizationId ?? null,
      action: record.action,
      resource_type: record.resourceType,
      resource_id: record.resourceId,
      details: record.details,
    });
    if (error) {
      if (error.code === "23505")
        throw new Error(`Audit record ${record.auditId} already exists (append-only store)`);
      throw new Error(`[pg-stores] audit append: ${error.message}`);
    }
  }

  async query(q: AuditQuery) {
    let sel = this.db.from("bridge_audit_log").select("*");
    if (q.actorUserId) sel = sel.eq("actor_user_id", q.actorUserId);
    if (q.action) sel = sel.eq("action", q.action);
    if (q.resourceId) sel = sel.eq("resource_id", q.resourceId);
    const rows = check(
      await sel.order("ts", { ascending: false }).limit(q.limit ?? 200),
      "audit query",
    );
    return rows.map((r: any): AuditRecord => ({
      auditId: r.audit_id,
      ts: r.ts,
      actorUserId: r.actor_user_id,
      actorAccessLevel: r.actor_access_level,
      programOrganizationId: r.program_organization_id ?? undefined,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      details: r.details ?? {},
    }));
  }
}
