// Bridge's adapter onto the platform KB component (@laic/kb-core).
//
// The component owns access semantics — scoped instances + the knowledge
// lifecycle policy (view → author → review → approve → version → derive);
// this file binds it to bridge: the Nexus context becomes a principal (the
// same mapping the library component uses), the default policy is bound to
// bridge's staff roles, and KnowledgeBase records map to the KbMeta
// envelope. Versioning/derivation MECHANICS stay in @bridge/kb — the
// component only decides who may invoke them.

import type { KnowledgeBase } from "@bridge/kb";
import { ADMIN_AREA_ROLES, type NexusBridgeContext } from "@bridge/nexus-client";
import {
  canPerformKb,
  defaultKbPolicy,
  type KbMeta,
  type KbOperation,
  type KbPrincipal,
} from "@laic/kb-core";
import { libraryPrincipalOf } from "./libraryComponent";

/** Default policy bound to bridge staff roles: the admin tier holds the whole
 *  lifecycle on the program instance; every kb.* capability is the
 *  configurable path for custom roles on top. */
const bridgeKbPolicy = defaultKbPolicy({
  programStaff: [...ADMIN_AREA_ROLES],
});

/** The principal mapping is identical to the library component's — reuse it
 *  (the two cores share the principal shape by design). */
export async function kbPrincipalOf(context: NexusBridgeContext): Promise<KbPrincipal> {
  return libraryPrincipalOf(context);
}

/** KnowledgeBase → component envelope. Legacy KBs without a scope stamp are
 *  program-scoped: the shared, staff-curated instance (pre-component reality). */
export function kbMetaOf(kb: KnowledgeBase): KbMeta {
  const level = kb.scopeLevel ?? "program";
  return {
    id: kb.kbId,
    name: kb.name,
    ...(kb.description ? { description: kb.description } : {}),
    status: kb.status,
    createdBy: kb.createdBy,
    createdAt: kb.createdAt,
    scope: {
      level,
      ...(level === "user" ? { ownerId: kb.createdBy } : {}),
      ...(kb.programOrganizationId ? { orgId: kb.programOrganizationId } : {}),
      ...(kb.nexusProgramId ? { programId: kb.nexusProgramId } : {}),
    },
    ...(kb.derivedFromKbId
      ? {
          derivation: {
            fromKbId: kb.derivedFromKbId,
            ...(kb.derivedFromVersionId ? { fromVersionId: kb.derivedFromVersionId } : {}),
          },
        }
      : {}),
  };
}

/** Policy check against the program instance (the workspace's home scope). */
export async function canKb(
  context: NexusBridgeContext,
  operation: KbOperation,
): Promise<boolean> {
  const principal = await kbPrincipalOf(context);
  return canPerformKb(bridgeKbPolicy, principal, operation, { level: "program" });
}

/** Gate for the KB workspace pages — replaces the bare admin-area check, so a
 *  custom role granted `kb.view` in the Access Catalogue can enter. */
export function canViewKbWorkspace(context: NexusBridgeContext): Promise<boolean> {
  return canKb(context, "view");
}
