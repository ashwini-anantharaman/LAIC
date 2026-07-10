import { getApiBaseUrl } from "./apiBase";

const API_URL = getApiBaseUrl();
const TOKEN_KEY = "liac_auth_token";
const USER_KEY = "liac_auth_user";

export interface PlatformUser {
  id: string;
  email: string;
  display_name?: string;
  role: string;
  access_token: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug?: string;
  role?: string;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): PlatformUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformUser;
  } catch {
    return null;
  }
}

export function setAuthSession(user: PlatformUser): void {
  localStorage.setItem(TOKEN_KEY, user.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function platformRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : "Request failed");
  }
  return res.json() as Promise<T>;
}

export async function exchangeLaunchToken(launchToken: string): Promise<PlatformUser> {
  // A one-time launch token minted by the Nexus platform (?lt= query param on
  // launch) is swapped for a real session; the raw session token never
  // appears in the URL.
  const { access_token } = await platformRequest<{ access_token: string }>(
    "/api/platform/auth/launch-exchange",
    { method: "POST", body: JSON.stringify({ launch_token: launchToken }) },
  );
  localStorage.setItem(TOKEN_KEY, access_token);
  const me = await platformRequest<{ id: string; email: string; display_name?: string; role: string }>(
    "/api/platform/auth/me",
  );
  const user: PlatformUser = {
    id: me.id,
    email: me.email,
    display_name: me.display_name,
    role: me.role,
    access_token,
  };
  setAuthSession(user);
  return user;
}

export async function platformSignIn(email: string, password: string): Promise<PlatformUser> {
  const user = await platformRequest<PlatformUser>("/api/platform/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAuthSession(user);
  return user;
}

export async function platformSignUp(
  email: string,
  password: string,
  signupType: "student" | "teacher" | "administrator" = "student",
  joinCode?: string,
): Promise<PlatformUser> {
  const user = await platformRequest<PlatformUser>("/api/platform/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      signup_type: signupType,
      email,
      password,
      join_code: joinCode,
    }),
  });
  setAuthSession(user);
  return user;
}

export async function validateJoinCode(code: string): Promise<{
  id: string;
  code: string;
  kind: string;
  org_id: string;
  stage_node_id: string;
  stage_name: string;
  org_name: string;
}> {
  return platformRequest(`/api/platform/join-codes/${encodeURIComponent(code.trim().toUpperCase())}`);
}

export async function registerWithJoinCode(
  code: string,
  displayName?: string,
): Promise<{ ok: boolean; registration_id: string; org_id: string }> {
  return platformRequest(`/api/platform/join-codes/${encodeURIComponent(code.trim().toUpperCase())}/register`, {
    method: "POST",
    body: JSON.stringify({ display_name: displayName }),
  });
}

export async function listMyOrgs(): Promise<OrgSummary[]> {
  return platformRequest<OrgSummary[]>("/api/platform/orgs/mine");
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
