import type { AuthUser, DashboardData, JoinCode, JoinCodeKind, MeResponse, SignupType, StageKey } from "../types/platform";
import { permissionToApi, type Permission } from "../types/platform";

import { getApiBaseUrl } from "./apiBase";

const API_URL = getApiBaseUrl();

const TOKEN_KEY = "liac_platform_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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
    const hint = /localhost|127\.0\.0\.1/.test(API_URL)
      ? "Start the backend locally with: cd backend && uvicorn app.main:app --port 8000"
      : "Check that the API is up and reachable.";
    throw new Error(`Could not reach API at ${API_URL || "(same origin)"}. ${hint}`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText || "Request failed" }));
    const detail = err.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ") || "Request failed"
          : "Request failed";
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function signup(params: {
  signup_type: SignupType;
  email: string;
  password: string;
  org_name?: string;
  display_name?: string;
  join_code?: string;
}): Promise<AuthUser> {
  const user = await request<AuthUser>("/api/platform/auth/signup", {
    method: "POST",
    body: JSON.stringify(params),
  });
  setToken(user.access_token);
  return user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const user = await request<AuthUser>("/api/platform/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(user.access_token);
  return user;
}

export async function getMe(): Promise<MeResponse> {
  return request<MeResponse>("/api/platform/auth/me");
}

export async function setupOrg(
  orgId: string,
  payload: {
    has_challenge: boolean;
    challenge_name?: string;
    stage_types: StageKey[];
    permission_defaults: Record<
      string,
      { default_access: string; per_level_overrides?: Record<string, string> }
    >;
    initial_stages: Array<{
      stage_type: StageKey;
      name: string;
      discord_url?: string;
      children?: Array<{ stage_type: StageKey; name: string; discord_url?: string }>;
    }>;
    discord_link?: string;
  }
): Promise<void> {
  await request(`/api/platform/orgs/${orgId}/setup`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getDashboard(orgId?: string, stageId?: string): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (orgId) params.set("org_id", orgId);
  if (stageId) params.set("stage_id", stageId);
  const qs = params.toString();
  return request<DashboardData>(`/api/platform/dashboard${qs ? `?${qs}` : ""}`);
}

export function buildPermissionDefaults(
  adminPerm: Permission,
  teacherPerm: Permission
): Record<string, { default_access: string; per_level_overrides?: Record<string, string> }> {
  return {
    administrator: {
      default_access: permissionToApi(adminPerm),
      per_level_overrides:
        adminPerm === "Per Level"
          ? { national: "edit", state: "edit", chapter: "view" }
          : undefined,
    },
    teacher: {
      default_access: permissionToApi(teacherPerm),
    },
  };
}

export async function createJoinCode(stageId: string, kind: JoinCodeKind): Promise<JoinCode> {
  return request<JoinCode>(`/api/platform/stages/${stageId}/join-codes`, {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}
