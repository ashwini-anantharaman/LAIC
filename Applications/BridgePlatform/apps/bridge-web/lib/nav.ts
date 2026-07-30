import {
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
   *  capabilities (an admin holds all). This is the source of truth so a custom
   *  role's capabilities — not a coerced pre-built role — decide the nav. */
  requiresCapabilities?: readonly string[];
  /** Governance surfaces (people/roles, catalogue, audit, org) — bridge admins
   *  only. Not represented as a bridge capability. */
  adminOnly?: boolean;
};

// Any knowledge capability opens the knowledge-authoring area.
export const KNOWLEDGE_CAPS = [
  "bridge.knowledge.read",
  "bridge.knowledge.edit",
  "bridge.knowledge.review",
  "bridge.knowledge.approve",
  "bridge.taxonomy.manage",
  "bridge.relationship.manage",
] as const;

/** Page-level guard for the knowledge-authoring area: an admin, or anyone whose
 *  role grants a knowledge capability. Keeps page guards in lockstep with the
 *  capability-gated nav (so a visible tab is never a dead end). */
export function canAccessKnowledge(context: NexusBridgeContext): boolean {
  return context.is_admin === true || hasAnyCapability(context, KNOWLEDGE_CAPS);
}

/**
 * Navigation. General surfaces (Home/Play/Players/Library/Guide) are open to any
 * bridge member. Content surfaces gate on Access-Catalogue capabilities, so a
 * custom role's actual grants decide what shows. Governance surfaces are
 * admin-only.
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
    requiresCapabilities: KNOWLEDGE_CAPS,
  },
  { href: "/bridge/teams", label: "People", adminOnly: true },
  { href: "/bridge/org", label: "Organization", adminOnly: true },
  { href: "/bridge/admin/audit", label: "Audit", adminOnly: true },
];

export function navForContext(context: NexusBridgeContext): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    // Governance tabs: bridge admins only.
    if (item.adminOnly) return context.is_admin === true;
    // Admins see everything else too.
    if (context.is_admin) return true;
    // Capability-gated content: the person's effective capabilities decide.
    if (item.requiresCapabilities) return hasAnyCapability(context, item.requiresCapabilities);
    // Legacy role gate (kept for any pre-built-role surfaces).
    if (item.requiresRoles) return hasAnyRole(context, item.requiresRoles);
    return true;
  });
}
