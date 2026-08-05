/**
 * Nexus session token captured by the launch handoff (app/nexus/launch).
 * In http mode this is the preferred credential: it works with Nexus's dev
 * demo-auth today and carries a Supabase JWT unchanged once shared auth lands.
 * Standalone module (no Next/React imports) so route handlers and tests can
 * import it without pulling the server-component world.
 */
export const NEXUS_TOKEN_COOKIE = "bridge_nexus_token";

/**
 * Where "Back to Nexus" goes: the console's program page, passed by Nexus as
 * `return_url` in the launch handoff. Only http(s) URLs are ever stored.
 */
export const NEXUS_RETURN_COOKIE = "bridge_nexus_return";

/** Validate a return_url candidate: absolute http(s) only, else null. */
export function safeReturnUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The Nexus program this session was launched from — scopes /bridge/context
 * (and People & Roles) to that program instead of "any program that grants
 * bridge", which matters for people in several programs.
 */
export const NEXUS_PROGRAM_COOKIE = "bridge_nexus_program";

/** Validate a program id candidate: uuid only, else null. */
export function safeProgramId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}

/**
 * Set when Bridge was launched EMBEDDED inside a host app (the mobile App
 * Shell iframe passes `?embedded=1`). The host owns the session and its own
 * exit control, so Bridge hides its own "Sign out" to avoid a confusing
 * half-signed-out state.
 */
export const NEXUS_EMBEDDED_COOKIE = "bridge_nexus_embedded";
