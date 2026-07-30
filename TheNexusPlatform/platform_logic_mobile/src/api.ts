import { getApiBaseUrl } from "./apiBase";

const API_URL = getApiBaseUrl();
const TOKEN_KEY = "nexus_mobile_token";
const ORG_KEY = "nexus_mobile_org";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
export function getActiveOrgId(): string | null {
  return localStorage.getItem(ORG_KEY);
}
export function setActiveOrgId(id: string | null): void {
  if (id) localStorage.setItem(ORG_KEY, id);
  else localStorage.removeItem(ORG_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(`Could not reach API. Is Nexus running on :8000?`);
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || body.message || detail;
    } catch { /* ignore */ }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface AuthUser {
  access_token: string;
  email?: string;
  display_name?: string | null;
  participant_only?: boolean;
}

export interface MembershipSummary {
  org_id: string;
  org_name?: string | null;
  org_slug?: string | null;
  role: string;
  program_id: string | null;
  program_name?: string | null;
}

export interface MeResponse {
  id: string;
  email: string;
  display_name?: string | null;
  role: string;
  memberships: MembershipSummary[];
  nexus_role?: string | null;
}

export interface OrgBranding {
  id: string;
  name: string;
  slug: string;
  theme_accent_color: string | null;
  theme_logo_url: string | null;
  theme_favicon_url?: string | null;
}

export interface Program {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  icon?: string | null;
  status?: string | null;
}

export interface DevPersonaEntry {
  email: string;
  display_name: string | null;
  role: string;
  program_id: string | null;
  kind: "member" | "invite";
}

export interface LpLaunch {
  launch_token: string;
  launch_url: string | null;
  context: {
    organization_id: string;
    program_id: string;
    program_name: string;
    role: string;
  };
}

export async function login(email: string, password: string, orgSlug?: string): Promise<AuthUser> {
  const user = await request<AuthUser>("/api/platform/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, ...(orgSlug ? { org_slug: orgSlug } : {}) }),
  });
  if (user.participant_only) {
    throw new Error("This sign-in is for organization staff. Students use their program's app.");
  }
  setToken(user.access_token);
  return user;
}

export async function getMe(): Promise<MeResponse> {
  return request<MeResponse>("/api/platform/auth/me");
}

export async function getOrgBySlug(slug: string): Promise<OrgBranding> {
  return request<OrgBranding>(`/api/platform/orgs/by-slug/${encodeURIComponent(slug)}`);
}

export async function listPrograms(orgId: string): Promise<Program[]> {
  return request<Program[]>(`/api/platform/orgs/${orgId}/programs`);
}

export async function getDevPersonas(slug: string) {
  return request<{ org: { id: string; name: string; slug: string }; personas: DevPersonaEntry[] }>(
    `/api/platform/dev/personas?org_slug=${encodeURIComponent(slug)}`,
  );
}

export async function devLoginAs(email: string, slug: string): Promise<AuthUser> {
  const user = await request<AuthUser>("/api/platform/dev/login-as", {
    method: "POST",
    body: JSON.stringify({ email, org_slug: slug }),
  });
  setToken(user.access_token);
  return user;
}

export async function launchLearningPlatform(programId: string): Promise<LpLaunch> {
  return request<LpLaunch>(`/api/programs/${programId}/learning-platform/launch`, { method: "POST" });
}
