/**
 * @bridge/audit
 *
 * Append-only audit trail for privileged actions (Bridge plan §21: "expert
 * publication actions should be audited", "admin/reviewer access must be
 * permissioned"). Records are immutable — the store exposes append + query,
 * never update/delete. Storage behind the usual seam (memory / JSON file /
 * Postgres per db/migrations/0010).
 */

import type { NexusBridgeContext } from "@laic/learner-contracts";

export type AuditAction =
  | "generation.run"
  | "kb.create"
  | "kb.item.create"
  | "kb.item.edit"
  | "kb.edge.change"
  | "kb.pack.save"
  | "kb.extraction.run"
  | "kb.suggestion.change"
  | "kb.version.publish"
  | "kb.version.delete"
  | "kb.item.version.commit"
  | "kb.item.version.restore"
  | "kb.item.version.delete"
  | "kb.derive"
  | "kb.delete"
  | "knowledge.item.edit"
  | "knowledge.item.status"
  | "knowledge.source.register"
  | "knowledge.source.upload"
  | "knowledge.ingestion.run"
  | "knowledge.gap.resolve"
  | "profile.create"
  | "profile.update"
  | "profile.customize"
  | "scope.update"
  | "scope.customize"
  | "org.profile.update"
  | "org.affiliation.change"
  | "session.undo"
  | "session.fork";

export interface AuditRecord {
  auditId: string;
  ts: string;
  actorUserId: string;
  actorAccessLevel: string;
  /** Tenant scope the actor was operating under at the time. */
  programOrganizationId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  /** Small structured payload (before/after ids, versions, statuses…). */
  details: Record<string, unknown>;
}

export interface AuditQuery {
  actorUserId?: string;
  action?: AuditAction;
  resourceId?: string;
  limit?: number;
}

export interface AuditStore {
  append(record: AuditRecord): Promise<void>;
  /** Newest first. */
  query(q: AuditQuery): Promise<AuditRecord[]>;
}

export interface AuditStoreData {
  records: AuditRecord[];
}

export class InMemoryAuditStore implements AuditStore {
  protected data: AuditStoreData;
  constructor(seed?: Partial<AuditStoreData>) {
    this.data = { records: [], ...structuredClone(seed ?? {}) };
  }
  protected persist(): void {}
  async append(record: AuditRecord): Promise<void> {
    if (this.data.records.some((r) => r.auditId === record.auditId))
      throw new Error(`Audit record ${record.auditId} already exists (append-only store)`);
    this.data.records.push(structuredClone(record));
    this.persist();
  }
  async query(q: AuditQuery): Promise<AuditRecord[]> {
    const out = this.data.records.filter(
      (r) =>
        (!q.actorUserId || r.actorUserId === q.actorUserId) &&
        (!q.action || r.action === q.action) &&
        (!q.resourceId || r.resourceId === q.resourceId),
    );
    return structuredClone(out.slice(-(q.limit ?? 200)).reverse());
  }
}

/** Build a record from the acting context; id is caller-supplied for determinism. */
export function auditRecord(
  context: NexusBridgeContext,
  input: {
    auditId: string;
    ts: string;
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    details?: Record<string, unknown>;
  },
): AuditRecord {
  return {
    auditId: input.auditId,
    ts: input.ts,
    actorUserId: context.nexusUserId,
    actorAccessLevel: context.accessLevel,
    programOrganizationId: context.programOrganizationId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    details: input.details ?? {},
  };
}
