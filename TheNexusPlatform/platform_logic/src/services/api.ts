import type {
  AllowedIdentifiers,
  AppLaunchContext,
  ApprovalMode,
  AuditEvent,
  AuthUser,
  Entitlement,
  EntitlementStatus,
  ModuleKey,
  DashboardData,
  DeliveryMethod,
  Integration,
  IntegrationPermissionLevel,
  JoinCode,
  JoinCodeKind,
  MeResponse,
  Offering,
  OfferingStatus,
  OfferingType,
  Participant,
  ParticipantType,
  Program,
  ProgramCategory,
  Registration,
  RegisteredApp,
  RegisteredAppWithKey,
  RegistrationStatus,
  SignupField,
  StageKey,
  SignupType,
} from "../types/platform";
import { permissionToApi, type Permission } from "../types/platform";

export interface DraftProgramInput {
  name: string;
  category: ProgramCategory;
  description?: string;
  icon?: string;
  instructor_label?: string;
  learner_label?: string;
  stage_type?: StageKey;
  class_names?: string[];
}

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
    discord_permission_level?: IntegrationPermissionLevel;
    programs?: DraftProgramInput[];
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

export interface InvitationOptions {
  delivery_method?: DeliveryMethod;
  email?: string;
  max_uses?: number;
  expires_at?: string;
}

export async function createJoinCode(
  stageId: string,
  kind: JoinCodeKind,
  opts: InvitationOptions = {}
): Promise<JoinCode> {
  return request<JoinCode>(`/api/platform/stages/${stageId}/join-codes`, {
    method: "POST",
    body: JSON.stringify({ kind, ...opts }),
  });
}

export async function listPrograms(orgId: string): Promise<Program[]> {
  return request<Program[]>(`/api/platform/orgs/${orgId}/programs`);
}

export async function createProgram(orgId: string, program: DraftProgramInput): Promise<Program> {
  return request<Program>(`/api/platform/orgs/${orgId}/programs`, {
    method: "POST",
    body: JSON.stringify(program),
  });
}

export async function createProgramJoinCode(
  programId: string,
  kind: JoinCodeKind = "teacher",
  opts: InvitationOptions = {}
): Promise<JoinCode> {
  return request<JoinCode>(`/api/platform/programs/${programId}/join-codes`, {
    method: "POST",
    body: JSON.stringify({ kind, ...opts }),
  });
}

export async function updateOrgTheme(
  orgId: string,
  theme: { accent_color?: string; logo_url?: string }
): Promise<void> {
  await request(`/api/platform/orgs/${orgId}/theme`, {
    method: "PATCH",
    body: JSON.stringify(theme),
  });
}

export async function listIntegrations(orgId: string): Promise<Integration[]> {
  return request<Integration[]>(`/api/platform/orgs/${orgId}/integrations`);
}

// ── Audit log + Entitlements ─────────────────────────────────────────────────
export async function listAuditEvents(orgId: string, limit = 50): Promise<AuditEvent[]> {
  return request<AuditEvent[]>(`/api/platform/orgs/${orgId}/audit?limit=${limit}`);
}

export async function listEntitlements(orgId: string): Promise<Entitlement[]> {
  return request<Entitlement[]>(`/api/platform/orgs/${orgId}/entitlements`);
}

export async function setEntitlement(orgId: string, module: ModuleKey, status: EntitlementStatus): Promise<Entitlement> {
  return request<Entitlement>(`/api/platform/orgs/${orgId}/entitlements/${module}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

// ── Offerings, Registered Apps, and the Signup Hook (Nexus v0.3) ────────────
export async function listOfferings(programId: string): Promise<Offering[]> {
  return request<Offering[]>(`/api/programs/${programId}/offerings`);
}

export interface CreateOfferingInput {
  name: string;
  offering_type: OfferingType;
  approval_mode: ApprovalMode;
  signup_fields?: SignupField[];
  status?: OfferingStatus;
  description?: string;
  registration_open?: boolean;
}

export async function createOffering(programId: string, payload: CreateOfferingInput): Promise<Offering> {
  return request<Offering>(`/api/programs/${programId}/offerings`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOffering(offeringId: string, patch: Partial<CreateOfferingInput>): Promise<Offering> {
  return request<Offering>(`/api/offerings/${offeringId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function publishOffering(offeringId: string): Promise<Offering> {
  return request<Offering>(`/api/offerings/${offeringId}/publish`, { method: "POST" });
}

export async function closeOffering(offeringId: string): Promise<Offering> {
  return request<Offering>(`/api/offerings/${offeringId}/close`, { method: "POST" });
}

export interface CreateAppInput {
  app_name: string;
  app_slug?: string;
  offering_id?: string;
  allowed_identifiers?: AllowedIdentifiers;
  launch_url?: string;
  launch_context?: Record<string, unknown>;
}

export async function listApps(programId: string): Promise<RegisteredApp[]> {
  return request<RegisteredApp[]>(`/api/programs/${programId}/apps`);
}

export async function createApp(programId: string, payload: CreateAppInput): Promise<RegisteredAppWithKey> {
  return request<RegisteredAppWithKey>(`/api/programs/${programId}/apps`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateApp(appId: string, patch: Partial<CreateAppInput & { status: string }>): Promise<RegisteredApp> {
  return request<RegisteredApp>(`/api/apps/${appId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function rotateAppKey(appId: string): Promise<RegisteredAppWithKey> {
  return request<RegisteredAppWithKey>(`/api/apps/${appId}/rotate-key`, { method: "POST" });
}

export async function revokeApp(appId: string): Promise<RegisteredApp> {
  return request<RegisteredApp>(`/api/apps/${appId}/revoke`, { method: "POST" });
}

export async function getAppLaunchContext(appId: string): Promise<AppLaunchContext> {
  return request<AppLaunchContext>(`/api/apps/${appId}/launch-context`);
}

export async function listParticipants(offeringId: string): Promise<Participant[]> {
  return request<Participant[]>(`/api/offerings/${offeringId}/participants`);
}

export async function listRegistrations(offeringId: string, status?: RegistrationStatus): Promise<Registration[]> {
  const qs = status ? `?status=${status}` : "";
  return request<Registration[]>(`/api/offerings/${offeringId}/registrations${qs}`);
}

export async function approveRegistration(registrationId: string): Promise<Registration> {
  return request<Registration>(`/api/registrations/${registrationId}/approve`, { method: "POST" });
}

export async function rejectRegistration(registrationId: string): Promise<Registration> {
  return request<Registration>(`/api/registrations/${registrationId}/reject`, { method: "POST" });
}

export interface AdminAddRegistrationInput {
  email: string;
  name?: string;
  age?: number;
  phone?: string;
  stage_node_id?: string;
  participant_type?: ParticipantType;
  field_data?: Record<string, unknown>;
}

export async function adminAddRegistration(offeringId: string, payload: AdminAddRegistrationInput): Promise<Registration> {
  return request<Registration>(`/api/offerings/${offeringId}/registrations/admin-add`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
