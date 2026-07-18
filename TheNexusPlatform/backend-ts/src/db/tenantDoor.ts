/**
 * The tenant door — Phase 1 of the org-space isolation plan.
 *
 * EVERY org-data transaction is opened here, and only here. The door does two
 * things per call:
 *
 *   1. RESOLVE which datastore the org lives in, via the residency registry
 *      (`organizations.data_residency`). Today every org is `shared` → the one
 *      shared pool, walled by RLS. When an org is later flipped to `dedicated`,
 *      this is the single place that routes its queries to its own database —
 *      no other code changes. Until dedicated provisioning exists, a dedicated
 *      org FAILS LOUDLY here instead of silently using the shared pool.
 *
 *   2. BIND the security context: switch to the non-superuser `nexus_app` role
 *      (so RLS is actually enforced — the connecting/owner role would bypass it)
 *      and set the caller's identity into the `app.current_user_id` GUC that
 *      every RLS policy reads. `SET LOCAL` scopes both to the transaction.
 *
 * Privileged (RLS-bypassing) transactions require a `reason` string, so every
 * bypass in the codebase is explicit, greppable, and reviewable.
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getDb, schema } from "./client";

export type Residency = "shared" | "dedicated";
export type TenantDb = PostgresJsDatabase<typeof schema>;
/** The transaction handle passed to callbacks (same query API as the db). */
export type Tx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

// ── Residency registry ───────────────────────────────────────────────────────
// Cached per org id: residency changes are a rare operator governance act.
// Whatever endpoint later flips an org to `dedicated` must call
// `resetResidencyCache()` (and provision the datastore) as part of that act.

const _cache = new Map<string, Residency>();

async function _defaultFetchResidency(orgId: string): Promise<Residency> {
  // Boundary metadata read (no people): one column of the organizations row.
  const db = getDb();
  const rows = await db
    .select({ residency: schema.organizations.dataResidency })
    .from(schema.organizations)
    .where(sql`${schema.organizations.id} = ${orgId}`)
    .limit(1);
  const value = rows[0]?.residency;
  return value === "dedicated" ? "dedicated" : "shared";
}

let _fetchResidency: (orgId: string) => Promise<Residency> = _defaultFetchResidency;
let _dbSupplier: () => TenantDb = getDb;

export async function residencyFor(orgId: string): Promise<Residency> {
  const hit = _cache.get(orgId);
  if (hit) return hit;
  const value = await _fetchResidency(orgId);
  _cache.set(orgId, value);
  return value;
}

export function resetResidencyCache(): void {
  _cache.clear();
}

// ── Datastore resolution ─────────────────────────────────────────────────────

/**
 * The connection for an org's data. `null` orgId = the request's org is not
 * determinable (cross-org identity bootstrap, hook calls) → shared pool.
 */
export async function resolveTenantDb(orgId: string | null): Promise<TenantDb> {
  if (!orgId) return _dbSupplier();
  const residency = await residencyFor(orgId);
  if (residency === "dedicated") {
    // The seam exists; the provisioning doesn't yet. Fail loudly rather than
    // silently serving a dedicated org's data from the shared pool.
    throw new Error(
      `Organization ${orgId} has data_residency='dedicated' but no dedicated ` +
        `datastore is provisioned. Dedicated routing lands with the residency ` +
        `provisioning flow; until then this org must remain 'shared'.`,
    );
  }
  return _dbSupplier();
}

// ── The door ─────────────────────────────────────────────────────────────────

/**
 * Run `fn` inside an RLS-enforced transaction on the org's datastore, as the
 * calling user. Pass `userId: null` for an unauthenticated caller (sees zero
 * tenant rows). This is the ONLY place tenant context is bound.
 */
export async function tenantTransaction<T>(
  opts: { userId: string | null; orgId?: string | null },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const db = await resolveTenantDb(opts.orgId ?? null);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${opts.userId ?? ""}, true)`);
    await tx.execute(sql`select set_config('role', 'nexus_app', true)`);
    return fn(tx);
  });
}

/**
 * Escape hatch for genuinely global/admin operations that must bypass RLS
 * (provisioning a brand-new org before any membership exists, identity
 * bootstrap at login, hook/app-key writes that carry no user). Runs as the
 * connecting (privileged) role.
 *
 * The `reason` is mandatory and should say WHY RLS cannot apply — it makes
 * every bypass in the codebase greppable (`privilegedTransaction(`) and
 * reviewable one by one.
 */
export async function privilegedTransaction<T>(
  reason: string,
  fn: (tx: Tx) => Promise<T>,
  opts?: { orgId?: string | null },
): Promise<T> {
  if (!reason) throw new Error("privilegedTransaction requires a reason");
  const db = await resolveTenantDb(opts?.orgId ?? null);
  return db.transaction(async (tx) => fn(tx));
}

// ── Test seams ───────────────────────────────────────────────────────────────

export function setResidencyFetcherForTests(fetcher: ((orgId: string) => Promise<Residency>) | null): void {
  _fetchResidency = fetcher ?? _defaultFetchResidency;
  _cache.clear();
}

export function setDbSupplierForTests(supplier: (() => TenantDb) | null): void {
  _dbSupplier = supplier ?? getDb;
}
