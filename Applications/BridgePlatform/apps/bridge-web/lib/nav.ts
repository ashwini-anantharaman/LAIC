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

/** Core navigation per Bridge plan §7.2. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/bridge/home", label: "Home" },
  { href: "/bridge/play", label: "Play & Practice" },
  { href: "/bridge/players", label: "Players & Configurations" },
  { href: "/bridge/boards", label: "Boards & Deals" },
  { href: "/bridge/progress", label: "Progress" },
  {
    href: "/bridge/admin",
    label: "Admin & Expert Review",
    requiresRoles: ADMIN_AREA_ROLES,
  },
];

export function navForContext(context: NexusBridgeContext): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.requiresRoles || hasAnyRole(context, item.requiresRoles),
  );
}
