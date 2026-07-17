// Server-side audit singleton (§21). Every privileged mutation calls audit()
// — the trail is append-only and viewable at /bridge/admin/audit.

import { auditRecord, type AuditAction, type AuditStore } from "@bridge/audit";
import { JsonFileAuditStore } from "@bridge/audit/fileStore";
import { PgAuditStore } from "@bridge/pg-stores";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { join } from "node:path";
import { dataDir, pgClient, storeBackend } from "./backend";

const globalCache = globalThis as unknown as { __bridgeAuditStore?: AuditStore };

export function auditStore(): AuditStore {
  if (!globalCache.__bridgeAuditStore) {
    globalCache.__bridgeAuditStore =
      storeBackend() === "postgres"
        ? new PgAuditStore(pgClient())
        : new JsonFileAuditStore(join(process.cwd(), dataDir(), "audit-log.json"));
  }
  return globalCache.__bridgeAuditStore;
}

export async function audit(
  context: NexusBridgeContext,
  action: AuditAction,
  resourceType: string,
  resourceId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await auditStore().append(
    auditRecord(context, {
      auditId: `aud_${crypto.randomUUID()}`,
      ts: new Date().toISOString(),
      action,
      resourceType,
      resourceId,
      details,
    }),
  );
}
