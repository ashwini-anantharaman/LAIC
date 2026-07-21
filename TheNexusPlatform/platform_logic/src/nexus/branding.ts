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
  /** Resolved (absolute) logo URL, ready for <img src>. */
  logo: string | null;
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
  const payload = JSON.stringify(b);
  if (b.orgId) localStorage.setItem(key(b.orgId), payload);
  if (b.slug) localStorage.setItem(key(b.slug), payload);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: b }));
}

/** Subscribe to branding writes (same tab). Returns the unsubscribe. */
export function onBranding(cb: (b: CachedBranding) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<CachedBranding>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
