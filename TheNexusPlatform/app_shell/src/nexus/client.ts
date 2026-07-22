/**
 * Nexus client for the Studio — real publishing.
 *
 * The Studio signs in as an org admin and publishes configs into the org's
 * space on the Nexus backend (registered_apps.shell_config + immutable
 * publish versions). The session token and per-config app links persist in
 * localStorage so reopening the Studio keeps the connection.
 *
 * Every call goes through the backend under the admin's own session — the
 * Studio never holds database credentials.
 */

export interface NexusSession {
  baseUrl: string;
  token: string;
  email: string;
  displayName: string | null;
}

export interface NexusOrg {
  id: string;
  name: string | null;
  slug: string | null;
  role: string | null;
}

export interface NexusProgram {
  id: string;
  name: string;
}

export interface NexusApp {
  id: string;
  program_id: string | null;
  app_name: string;
  app_slug: string;
  status: string;
}

/** Which registered app a Studio config publishes to. Keyed by config id. */
export interface AppLink {
  appId: string;
  appSlug: string;
  programId: string;
  orgId: string;
}

export const DEFAULT_BASE_URL = "http://localhost:8000";

/* ---- persistence ---- */
const SESSION_KEY = "shell.nexus.session";
const LINKS_KEY = "shell.nexus.appLinks";

export function loadSession(): NexusSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as NexusSession;
    return s && typeof s.token === "string" && typeof s.baseUrl === "string" ? s : null;
  } catch {
    return null;
  }
}
export function saveSession(s: NexusSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function loadLinks(): Record<string, AppLink> {
  try {
    return JSON.parse(localStorage.getItem(LINKS_KEY) ?? "{}") as Record<string, AppLink>;
  } catch {
    return {};
  }
}
export function saveLink(configId: string, link: AppLink): void {
  const links = loadLinks();
  links[configId] = link;
  localStorage.setItem(LINKS_KEY, JSON.stringify(links));
}

/* ---- fetch wrapper ---- */
async function api<T>(
  baseUrl: string,
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  } catch {
    throw new Error(`Can't reach Nexus at ${baseUrl} — is the backend running?`);
  }
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data.detail === "string") detail = data.detail;
      else if (data.detail) detail = JSON.stringify(data.detail);
    } catch {
      /* keep the status code */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

/* ---- auth ---- */
interface AuthResponse {
  id: string;
  email: string;
  display_name: string | null;
  access_token: string;
}

export async function login(baseUrl: string, email: string, password: string): Promise<NexusSession> {
  const r = await api<AuthResponse>(baseUrl, "/api/platform/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return { baseUrl, token: r.access_token, email: r.email, displayName: r.display_name };
}

/** Local-dev quick sign-in (backend allows it only when real auth is off). */
export async function devLoginAs(baseUrl: string, email: string): Promise<NexusSession> {
  const r = await api<AuthResponse>(baseUrl, "/api/platform/dev/login-as", {
    method: "POST",
    body: { email },
  });
  return { baseUrl, token: r.access_token, email: r.email, displayName: r.display_name };
}

/* ---- org space reads ---- */
export function listMyOrgs(s: NexusSession): Promise<NexusOrg[]> {
  return api<NexusOrg[]>(s.baseUrl, "/api/platform/orgs/mine", { token: s.token });
}
export function listPrograms(s: NexusSession, orgId: string): Promise<NexusProgram[]> {
  return api<NexusProgram[]>(s.baseUrl, `/api/platform/orgs/${orgId}/programs`, { token: s.token });
}
export function listApps(s: NexusSession, programId: string): Promise<NexusApp[]> {
  return api<NexusApp[]>(s.baseUrl, `/api/programs/${programId}/apps`, { token: s.token });
}

/* ---- publish path ---- */
export function createApp(s: NexusSession, programId: string, appName: string, appSlug: string): Promise<NexusApp> {
  return api<NexusApp>(s.baseUrl, `/api/programs/${programId}/apps`, {
    method: "POST",
    token: s.token,
    body: { app_name: appName, app_slug: appSlug },
  });
}
export function getAppConfig(s: NexusSession, appId: string): Promise<{ config: Record<string, unknown> }> {
  return api(s.baseUrl, `/api/apps/${appId}/config`, { token: s.token });
}
export function saveAppConfig(s: NexusSession, appId: string, record: Record<string, unknown>): Promise<unknown> {
  return api(s.baseUrl, `/api/apps/${appId}/config`, { method: "PUT", token: s.token, body: record });
}
export function publishVersion(s: NexusSession, appId: string): Promise<{ version: number }> {
  return api(s.baseUrl, `/api/apps/${appId}/publish-version`, { method: "POST", token: s.token });
}

/** Where a published app boots from — public, no auth. */
export function bootConfigUrl(baseUrl: string, appSlug: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/apps/by-slug/${encodeURIComponent(appSlug)}/boot-config`;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "app"
  );
}
