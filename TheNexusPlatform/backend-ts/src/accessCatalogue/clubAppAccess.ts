/**
 * "What does this person's role in this club grant?" — asked once.
 *
 * This block existed twice, verbatim, in routes/platform.ts: once inside
 * `/bridge/context` (so the Bridge Platform can gate club actions) and once inside
 * `/club-app/context` (so the app can gate its own). Both did the same four things —
 * test the structural tier, read the program role for the caller's email, pull
 * `perms.capabilities` and `perms.clubapp`, hand them to `appAccessFor` — and both
 * had to keep agreeing about a rule that is genuinely subtle (see `areaLevel` below).
 *
 * A THIRD copy was about to be written, for the learning path, which is what finally
 * made this worth extracting: three hand-maintained copies of an authorization rule
 * is how two of them end up disagreeing, and the disagreement shows up as one screen
 * permitting what another refuses.
 *
 * Behaviour is identical to what it replaces. The clamp still lives in
 * `appAccessFor` — there is deliberately no unclamped export here either.
 */

import type { PlatformUser } from "../auth";
import * as appRoles from "./appRoles";

/** A membership row, as `PlatformUser.memberships` carries them. */
type Membership = { org_id: string; role: string; program_id?: string | null };

export interface ClubAppAccess {
  /** The role's name as the console shows it, or "Administrator" for the tier. */
  roleName: string | null;
  /** Clamped `app.*` ids. Empty means NO FINE ROLE — never "denied". */
  capabilities: string[];
  /** Club administrator, or the org's owner/admin. Holds the app entire. */
  structuralTier: boolean;
}

/**
 * Is this person structurally in charge of the club?
 *
 * An org-level membership (`!m.program_id`) covers every club in the org; a
 * program-scoped one covers only its own. Same bypass every other catalogue gives.
 */
export function clubStructuralTier(
  memberships: readonly Membership[],
  clubOrgId: string | null | undefined,
  clubProgramId: string | null | undefined,
): boolean {
  if (!clubOrgId || !clubProgramId) return false;
  return memberships.some(
    (m) =>
      m.org_id === clubOrgId &&
      ["owner", "administrator"].includes(m.role) &&
      (!m.program_id || m.program_id === clubProgramId),
  );
}

/**
 * Resolve one person's club-app access.
 *
 * `getRole` is injected rather than imported so this module stays free of the db
 * layer — the two callers already hold a graph handle, and a repo import here would
 * make the access catalogue depend on the database to answer a question about a
 * document.
 *
 * NEVER THROWS. A bad role or an unreadable catalogue returns an empty capability
 * list, which downstream reads as "no fine role" and falls back to coarse behaviour —
 * the same discipline as everywhere else: a failure is not a revocation.
 */
export async function clubAppAccessFor(
  user: PlatformUser,
  clubProgramId: string,
  clubOrgId: string | null | undefined,
  getRole: (programId: string, email: string) => Promise<Record<string, unknown> | null>,
): Promise<ClubAppAccess> {
  const structuralTier = clubStructuralTier(user.memberships as Membership[], clubOrgId, clubProgramId);

  let roleName: string | null = null;
  let granted: string[] = [];
  let areaLevel: string | null = null;

  if (!structuralTier && user.email) {
    const role = await getRole(clubProgramId, user.email).catch(() => null);
    if (role) {
      roleName = (role.role_name as string | null) ?? null;
      const perms = (role.perms as Record<string, unknown>) ?? {};
      granted = Array.isArray(perms.capabilities) ? (perms.capabilities as string[]) : [];
      // The role's grant level on the app's own area. "administrator" means the
      // whole catalogue and stores NO per-capability ids — the console's builder
      // saves such a grant as { clubapp: "administrator", capabilities: [] }, and
      // reading that empty list as "nothing" is what once left B2F3's Mentors
      // failing every gate while the builder showed every toggle on.
      areaLevel = typeof perms.clubapp === "string" ? perms.clubapp : null;
    }
  }

  try {
    const resolved = await appRoles.appAccessFor(clubProgramId, {
      structuralTier,
      areaLevel,
      roleName,
      programRoleCapabilities: granted,
    });
    return { roleName: resolved.roleName, capabilities: resolved.capabilities, structuralTier };
  } catch (e) {
    console.error("club-app access resolution failed (using empty set):", e);
    return { roleName, capabilities: [], structuralTier };
  }
}
