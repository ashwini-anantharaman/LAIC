/**
 * Request-scoped user context — Nexus v0.4 Slice 5.
 *
 * Tenant queries must run under RLS bound to the calling user, but the data-layer
 * functions are context-free (they don't take a userId). Rather than thread a
 * userId through every call site, we stash it in AsyncLocalStorage per request
 * (set by a middleware in app.ts) and the Drizzle repo reads it to open the right
 * `withUserContext` transaction. No ambient user (hook/app-key calls, provisioning)
 * → the repo falls back to a privileged transaction.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<{ userId: string | null }>();

export function runWithRequestUser<T>(userId: string | null, fn: () => T): T {
  return als.run({ userId }, fn);
}

export function currentUserId(): string | null {
  return als.getStore()?.userId ?? null;
}
