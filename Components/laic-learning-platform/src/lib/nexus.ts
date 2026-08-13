/**
 * Nexus integration seam (mirror of Bridge's, ported to a Vite SPA).
 *
 * Nexus is the single login/identity authority. It "launches" this app with a
 * single-use token in the URL; we exchange it for a Nexus session token, then
 * read the caller's learning role from /learning/context. Bridge held these in
 * httpOnly cookies (Next.js); as a static SPA we keep them in localStorage —
 * weaker, fine for v1 (a serverless fn could restore httpOnly later).
 *
 * All the Nexus endpoints already exist (Quan mirrored them from Bridge):
 *   POST /api/platform/auth/launch-exchange   { launch_token } -> { access_token }
 *   GET  /api/platform/learning/context?program_id=…            -> LearningContext
 *   GET/PUT/DELETE /api/platform/platforms/learning/people…     (People & Roles)
 */
import type { Role } from "./types";
import type { CapabilityCatalogueDocument } from "./accessControlCatalogue";

// Nexus identity/launch lives on the Nexus platform API — not the Content
// Studio Node server (sources/extract/generate). Locally those are different
// ports (8000 vs 8001). Prefer VITE_NEXUS_URL; fall back to VITE_API_BASE_URL
// for deploys that only point at the Nexus backend.
const BASE_URL = (
  import.meta.env.VITE_NEXUS_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  ""
).replace(/\/$/, "");

const TOKEN_KEY = "laic_nexus_token";
const PROGRAM_KEY = "laic_nexus_program";
const RETURN_KEY = "laic_nexus_return";
const MOBILE_KEY = "laic_nexus_mobile";

export interface LearningRole {
  id: string;
  name: string;
  /** Legacy per-area view/edit flags plus the `capabilities` and `typeScopes`
   *  the capability model writes alongside them. */
  perms: Record<string, unknown>;
}

/** What /learning/context returns (the fields we use). */
export interface LearningContext {
  nexusUserId: string;
  laicOrgId: string;
  programId: string;
  appId: string;
  roles: string[];
  accessLevel: string;
  displayName?: string | null;
  program_name?: string | null;
  role_name?: string | null;
  is_admin?: boolean;
  /** The caller's effective learning-catalogue capability ids (screen gating). */
  capabilities?: string[];
  /** The person's assigned custom Learning role (null for admins / unassigned). */
  learning_role?: { role_id: string; role_name: string | null; perms: Record<string, 'view' | 'edit'> & { capabilities?: string[] } } | null;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
/** Swap the active session token (used by centralized "Test as"). */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function getProgramId(): string | null {
  return localStorage.getItem(PROGRAM_KEY);
}
// The launched person's org id, cached from the learning context — needed by the
// centralized dev-login ("Test as") the same way the console passes it.
let _orgId: string | null = null;
export function getOrgId(): string | null {
  return _orgId;
}
function getReturnUrl(): string | null {
  return localStorage.getItem(RETURN_KEY);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * If the URL carries a launch (Nexus → here), exchange the single-use token for
 * a Nexus session and persist it. Runs once before the gate. Returns true when
 * a launch was consumed (so the caller knows to re-read context).
 */
export async function consumeLaunchFromUrl(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const launchToken = params.get("launch_token");
  if (!launchToken) return false;

  const programId = params.get("program_id");
  const returnUrl = params.get("return_url");
  const mobileUi = params.get("mobile") === "1" || params.get("ui") === "mobile";
  // Strip the launch params from the address bar regardless of outcome.
  const clean = window.location.pathname + window.location.hash;

  try {
    const res = await fetch(`${BASE_URL}/api/platform/auth/launch-exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ launch_token: launchToken }),
    });
    if (!res.ok) throw new Error(`exchange failed (${res.status})`);
    const { access_token } = (await res.json()) as { access_token: string };
    localStorage.setItem(TOKEN_KEY, access_token);
    if (programId && UUID.test(programId)) localStorage.setItem(PROGRAM_KEY, programId);
    if (returnUrl && /^https?:\/\//i.test(returnUrl)) localStorage.setItem(RETURN_KEY, returnUrl);
    if (mobileUi) localStorage.setItem(MOBILE_KEY, "1");
    else localStorage.removeItem(MOBILE_KEY);
    window.history.replaceState({}, "", clean);
    return true;
  } catch (e) {
    window.history.replaceState({}, "", clean);
    console.warn("[nexus] launch exchange failed:", e);
    return false;
  }
}

/** True when Content Studio was launched from the Nexus mobile org app. */
export function isNexusMobileShell(): boolean {
  return localStorage.getItem(MOBILE_KEY) === "1";
}

/** Authenticated fetch against Nexus with the stored session token. */
export async function nexusFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

/** Fetch the caller's learning context, or null if not signed in / no access. */
export async function fetchLearningContext(): Promise<LearningContext | null> {
  if (!getToken()) return null;
  const pid = getProgramId();
  const qs = pid ? `?program_id=${encodeURIComponent(pid)}` : "";
  try {
    const res = await nexusFetch(`/api/platform/learning/context${qs}`);
    if (!res.ok) return null;
    const ctx = (await res.json()) as LearningContext;
    _orgId = ctx.laicOrgId ?? null;
    return ctx;
  } catch {
    return null;
  }
}

/** The Nexus access level → the app's Role union (identical string set for the
 * four levels Nexus emits; the others are assignment-only). */
export function contextToRole(ctx: LearningContext): Role {
  const known: Role[] = ["administrator", "content-developer", "course-reviewer", "object-reviewer", "coach", "student"];
  const fromRoles = ctx.roles.find((r): r is Role => (known as string[]).includes(r));
  if (fromRoles) return fromRoles;
  if ((known as string[]).includes(ctx.accessLevel)) return ctx.accessLevel as Role;
  return "student";
}

/** Clear the session and return to the org's own sign-in (or a neutral page). */
export function signOutToNexus(): void {
  const ret = getReturnUrl();
  const mobile = isNexusMobileShell();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROGRAM_KEY);
  localStorage.removeItem(RETURN_KEY);
  localStorage.removeItem(MOBILE_KEY);
  try {
    if (ret) {
      const u = new URL(ret);
      // Mobile org app has no /login — send people back to the program/home
      // surface (their mobile session is separate and still valid).
      if (
        mobile
        || u.pathname.startsWith("/p/")
        || u.pathname.startsWith("/@/")
        || u.pathname === "/home"
      ) {
        window.location.assign(ret);
        return;
      }
      window.location.assign(`${u.origin}/login`);
      return;
    }
  } catch {
    /* fall through */
  }
  window.location.reload();
}

/** Navigate back to the launching Nexus program (keeps the session). */
export function backToNexus(): void {
  const ret = getReturnUrl();
  if (ret) window.location.assign(ret);
}
export function hasReturnUrl(): boolean {
  return !!getReturnUrl();
}

// ── Custom Learning roles (People tab) ──────────────────────────────────────
export interface RosterPerson {
  email: string;
  display_name: string | null;
  status: string;
  role_id: string | null;
  role_name: string | null;
  is_admin: boolean;
  membership_id: string | null;
  invitation_id: string | null;
}

function pid(): string {
  return getProgramId() ?? '';
}

export async function listLearningRoles(): Promise<LearningRole[]> {
  const res = await nexusFetch(`/api/platform/learning/roles?program_id=${encodeURIComponent(pid())}`);
  if (!res.ok) return [];
  return (await res.json()) as LearningRole[];
}
export async function createLearningRole(
  name: string,
  perms: Record<string, 'view' | 'edit'>,
  capabilities?: string[],
  typeScopes?: Record<string, string[]>,
): Promise<LearningRole> {
  const res = await nexusFetch('/api/platform/learning/roles', {
    method: 'POST',
    body: JSON.stringify({ program_id: pid(), name, perms, capabilities, type_scopes: typeScopes }),
  });
  if (!res.ok) throw new Error(`Create role failed (${res.status})`);
  return (await res.json()) as LearningRole;
}
export async function updateLearningRole(id: string, patch: { name?: string; perms?: Record<string, 'view' | 'edit'>; capabilities?: string[]; typeScopes?: Record<string, string[]> }): Promise<void> {
  const { typeScopes, ...rest } = patch;
  const res = await nexusFetch(`/api/platform/learning/roles/${id}?program_id=${encodeURIComponent(pid())}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...rest, type_scopes: typeScopes }),
  });
  if (!res.ok) throw new Error(`Update role failed (${res.status})`);
}

// ── Shared learning catalogue (the app's inventory of surfaces + capabilities) ──
export async function fetchLearningCatalogue(): Promise<CapabilityCatalogueDocument> {
  const res = await nexusFetch(`/api/platform/learning/catalogue?program_id=${encodeURIComponent(pid())}`);
  if (!res.ok) throw new Error(`Fetch catalogue failed (${res.status})`);
  return (await res.json()) as CapabilityCatalogueDocument;
}
export async function putLearningCatalogue(doc: CapabilityCatalogueDocument): Promise<CapabilityCatalogueDocument> {
  const res = await nexusFetch(`/api/platform/learning/catalogue?program_id=${encodeURIComponent(pid())}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error(`Save catalogue failed (${res.status})`);
  return (await res.json()) as CapabilityCatalogueDocument;
}
export async function resetLearningCatalogue(): Promise<CapabilityCatalogueDocument> {
  const res = await nexusFetch(`/api/platform/learning/catalogue?program_id=${encodeURIComponent(pid())}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Reset catalogue failed (${res.status})`);
  return (await res.json()) as CapabilityCatalogueDocument;
}
export async function deleteLearningRole(id: string): Promise<void> {
  const res = await nexusFetch(`/api/platform/learning/roles/${id}?program_id=${encodeURIComponent(pid())}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete role failed (${res.status})`);
}
export async function listLearningRoster(): Promise<RosterPerson[]> {
  const res = await nexusFetch(`/api/platform/learning/roster?program_id=${encodeURIComponent(pid())}`);
  if (!res.ok) return [];
  return (await res.json()) as RosterPerson[];
}
export async function assignLearningRole(email: string, roleId: string | null): Promise<void> {
  const res = await nexusFetch('/api/platform/learning/assign', {
    method: 'PUT',
    body: JSON.stringify({ program_id: pid(), email, role_id: roleId }),
  });
  if (!res.ok) throw new Error(`Assign failed (${res.status})`);
}

/**
 * Invite a person via the true Nexus link flow: creates a PENDING invitation and
 * returns an activation link. The person opens it at the org portal, sets their
 * OWN password, and accepts — then they're a program member. The learning role
 * (if any) is pre-assigned email-keyed and applies on acceptance.
 */
export async function inviteLearningPerson(input: { email: string; display_name?: string; role_id?: string | null }): Promise<{ redeem_url: string }> {
  const res = await nexusFetch(`/api/programs/${encodeURIComponent(pid())}/invite`, {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      display_name: input.display_name,
      platform: 'learning',
      role_id: input.role_id || undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err?.detail === 'string' ? err.detail : `Invite failed (${res.status})`);
  }
  return (await res.json()) as { redeem_url: string };
}

/**
 * Centralized "Test as" — the same dev-login the console uses. Swaps the session
 * to that person (reflected at the Nexus level) and reloads so the app re-enters
 * with their resolved learning role. Throws if dev-login isn't enabled.
 */
export async function testAsPerson(email: string): Promise<void> {
  const res = await nexusFetch('/api/platform/dev/login-as', {
    method: 'POST',
    body: JSON.stringify({ email, org_id: getOrgId() ?? undefined }),
  });
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Test login is not enabled on this environment' : `Test login failed (${res.status})`);
  }
  const { access_token } = (await res.json()) as { access_token: string };
  setToken(access_token);
  window.location.reload();
}
