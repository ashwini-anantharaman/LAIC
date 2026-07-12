/**
 * Org-scoped profile resolution — Nexus v0.4 Slice 10.
 *
 * Person-FK columns (audit actor, created_by, added_by, participant user, …)
 * reference the org-scoped `profiles.id`. Callers up the stack pass either an
 * already-resolved profile id or the shared auth id; this normalizes to the
 * profile id for the given org (or null).
 */
import { and, eq } from "drizzle-orm";

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

/** Find-or-create the org-scoped profile for a person (by auth id) in an org. */
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
