/**
 * The one place that decides which org a request is scoped to. Today it reads
 * the path segment (`/@/:slug`); to move to real subdomains (`laic.nexus.app`)
 * later, only `orgSlugFromLocation` changes — nothing else in the app cares how
 * the slug was resolved.
 */

/** Path prefix that identifies an org portal route. */
export const PORTAL_PREFIX = "/@";

export function portalPath(slug: string): string {
  return `${PORTAL_PREFIX}/${slug}`;
}

/**
 * Resolve the current org slug from the browser location. Path-based for now:
 *   /@/laic            -> "laic"
 *   /@/laic/anything   -> "laic"
 *
 * Subdomain swap (later): return the first hostname label when it isn't a bare
 * host — e.g. `laic.nexus.app` -> "laic". Left commented so the seam is obvious.
 */
export function orgSlugFromLocation(loc: Pick<Location, "pathname"> = window.location): string | null {
  // --- subdomain mode (future) ---
  // const host = window.location.hostname;               // e.g. laic.lvh.me
  // const label = host.split(".")[0];
  // if (label && !["www", "app", "nexus", "localhost"].includes(label)) return label;

  // --- path mode (current) ---
  const parts = loc.pathname.split("/").filter(Boolean); // ["@","laic",...]
  if (parts[0] === "@" && parts[1]) return parts[1];
  return null;
}
