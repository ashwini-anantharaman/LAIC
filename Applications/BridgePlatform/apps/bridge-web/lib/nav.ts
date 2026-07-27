import {
  ADMIN_AREA_ROLES,
  hasAnyRole,
  hasAnyCapability,
  type NexusBridgeContext,
} from "@bridge/nexus-client";
import type { BridgeRole } from "@laic/learner-contracts";

export type NavItem = {
  href: string;
  label: string;
  /** When set, the item renders only for contexts holding one of these roles. */
  requiresRoles?: readonly BridgeRole[];
  /** Access-Catalogue gating: renders when the context holds one of these
   *  capabilities (an admin holds all). Takes precedence when present. */
  requiresCapabilities?: readonly string[];
};

/**
 * Navigation during the knowledge rework (spec 2026-07-14). Surfaces return
 * stage by stage: knowledge bases (Stage D), players (E), the table (F).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/bridge/home", label: "Home" },
  { href: "/bridge/table", label: "Play" },
  { href: "/bridge/players", label: "Players" },
  { href: "/bridge/library", label: "Library" },
  { href: "/bridge/guide", label: "Guide" },
  {
    href: "/bridge/kb",
    label: "Knowledge bases",
    requiresRoles: ADMIN_AREA_ROLES,
  },
  {
    href: "/bridge/people",
    label: "People",
    requiresRoles: ADMIN_AREA_ROLES,
  },
  {
    href: "/bridge/teams",
    label: "Teams & roles",
    requiresRoles: ADMIN_AREA_ROLES,
  },
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
  // Admins see every tab. Otherwise an item shows when the context satisfies its
  // capability gate (Access Catalogue) if present, else its legacy role gate.
  return NAV_ITEMS.filter((item) => {
    if (context.is_admin) return true;
    if (item.requiresCapabilities) return hasAnyCapability(context, item.requiresCapabilities);
    if (item.requiresRoles) return hasAnyRole(context, item.requiresRoles);
    return true;
  });
}
