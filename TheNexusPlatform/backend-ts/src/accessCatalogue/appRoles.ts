/**
 * Custom roles for the Bridge Bird APP — a club's own "app permissions".
 *
 * The Bridge Platform has `bridgeRoles.ts`; this is the same idea for the mobile
 * app, against the app's own catalogue (`club-app`). They are deliberately
 * separate stores: a role that may edit knowledge on the desktop platform has
 * nothing to say about whether you can pin a message in a club chat, and the two
 * inventories are different products.
 *
 * A role is `{ id, name, capabilities[] }` bound to ids from the club-app
 * catalogue. Assignment (who holds it) reuses the existing
 * `platform_role_assignments` table with `platform = "club-app"`, so a person
 * holds exactly ONE app role per program — which is what the console's partner
 * view assigns, and what the app displays beside their name.
 *
 * Stored in platform_settings, keyed per program, so no migration is needed for
 * a club to start authoring roles.
 */
import * as db from "../platformDb";
import { getCatalogue, validGrantsAcross } from "./store";
import { grantableCapabilities } from "./resolver";

export interface AppRole {
  id: string;
  name: string;
  capabilities: string[];
}

const key = (programId: string) => `club_app_roles:${programId}`;

/** Deterministic, url-safe, unique — same construction as the bridge roles. */
let _seq = 0;
function newId(programId: string): string {
  _seq = (_seq + 1) % 1_000_000;
  return `ar_${programId.slice(0, 8)}_${_seq.toString(36)}_${process.hrtime.bigint().toString(36)}`;
}

/** Capabilities are sanitized against the app's catalogue, so a role can never
 *  carry an id the inventory does not define. */
async function _sanitize(capabilities: string[]): Promise<string[]> {
  return validGrantsAcross([{ providerId: "club-app" }], capabilities ?? []);
}

export async function listAppRoles(programId: string): Promise<AppRole[]> {
  const raw = (await db.getPlatformSetting(key(programId))) as AppRole[] | null;
  return Array.isArray(raw) ? raw : [];
}

export async function getAppRole(programId: string, roleId: string): Promise<AppRole | null> {
  return (await listAppRoles(programId)).find((r) => r.id === roleId) ?? null;
}

export async function createAppRole(
  programId: string,
  name: string,
  capabilities: string[],
): Promise<AppRole> {
  const roles = await listAppRoles(programId);
  const role: AppRole = {
    id: newId(programId),
    name,
    capabilities: await _sanitize(capabilities),
  };
  roles.push(role);
  await db.setPlatformSetting(key(programId), roles as unknown as Record<string, unknown>);
  return role;
}

export async function updateAppRole(
  programId: string,
  roleId: string,
  patch: { name?: string; capabilities?: string[] },
): Promise<AppRole | null> {
  const roles = await listAppRoles(programId);
  const idx = roles.findIndex((r) => r.id === roleId);
  if (idx < 0) return null;
  roles[idx] = {
    ...roles[idx],
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.capabilities !== undefined
      ? { capabilities: await _sanitize(patch.capabilities) }
      : {}),
  };
  await db.setPlatformSetting(key(programId), roles as unknown as Record<string, unknown>);
  return roles[idx];
}

export async function deleteAppRole(programId: string, roleId: string): Promise<void> {
  const roles = (await listAppRoles(programId)).filter((r) => r.id !== roleId);
  await db.setPlatformSetting(key(programId), roles as unknown as Record<string, unknown>);
}

/**
 * What a club's STARTER role grants, by sample-template id. Used to seed a new
 * role in the console so an admin edits a sensible set rather than 26 empty
 * checkboxes.
 */
export async function starterCapabilities(templateId: string): Promise<string[]> {
  const doc = await getCatalogue("club-app");
  const tmpl = (doc.sampleRoleTemplates ?? []).find(
    (t) => t.id === templateId || t.name === templateId,
  );
  return [...new Set(tmpl?.grants?.flatMap((g) => g.capabilityIds) ?? [])];
}

/**
 * The app capabilities a person holds in a program, and the NAME of the role
 * they hold — the two things the app needs.
 *
 * A person holds ONE role in a program, authored in the console's partner view.
 * That role is a PROGRAM ROLE: the same role that carries their console and
 * platform grants also carries their app permissions, as one set of capability
 * ids. This is why the console needs no separate app-role builder — the app's
 * catalogue simply appears as another section of the existing one.
 *
 * Resolution order:
 *   1. Structural tier (club owner/administrator) → everything the catalogue
 *      grants, no role required, exactly as they bypass every other catalogue.
 *   2. The program role's own capabilities, filtered to THIS catalogue.
 *   3. A club-authored app-only role (the appRoles store), for a club that
 *      wants app roles independent of its console roles.
 *   4. Nothing.
 */
export async function appAccessFor(
  programId: string,
  input: {
    structuralTier?: boolean;
    /** The role's grant LEVEL on the app's own area (perms.clubapp). */
    areaLevel?: string | null;
    /** The program role's name, as the console shows it. */
    roleName?: string | null;
    /** The program role's own capability ids (perms.capabilities). */
    programRoleCapabilities?: string[] | null;
    /** An app-only role id assigned through platform_role_assignments. */
    assignedRoleId?: string | null;
  } = {},
): Promise<{ roleName: string | null; capabilities: string[] }> {
  const doc = await getCatalogue("club-app");
  if (input.structuralTier) {
    return { roleName: "Administrator", capabilities: grantableCapabilities(doc) };
  }

  // A role granting the app's AREA at "administrator" holds the whole
  // catalogue by definition. The console's role builder stores such a grant
  // as { clubapp: "administrator", capabilities: [] } — no per-capability
  // ids — and an empty list read as "nothing": B2F3's Mentor role showed
  // every toggle on in the builder yet resolved to zero capabilities, so its
  // holders failed every gate (and the coach test with them). Same expansion
  // as the structural tier, but the role keeps its own name.
  if (input.areaLevel === "administrator") {
    return { roleName: input.roleName ?? null, capabilities: grantableCapabilities(doc) };
  }

  // The program role's grants, kept only where they name THIS catalogue — a
  // role spanning console + platform + app carries all three, and each consumer
  // takes its own.
  if (input.programRoleCapabilities?.length) {
    const mine = await validGrantsAcross([{ providerId: "club-app" }], input.programRoleCapabilities);
    if (mine.length) return { roleName: input.roleName ?? null, capabilities: mine };
  }

  if (input.assignedRoleId) {
    const custom = await getAppRole(programId, input.assignedRoleId);
    if (custom) return { roleName: custom.name, capabilities: custom.capabilities };
    // A starter template assigned by id/name, for a club that has not authored
    // its own roles yet.
    const tmpl = (doc.sampleRoleTemplates ?? []).find(
      (t) => t.id === input.assignedRoleId || t.name === input.assignedRoleId,
    );
    if (tmpl) {
      return {
        roleName: tmpl.name,
        capabilities: [...new Set(tmpl.grants?.flatMap((g) => g.capabilityIds) ?? [])],
      };
    }
  }
  return { roleName: input.roleName ?? null, capabilities: [] };
}
