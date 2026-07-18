/**
 * Org-scoped profile resolution — Nexus v0.4 Slice 10, tightened in Phase 2
 * (org-scoped identity).
 *
 * Person-FK columns (audit actor, created_by, added_by, participant user, …)
 * reference the org-scoped `profiles.id`. Callers up the stack pass either an
 * already-resolved profile id or the shared auth id; this normalizes to the
 * profile id for the given org (or null).
 *
 * Phase 2 invariant — ONE CREDENTIAL, ONE ORG: identity lives inside an org's
 * space and never links across orgs. A credential that already has a profile
 * in one organization cannot acquire a profile in another (409) — a person in
 * two orgs is two accounts. `ensureOrgProfile` is the single place a person
 * enters an org on the Postgres path (signup, invitation accept, dev
 * activation), so the invariant is enforced here. Org-less profiles (the
 * platform operator, legacy global students) don't count as belonging to an
 * org. Pre-existing multi-org rows keep working; only NEW entry is blocked.
 */
import { and, eq, isNotNull, ne } from "drizzle-orm";

import { HttpError } from "../httpError";
import type { Tx } from "./context";
import { profiles } from "./schema";

export async function resolveProfileId(
  tx: Tx,
  id: string | null | undefined,
  orgId: string | null | undefined,
): Promise<string | null> {
  if (!id) return null;
  // Already a profile id?
  const direct = await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, id)).limit(1);
  if (direct.length) return direct[0].id;
  // Else treat as an auth id and resolve within the org.
  if (orgId) {
    const scoped = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.authUserId, id), eq(profiles.organizationId, orgId)))
      .limit(1);
    if (scoped.length) return scoped[0].id;
  }
  return null;
}

/**
 * Find-or-create the org-scoped profile for a person (by auth id) in an org.
 * Refuses (409) if the credential already belongs to a different organization.
 */
export async function ensureOrgProfile(
  tx: Tx,
  authUserId: string,
  orgId: string,
  opts: { email?: string | null; role?: string; displayName?: string | null } = {},
): Promise<string> {
  const existing = await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.authUserId, authUserId), eq(profiles.organizationId, orgId)))
    .limit(1);
  if (existing.length) return existing[0].id;

  // One credential, one org (Phase 2): block entry into a second organization.
  const elsewhere = await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.authUserId, authUserId),
        isNotNull(profiles.organizationId),
        ne(profiles.organizationId, orgId),
      ),
    )
    .limit(1);
  if (elsewhere.length) {
    throw new HttpError(
      409,
      "This account already belongs to another organization. Each organization uses its own account — use a different email address here.",
    );
  }

  const [created] = await tx
    .insert(profiles)
    .values({
      authUserId,
      organizationId: orgId,
      email: opts.email ?? null,
      role: opts.role ?? "student",
      displayName: opts.displayName ?? null,
    })
    .returning({ id: profiles.id });
  return created.id;
}
