/**
 * Org branding (accent + logo) — cached and broadcast.
 *
 * The rule this module exists to enforce: the UI never paints a default and
 * then "pops" to the real value, and edits never require a manual refresh.
 *   1. CACHE — last-known branding lives in localStorage (keyed by both org id
 *      and slug), so the shell hydrates synchronously on first render.
 *   2. REVALIDATE — callers still fetch in the background and write back.
 *   3. BROADCAST — every write dispatches a same-tab event; anything rendering
 *      branding subscribes and updates instantly (Settings → sidebar, etc.).
 * The same write/subscribe pattern is the house style for any future shared
 * state that must feel live (names, logos, feature flags…).
 */

export interface CachedBranding {
  orgId?: string | null;
  slug?: string | null;
  accent: string | null;
  /** Resolved (absolute) logo URL, ready for <img src>. Sidebar brand slot. */
  logo: string | null;
  /** Resolved (absolute) favicon URL — the browser tab icon. Falls back to logo. */
  favicon?: string | null;
  /** Display name/title for this level (drives the browser tab + brand slot). */
  title?: string | null;
}

const EVENT = "nexus:branding";
const key = (idOrSlug: string) => `nexus_branding:${idOrSlug}`;

export function readBranding(idOrSlug: string | null | undefined): CachedBranding | null {
  if (!idOrSlug) return null;
  try {
    return JSON.parse(localStorage.getItem(key(idOrSlug)) ?? "null") as CachedBranding | null;
  } catch {
    return null;
  }
}

export function writeBranding(b: CachedBranding): void {
  // Merge with any existing entry so a PARTIAL write (e.g. a theme save that
  // doesn't carry the title, or a rename that doesn't carry the logo) never
  // clobbers a field another surface already set.
  const existing = readBranding(b.orgId) ?? readBranding(b.slug) ?? null;
  const merged: CachedBranding = {
    ...b,
    title: b.title !== undefined ? b.title : existing?.title ?? null,
    favicon: b.favicon !== undefined ? b.favicon : existing?.favicon ?? null,
  };
  const payload = JSON.stringify(merged);
  if (merged.orgId) localStorage.setItem(key(merged.orgId), payload);
  if (merged.slug) localStorage.setItem(key(merged.slug), payload);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: merged }));
}

/** Subscribe to branding writes (same tab). Returns the unsubscribe. */
export function onBranding(cb: (b: CachedBranding) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<CachedBranding>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Drop a cached entry (e.g. a program reverting to its org's branding). */
export function clearBranding(idOrSlug: string | null | undefined): void {
  if (idOrSlug) localStorage.removeItem(key(idOrSlug));
}

/**
 * The org's own sign-in URL (`/@/slug`), or null if we don't know the slug.
 * Used so signing out of an org returns to THAT org's gate, not the Nexus one.
 * The slug is cached whenever the org space loads (portal login or the shell's
 * branding fetch), so by the time a signed-in person can click "Sign out" it's
 * present; callers fall back to the Nexus login when it isn't.
 */
export function orgPortalPath(orgId: string | null | undefined): string | null {
  const slug = orgId ? readBranding(orgId)?.slug : null;
  return slug ? `/@/${slug}` : null;
}
