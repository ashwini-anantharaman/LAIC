// The one wire between "a request just 401'd" and "sign the user out".
//
// The Nexus session token is a Supabase JWT with a ONE HOUR lifetime, and the
// app has no refresh flow — so any app left open past that holds a dead token
// in memory. Before this, every screen then failed with its own local error
// ("Couldn't open the bridge platform…") until a full app RESTART happened to
// re-run the boot check (tester report 2026-08-08: "works though after
// restarting the app"). Now the first authed request to hit 401 reports here,
// auth-context signs out, and the login screen — the honest state — appears.
//
// A tiny event rather than an import of auth-context: lib/nexus.ts is below
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
