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

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

const TOKEN_KEY = "laic_nexus_token";
const PROGRAM_KEY = "laic_nexus_program";
const RETURN_KEY = "laic_nexus_return";

export interface LearningRole {
  id: string;
  name: string;
  perms: Record<string, 'view' | 'edit'>;
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
  /** The person's assigned custom Learning role (null for admins / unassigned). */
  learning_role?: { role_id: string; role_name: string | null; perms: Record<string, 'view' | 'edit'> } | null;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getProgramId(): string | null {
  return localStorage.getItem(PROGRAM_KEY);
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
    window.history.replaceState({}, "", clean);
    return true;
  } catch (e) {
    window.history.replaceState({}, "", clean);
    console.warn("[nexus] launch exchange failed:", e);
    return false;
  }
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
    return (await res.json()) as LearningContext;
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
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROGRAM_KEY);
  localStorage.removeItem(RETURN_KEY);
  try {
    if (ret) {
      window.location.assign(`${new URL(ret).origin}/login`);
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
export async function createLearningRole(name: string, perms: Record<string, 'view' | 'edit'>): Promise<LearningRole> {
  const res = await nexusFetch('/api/platform/learning/roles', {
    method: 'POST',
    body: JSON.stringify({ program_id: pid(), name, perms }),
  });
  if (!res.ok) throw new Error(`Create role failed (${res.status})`);
  return (await res.json()) as LearningRole;
}
export async function updateLearningRole(id: string, patch: { name?: string; perms?: Record<string, 'view' | 'edit'> }): Promise<void> {
  const res = await nexusFetch(`/api/platform/learning/roles/${id}?program_id=${encodeURIComponent(pid())}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update role failed (${res.status})`);
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
