import type { BridgeRole, NexusBridgeContext } from "@laic/learner-contracts";

/** Roles allowed into the Admin & Expert Review area (Bridge plan §7.1–7.2). */
export const ADMIN_AREA_ROLES: readonly BridgeRole[] = [
  "bridge_program_admin",
  "bridge_org_admin",
  "bridge_club_admin",
  "bridge_reviewer",
  "bridge_fellow",
];

export function hasAnyRole(
  context: NexusBridgeContext,
  roles: readonly BridgeRole[],
): boolean {
  return context.roles.some((role) => roles.includes(role));
}

export function canAccessAdminArea(context: NexusBridgeContext): boolean {
  return context.is_admin === true || hasAnyRole(context, ADMIN_AREA_ROLES);
}

/** Capability gate (Access Catalogue model): an admin holds everything, else the
 *  context must carry one of the given capability ids. Mirrors learning. */
export function hasAnyCapability(
  context: NexusBridgeContext,
  capabilityIds: readonly string[],
): boolean {
  if (context.is_admin) return true;
  const held = new Set(context.capabilities ?? []);
  return capabilityIds.some((id) => held.has(id));
}

const ROLE_LABELS: Record<BridgeRole, string> = {
  bridge_program_admin: "Program Admin",
  bridge_org_admin: "Organization Admin",
  bridge_club_admin: "Club Admin",
  bridge_coach: "Coach",
  bridge_reviewer: "Reviewer",
  bridge_fellow: "Fellow",
  bridge_learner: "Learner",
  bridge_guest: "Guest",
};

export function roleLabel(role: BridgeRole): string {
  return ROLE_LABELS[role] ?? role;
}

// ---------------------------------------------------------------------------
// Permission enforcement (§21): role gates answer "may they see the area";
// permissions answer "may they DO this" — server actions check both.
// ---------------------------------------------------------------------------

export class PermissionError extends Error {
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionError";
  }
}

export function hasPermission(context: NexusBridgeContext, permission: string): boolean {
  return context.permissions.includes(permission);
}

/** Throws PermissionError unless the context carries ANY of the permissions. */
export function requirePermission(
  context: NexusBridgeContext,
  ...permissions: string[]
): void {
  if (!permissions.some((p) => hasPermission(context, p)))
    throw new PermissionError(permissions.join(" | "));
}
