/**
 * Per-request org-context binding — Nexus v0.4 Wall 1/3.
 *
 * Phase 1 (org-space isolation): both helpers are now thin wrappers over the
 * tenant door (`tenantDoor.ts`), which is the single place that (a) resolves
 * which datastore an org lives in via the residency registry and (b) binds the
 * RLS context (`nexus_app` role + `app.current_user_id` GUC). The org id is
 * taken from the request context when the URL names one (`/orgs/:org_id/…`).
 *
 * Keep using these wrappers in repos; new code that knows its org id should
 * prefer calling `tenantTransaction`/`privilegedTransaction` directly with it.
 */
import { currentOrgId } from "./requestContext";
import { privilegedTransaction, tenantTransaction, type Tx } from "./tenantDoor";

export type { Tx };

/**
 * Run `fn` as the current user, inside an RLS-enforced transaction on the
 * org's datastore. Pass `null` for an unauthenticated caller (sees zero rows).
 */
export async function withUserContext<T>(
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return tenantTransaction({ userId, orgId: currentOrgId() }, fn);
}

/**
 * Escape hatch for genuinely global/admin operations that must bypass RLS
 * (e.g. provisioning a brand-new org before any membership exists, identity
 * bootstrap at login). Runs as the connecting (privileged) role — use
 * sparingly and always behind a server-side authorization check.
 *
 * Prefer `privilegedTransaction(reason, fn)` from tenantDoor for new code —
 * it makes the justification explicit.
 */
export async function asPrivileged<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return privilegedTransaction("legacy asPrivileged call (pre-Phase-1 site)", fn, {
    orgId: currentOrgId(),
  });
}
