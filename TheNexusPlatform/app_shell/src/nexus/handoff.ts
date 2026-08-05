/**
 * Console → Studio handoff.
 *
 * The Nexus console's App Shell cards open the Studio for ONE app with the
 * org admin's existing session — no second sign-in:
 *
 *   /?nexus=<backend>&nxapp=<appId>&program=<pid>&org=<oid>&slug=<slug>&name=<n>
 *   #nxtoken=<session token>
 *
 * (`nxapp`, not `app` — `?app=` is the Player's short-link parameter.)
 *
 * The token rides in the hash fragment (never sent to any server by the
 * browser). Both are captured ONCE at module load and the URL is scrubbed
 * from history immediately; the scope then persists in sessionStorage so a
 * refresh of the tab stays in the same single-app Studio.
 *
 * A scoped launch means the Studio is that app's studio and nothing else:
 * no presets, no other apps, publish bound to this app.
 */
import { saveSession, type NexusSession } from "./client";

export interface HandoffScope {
  baseUrl: string;
  appId: string;
  appSlug: string;
  programId: string;
  orgId: string;
  appName: string;
}

const SCOPE_KEY = "shell.studio.scope";

/* ---- capture at module load: parse, then scrub the token-bearing URL ---- */
const captured: { scope: HandoffScope; token: string | null } | null = (() => {
  const params = new URLSearchParams(location.search);
  const baseUrl = params.get("nexus");
  const appId = params.get("nxapp");
  if (!baseUrl || !appId) return null;
  const token = new URLSearchParams(location.hash.replace(/^#/, "")).get("nxtoken");
  history.replaceState(null, "", location.pathname);
  const scope: HandoffScope = {
    baseUrl,
    appId,
    appSlug: params.get("slug") ?? "",
    programId: params.get("program") ?? "",
    orgId: params.get("org") ?? "",
    appName: params.get("name") ?? "App",
  };
  sessionStorage.setItem(SCOPE_KEY, JSON.stringify(scope));
  return { scope, token };
})();

/**
 * The app this Studio tab is scoped to, or null for the standalone sandbox.
 * Fresh handoffs win; otherwise the scope survives refreshes via
 * sessionStorage (per-tab — a plain visit to the Studio stays unscoped).
 */
export function studioScope(): HandoffScope | null {
  if (captured) return captured.scope;
  try {
    const raw = sessionStorage.getItem(SCOPE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as HandoffScope;
    return s && typeof s.appId === "string" && typeof s.baseUrl === "string" ? s : null;
  } catch {
    return null;
  }
}

/** Leave single-app mode (used by the scoped Studio's "exit" affordance). */
export function clearStudioScope(): void {
  sessionStorage.removeItem(SCOPE_KEY);
}

/**
 * Adopt the console's session from a fresh handoff: validate the token
 * against /auth/me and persist it. Null when there is no fresh token or it
 * fails validation (an already-saved session may still exist — caller falls
 * back to loadSession()). Memoized: React StrictMode runs effects twice.
 */
export function adoptHandoffSession(): Promise<NexusSession | null> {
  return (pendingAdopt ??= doAdopt());
}
let pendingAdopt: Promise<NexusSession | null> | null = null;

async function doAdopt(): Promise<NexusSession | null> {
  if (!captured || !captured.token) return null;
  const { scope, token } = captured;
  try {
    const res = await fetch(`${scope.baseUrl.replace(/\/+$/, "")}/api/platform/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`auth/me ${res.status}`);
    const me = (await res.json()) as { email: string; display_name: string | null };
    const session: NexusSession = {
      baseUrl: scope.baseUrl,
      token,
      email: me.email,
      displayName: me.display_name,
    };
    saveSession(session);
    return session;
  } catch (err) {
    console.error("Nexus handoff: token validation failed", err);
    return null;
  }
}
