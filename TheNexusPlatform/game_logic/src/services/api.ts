import type { MeResponse, Scenario } from "../types/game";
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
      ? "Start the backend locally with: cd backend-ts && npm run dev"
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

export async function getMe(): Promise<MeResponse> {
  return request<MeResponse>("/api/platform/auth/me");
}

export async function exchangeLaunchToken(launchToken: string): Promise<{ access_token: string }> {
  return request<{ access_token: string }>("/api/platform/auth/launch-exchange", {
    method: "POST",
    body: JSON.stringify({ launch_token: launchToken }),
  });
}

export async function generateScenario(params: {
  program_id: string;
  game_type: string;
  prompt: string;
}): Promise<Scenario> {
  return request<Scenario>("/api/game/scenarios", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getScenario(id: string): Promise<Scenario> {
  return request<Scenario>(`/api/game/scenarios/${id}`);
}

export async function listScenarios(programId: string): Promise<Scenario[]> {
  return request<Scenario[]>(`/api/game/scenarios?program_id=${encodeURIComponent(programId)}`);
}
