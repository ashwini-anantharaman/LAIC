// The two wires between the request layer and auth-context: "a request just
// 401'd" → try a refresh, then "the session is really dead" → sign out.
//
// The Nexus session token is a Supabase JWT with a ONE HOUR lifetime. The app
// now holds a refresh token alongside it (when the backend mints one), so a
// token-bearing 401 first asks auth-context for a refreshed token and retries
// once; only when there is no refresh flow or the refresh fails does the
// sign-out fire. Before the refresh flow existed, every screen failed with its
// own local error until a full app RESTART (tester report 2026-08-08).
//
// Tiny events rather than imports of auth-context: lib/nexus.ts is below
// auth-context in the dependency graph and must stay importable from anywhere.

let handler: (() => void) | null = null;

/** auth-context registers its sign-out here; null to unregister. */
export function onSessionExpired(h: (() => void) | null): void {
  handler = h;
}

/** Called by the request layer when a TOKEN-BEARING call returns 401. */
export function reportSessionExpired(): void {
  handler?.();
}

let refreshHandler: (() => Promise<string | null>) | null = null;

/** auth-context registers its single-flight refresh here; null to unregister.
 *  The handler resolves to a fresh access token, or null when there is no
 *  refresh flow / the refresh failed (the caller then reports expiry). */
export function onSessionRefresh(h: (() => Promise<string | null>) | null): void {
  refreshHandler = h;
}

/** Ask auth-context for a refreshed access token. Null = can't. */
export function requestSessionRefresh(): Promise<string | null> {
  return refreshHandler ? refreshHandler() : Promise.resolve(null);
}
