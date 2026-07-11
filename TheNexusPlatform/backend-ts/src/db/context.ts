/**
 * Per-request org-context binding — Nexus v0.4 Wall 1/3.
 *
 * Tenant queries must run subject to RLS. We open a transaction, switch the
 * effective role to the non-superuser `nexus_app` (so RLS is enforced — a
 * superuser/owner would bypass it), and bind the caller's identity into the
 * `app.current_user_id` GUC that the RLS policies read. `SET LOCAL` scopes both
 * to the transaction, so nothing leaks between requests on a pooled connection.
 *
 * This is the ONLY place tenant context is bound. Handlers never set it ad hoc.
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getDb, schema } from "./client";

/** The transaction handle passed to the callback (same query API as the db). */
export type Tx = Parameters<Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0]>[0];

/**
 * Run `fn` as the current user, inside an RLS-enforced transaction.
 * Pass `null` for an unauthenticated caller (sees zero tenant rows).
 */
export async function withUserContext<T>(
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${userId ?? ""}, true)`);
    await tx.execute(sql`select set_config('role', 'nexus_app', true)`);
    return fn(tx);
  });
}

/**
 * Escape hatch for genuinely global/admin operations that must bypass RLS
 * (e.g. provisioning a brand-new org before any membership exists, Nexus-level
 * super-admin reads). Runs as the connecting (privileged) role — use sparingly
 * and always behind a server-side global-role check + audit.
 */
export async function asPrivileged<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => fn(tx));
}
