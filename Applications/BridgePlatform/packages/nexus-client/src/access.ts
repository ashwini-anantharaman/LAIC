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
  return hasAnyRole(context, ADMIN_AREA_ROLES);
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
