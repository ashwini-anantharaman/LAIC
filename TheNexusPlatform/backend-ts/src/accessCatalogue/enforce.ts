/**
 * Request-time capability enforcement (the authority). Given the caller and a
 * scope, resolve their effective capabilities from the central catalogue + their
 * stored role, and gate actions on them.
 *
 * Safety contract — this is layered on WITHOUT breaking anything:
 *   • Structural tiers (platform operator, org owner/admin, program admin) bypass
 *     to ALL capabilities, exactly as they bypass today.
 *   • A legacy / coarse-only role (no fine-grained `perms.capabilities`) resolves
 *     to an EMPTY set, and `requireCapability` treats empty as "not using fine
 *     grants → don't gate" — the endpoint's existing coarse guard still governs.
 *   • Only a role that actually carries fine capabilities gets fine-enforced.
 */
import type { PlatformUser } from "./../auth";
import { HttpError } from "../httpError";
import * as graph from "../db/orgGraphRepo";
import { dbEnabled } from "../db/client";
import { getCatalogue } from "./store";
import { resolveCapabilities } from "./resolver";
import type { ProviderId } from "./types";

export interface CatalogueScope {
  providerId: ProviderId;
  orgId?: string | null;
  programId?: string | null;
}

/** Is the caller a structural tier for this scope (→ full bypass)? */
function isStructuralTier(user: PlatformUser, scope: CatalogueScope): boolean {
  if (scope.providerId === "nexus-console") return user.role === "platform_admin";
  if (user.role === "platform_admin") return true;
  const orgId = scope.orgId;
  if (!orgId) return false;
  const isAdminRole = (m: { org_id: string; role: string; program_id?: string | null }) =>
    m.org_id === orgId && ["owner", "administrator"].includes(m.role);
  // Org-level owner/admin cover every scope in the org.
  if (user.memberships.some((m) => isAdminRole(m) && !m.program_id)) return true;
  if (scope.providerId === "org-console") return false;
  // Program-scoped admin covers the program (and its platforms).
  const pid = scope.programId;
  return !!pid && user.memberships.some((m) => isAdminRole(m) && m.program_id === pid);
}

const capsOf = (role: { perms?: unknown } | null): string[] => {
  const perms = (role?.perms as Record<string, unknown>) ?? {};
  return Array.isArray(perms.capabilities) ? (perms.capabilities as string[]) : [];
};

/** The caller's fine-grained capability ids for this scope's role (email-keyed). */
async function grantedCapabilityIds(user: PlatformUser, scope: CatalogueScope): Promise<string[]> {
  if (!dbEnabled() || !user.email) return [];
  if (scope.providerId === "nexus-console") return capsOf(await graph.getNexusRoleForEmail(user.email).catch(() => null));
  if (scope.providerId === "org-console") {
    return scope.orgId ? capsOf(await graph.getOrgRoleForEmail(scope.orgId, user.email).catch(() => null)) : [];
  }
  // program-console / learning / bridge → the program role (one role carries the
  // grants across those providers; the catalogue intersect keeps only this one's).
  return scope.programId ? capsOf(await graph.getProgramRoleForEmail(scope.programId, user.email).catch(() => null)) : [];
}

/** The instance id (org/program) a scope's catalogue is keyed by, if any. */
function instanceFor(scope: CatalogueScope): string | null {
  if (scope.providerId === "org-console") return scope.orgId ?? null;
  if (scope.providerId === "program-console") return scope.programId ?? null;
  return null; // nexus-console / learning / bridge are global
}

/** The caller's effective capability set for a provider scope. */
export async function capabilitiesFor(user: PlatformUser, scope: CatalogueScope): Promise<Set<string>> {
  const doc = await getCatalogue(scope.providerId, instanceFor(scope));
  if (isStructuralTier(user, scope)) return resolveCapabilities(doc, [], { structuralTier: true });
  return resolveCapabilities(doc, await grantedCapabilityIds(user, scope));
}

/**
 * Gate an action on a capability. Backward-compatible: a caller with no fine
 * grants (empty set) is NOT blocked here — the endpoint's existing coarse guard
 * remains the authority for them. Only fine-grained roles (and by construction
 * NOT structural tiers, who resolve to the full set) can be refused.
 */
export async function requireCapability(user: PlatformUser, scope: CatalogueScope, capability: string): Promise<void> {
  const caps = await capabilitiesFor(user, scope);
  if (caps.size === 0) return; // legacy / coarse-only → governed by the coarse guard
  if (!caps.has(capability)) throw new HttpError(403, `Missing capability: ${capability}`);
}
