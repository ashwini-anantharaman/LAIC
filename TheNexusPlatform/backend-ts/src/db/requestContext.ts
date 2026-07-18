/**
 * Request-scoped user context — Nexus v0.4 Slice 5.
 *
 * Tenant queries must run under RLS bound to the calling user, but the data-layer
 * functions are context-free (they don't take a userId). Rather than thread a
 * userId through every call site, we stash it in AsyncLocalStorage per request
 * (set by a middleware in app.ts) and the Drizzle repo reads it to open the right
 * `withUserContext` transaction. No ambient user (hook/app-key calls, provisioning)
 * → the repo falls back to a privileged transaction.
 *
 * Phase 1 (org-space isolation): the store also carries the request's org id
 * (parsed from `/orgs/:org_id/…` paths) so the tenant door can resolve which
 * datastore the org lives in (shared today; dedicated is a residency flip later).
 */
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<{ userId: string | null; orgId: string | null }>();

export function runWithRequestContext<T>(
  ctx: { userId: string | null; orgId: string | null },
  fn: () => T,
): T {
  return als.run(ctx, fn);
}

/** Back-compat helper (userId only). */
export function runWithRequestUser<T>(userId: string | null, fn: () => T): T {
  return runWithRequestContext({ userId, orgId: null }, fn);
}

export function currentUserId(): string | null {
  return als.getStore()?.userId ?? null;
}

/** The org the request addresses (from the URL), when determinable. */
export function currentOrgId(): string | null {
  return als.getStore()?.orgId ?? null;
}
