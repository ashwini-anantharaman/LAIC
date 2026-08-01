import { canAccess, type AccessCatalogue } from "@bridge/access";
import { type NexusBridgeContext } from "@bridge/nexus-client";

export type NavItem = {
  href: string;
  label: string;
  /** The access-catalogue feature key that gates this item (§7). */
  featureKey: string;
};

/**
 * Navigation during the knowledge rework (spec 2026-07-14). Surfaces return
 * stage by stage: knowledge bases (Stage D), players (E), the table (F).
 * Visibility is gated through the access catalogue by feature key — the seeded
 * defaults mirror the historical role sets exactly.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/bridge/home", label: "Home", featureKey: "page.home" },
  { href: "/bridge/table", label: "Play", featureKey: "page.play" },
  { href: "/bridge/players", label: "Players", featureKey: "page.players" },
  { href: "/bridge/library", label: "Library", featureKey: "page.library" },
  { href: "/bridge/guide", label: "Guide", featureKey: "page.guide" },
  { href: "/bridge/kb", label: "Knowledge bases", featureKey: "page.kb" },
  { href: "/bridge/teams", label: "Teams & roles", featureKey: "page.teams" },
  { href: "/bridge/org", label: "Organization", featureKey: "page.org" },
  { href: "/bridge/admin/audit", label: "Audit", featureKey: "page.audit" },
];

export function navForContext(
  catalogue: AccessCatalogue | null | undefined,
  context: NexusBridgeContext,
): NavItem[] {
  return NAV_ITEMS.filter((item) =>
    canAccess(catalogue, item.featureKey, context.roles),
  );
}
