import {
  ADMIN_AREA_ROLES,
  hasAnyRole,
  type NexusBridgeContext,
} from "@bridge/nexus-client";
import type { BridgeRole } from "@laic/learner-contracts";

export type NavItem = {
  href: string;
  label: string;
  /** When set, the item renders only for contexts holding one of these roles. */
  requiresRoles?: readonly BridgeRole[];
};

/**
 * Navigation during the knowledge rework (spec 2026-07-14). Surfaces return
 * stage by stage: knowledge bases (Stage D), players (E), the table (F).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/bridge/home", label: "Home" },
  {
    href: "/bridge/org",
    label: "Organization",
    requiresRoles: ["bridge_coach", "bridge_org_admin", "bridge_club_admin", "bridge_program_admin"],
  },
  {
    href: "/bridge/admin/audit",
    label: "Audit",
    requiresRoles: ADMIN_AREA_ROLES,
  },
];

export function navForContext(context: NexusBridgeContext): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.requiresRoles || hasAnyRole(context, item.requiresRoles),
  );
}
