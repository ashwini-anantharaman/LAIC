/**
 * Custom Bridge-Platform roles — the bridge equivalent of the learning app's
 * People-tab roles, but stored MIGRATION-FREE in platform_settings (keyed per
 * program) instead of a dedicated table, since bridge role storage post-dates
 * the last DB migration. A role is { id, name, capabilities[] } binding ids
 * from the bridge catalogue; assignment (who holds it) stays in the existing
 * platform_role_assignments table (role column = this role's id).
 *
 * Behaviour mirrors learning: catalogue defines the inventory, roles bind
 * capabilities, capabilities are the enforced source of truth.
 */
import * as db from "../platformDb";
import { getCatalogue, validGrantsAcross } from "./store";
import { grantableCapabilities } from "./resolver";
import type { CapabilityCatalogueDocument } from "./types";

export interface BridgeRole {
  id: string;
  name: string;
  capabilities: string[];
}

const key = (programId: string) => `bridge_roles:${programId}`;
const designationsKey = (programId: string) => `bridge_collection_designations:${programId}`;

/**
 * Library collection designations: which collections each ROLE may view —
 * keyed by role id (prebuilt like "bridge_learner", custom role ids, or "*"
 * for everyone in the program). The library component enforces via the
 * caller's resolved collectionGrants; this map is the role-issued source.
 */
export async function getCollectionDesignations(
  programId: string,
): Promise<Record<string, string[]>> {
  const raw = (await db.getPlatformSetting(designationsKey(programId))) as
    | Record<string, string[]>
    | null;
  return raw && typeof raw === "object" ? raw : {};
}

export async function setCollectionDesignations(
  programId: string,
  map: Record<string, string[]>,
): Promise<Record<string, string[]>> {
  const clean: Record<string, string[]> = {};
  for (const [role, ids] of Object.entries(map ?? {})) {
    if (Array.isArray(ids) && ids.length) clean[role] = [...new Set(ids.map(String))];
  }
  await db.setPlatformSetting(designationsKey(programId), clean);
  return clean;
}
// Deterministic id (no Math.random / Date in this codebase's constraints is
// fine here — this is request-time, not a workflow). Kept url-safe + unique.
let _seq = 0;
function newId(programId: string): string {
  _seq = (_seq + 1) % 1_000_000;
  return `br_${programId.slice(0, 8)}_${_seq.toString(36)}_${process.hrtime.bigint().toString(36)}`;
}

export async function listBridgeRoles(programId: string): Promise<BridgeRole[]> {
  const raw = (await db.getPlatformSetting(key(programId))) as BridgeRole[] | null;
  return Array.isArray(raw) ? raw : [];
}

export async function getBridgeRole(programId: string, roleId: string): Promise<BridgeRole | null> {
  return (await listBridgeRoles(programId)).find((r) => r.id === roleId) ?? null;
}

/** Capabilities are sanitized against the catalogues bridge roles may bind:
 *  bridge's own, plus the LIBRARY component's (its own provider document is
 *  the single source of truth for library.* ids — bridge references it
 *  rather than defining copies). */
async function _sanitize(capabilities: string[]): Promise<string[]> {
  return validGrantsAcross(
    [{ providerId: "bridge" }, { providerId: "library" }],
    capabilities ?? [],
  );
}

export async function createBridgeRole(programId: string, name: string, capabilities: string[]): Promise<BridgeRole> {
  const roles = await listBridgeRoles(programId);
  const role: BridgeRole = { id: newId(programId), name, capabilities: await _sanitize(capabilities) };
  roles.push(role);
  await db.setPlatformSetting(key(programId), roles as unknown as Record<string, unknown>);
  return role;
}

export async function updateBridgeRole(
  programId: string,
  roleId: string,
  patch: { name?: string; capabilities?: string[] },
): Promise<BridgeRole | null> {
  const roles = await listBridgeRoles(programId);
  const idx = roles.findIndex((r) => r.id === roleId);
  if (idx < 0) return null;
  const next: BridgeRole = {
    ...roles[idx],
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.capabilities !== undefined ? { capabilities: await _sanitize(patch.capabilities) } : {}),
  };
  roles[idx] = next;
  await db.setPlatformSetting(key(programId), roles as unknown as Record<string, unknown>);
  return next;
}

export async function deleteBridgeRole(programId: string, roleId: string): Promise<void> {
  const roles = (await listBridgeRoles(programId)).filter((r) => r.id !== roleId);
  await db.setPlatformSetting(key(programId), roles as unknown as Record<string, unknown>);
}

/**
 * The capability ids a launch LEVEL implies for bridge, from the catalogue's own
 * sample roles: admin → everything grantable; edit → bridge-expert; comment →
 * bridge-session-operator; view → bridge-participant. Coarse Nexus access →
 * bridge capabilities for people without a custom role.
 */
export function bridgeCapsForLevel(doc: CapabilityCatalogueDocument, level: "admin" | "edit" | "comment" | "view"): string[] {
  if (level === "admin") return grantableCapabilities(doc);
  const sampleId = level === "edit" ? "bridge-expert" : level === "comment" ? "bridge-session-operator" : "bridge-participant";
  const tmpl = (doc.sampleRoleTemplates ?? []).find((r) => r.id === sampleId);
  const ids = tmpl?.grants?.flatMap((g) => g.capabilityIds) ?? [];
  return [...new Set(ids)];
}

/** Resolve a role identifier (either a custom role id or a pre-built role name)
 *  to its bridge capability set. Falls back to empty when unknown. */
export async function capsForAssignedRole(programId: string, roleIdOrName: string | null): Promise<string[] | null> {
  if (!roleIdOrName) return null;
  const custom = await getBridgeRole(programId, roleIdOrName);
  if (custom) return custom.capabilities;
  // A pre-built role name → its sample-template caps, if the catalogue names one.
  const doc = await getCatalogue("bridge");
  const tmpl = (doc.sampleRoleTemplates ?? []).find((r) => r.id === roleIdOrName || r.name === roleIdOrName);
  if (tmpl) return [...new Set(tmpl.grants?.flatMap((g) => g.capabilityIds) ?? [])];
  return null;
}
