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
  Group,
  GroupMember,
  Invitation,
  OrgMember,
  OrgRelationship,
  Participant,
  ParticipantType,
  ProgramAffiliation,
  ProgramOrgAffiliation,
  AffiliatedProgram,
  AffiliatedProgramDetail,
  PlatformModule,
  Program,
  ProgramCategory,
  ProgramFeatures,
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
  secondary_categories?: string[];
  description?: string;
  icon?: string;
  instructor_label?: string;
  learner_label?: string;
  features?: ProgramFeatures;
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

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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

/**
 * Sign in. Pass `orgSlug` when logging in through an org portal — the backend
 * then scopes the session to that org (403 if the person has no account there,
 * and operators can never enter through an org's door).
 */
export async function login(email: string, password: string, orgSlug?: string): Promise<AuthUser> {
  const user = await request<AuthUser>("/api/platform/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, ...(orgSlug ? { org_slug: orgSlug } : {}) }),
  });
  // Students (participant-only sessions) never enter this console — their
  // world is the program's app. Refuse before the token is ever stored.
  if (user.participant_only) {
    throw new Error("This sign-in is for organization staff. Students sign in through their program's app.");
  }
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

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  return request<OrgMember[]>(`/api/platform/orgs/${orgId}/members`);
}

/** A single program, readable by any member of it (unlike the org-wide list,
 *  which requires org-level staff). The workspace shell uses this so a program-
 *  scoped person — e.g. a partner admin — can load its program (incl is_partner). */
export async function getProgram(programId: string): Promise<Program> {
  return request<Program>(`/api/programs/${programId}`);
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  status?: string;
  organization_type?: string;
  created_at?: string;
}

/** Platform-admin only: every organization on the platform. */
export async function listAllOrganizations(): Promise<OrgSummary[]> {
  return request<OrgSummary[]>("/api/platform/admin/organizations");
}

/** Operator: create an organization record (minimal; boundary governance added in Phase 3). */
export async function createOrganization(name: string): Promise<OrgSummary> {
  return request<OrgSummary>("/api/platform/orgs", { method: "POST", body: JSON.stringify({ name }) });
}

/** Operator: is a URL slug free? Returns the normalized slug the URL would use. */
export async function checkOrgSlug(slug: string): Promise<{ slug: string; available: boolean }> {
  return request<{ slug: string; available: boolean }>(`/api/platform/orgs/slug-available/${encodeURIComponent(slug)}`);
}

export interface ProvisionedAdmin {
  email: string;
  role: string;
  /** True if a brand-new account was created for them (temp_password is set). */
  created: boolean;
  temp_password: string | null;
}

export interface ProvisionResult {
  organization: { id: string; name: string; slug: string; status: string };
  admins: ProvisionedAdmin[];
}

/**
 * Operator: the full provisioning event — org + isolation boundary + default
 * entitlements + an ACTIVE membership per named administrator (first = owner).
 * No activation link: each admin is a member immediately, new accounts get a
 * temporary password to hand off.
 */
export async function provisionOrganization(
  name: string,
  admins: { email: string; display_name?: string }[],
  slug?: string,
): Promise<ProvisionResult> {
  return request<ProvisionResult>("/api/platform/admin/organizations", {
    method: "POST",
    body: JSON.stringify({ name, admins, slug }),
  });
}

// ── Per-program custom roles (§3.5 Team & Roles) ────────────────────────────
// Learning grants a single "administrator" level; bridge grants one of the
// pre-built Bridge roles (bridge_*); other areas keep view/edit/comment.
export type AccessLevel = "view" | "edit" | "comment" | "administrator";
export type RoleArea = "learning" | "bridge" | "appbuilder" | "community" | "teams" | "partners";
/** A grant value: a graded level, or an exact pre-built platform role key. */
export type PermValue = AccessLevel | (string & {});
export type RolePerms = Partial<Record<RoleArea, PermValue>>;

export interface ProgramRole {
  id: string;
  organization_id: string;
  program_id: string;
  name: string;
  perms: RolePerms;
  /** Discord-style: when true, this role also acts as a group. */
  display_as_group?: boolean;
  /** Optional parent group — lets a role nest in the hierarchy. */
  parent_group_id?: string | null;
  created_at?: string;
}

export async function listProgramRoles(programId: string): Promise<ProgramRole[]> {
  return request<ProgramRole[]>(`/api/programs/${programId}/roles`);
}
export async function createProgramRole(
  programId: string,
  payload: { name: string; perms: RolePerms; display_as_group?: boolean; parent_group_id?: string | null; capabilities?: string[] },
): Promise<ProgramRole> {
  return request<ProgramRole>(`/api/programs/${programId}/roles`, { method: "POST", body: JSON.stringify(payload) });
}
export async function updateProgramRole(
  roleId: string,
  patch: { name?: string; perms?: RolePerms; display_as_group?: boolean; parent_group_id?: string | null; capabilities?: string[] },
): Promise<ProgramRole> {
  return request<ProgramRole>(`/api/roles/${roleId}`, { method: "PATCH", body: JSON.stringify(patch) });
}
export async function deleteProgramRole(roleId: string): Promise<void> {
  await request(`/api/roles/${roleId}`, { method: "DELETE" });
}

// ── Groups vs Roles: the People-tab groups model + placement ────────────────
// One shape at every altitude (program / org / nexus).
export interface GroupsModel {
  groups: { id: string; name: string; label: string | null; parent_id: string | null }[];
  roles: { id: string; name: string; display_as_group: boolean; parent_group_id?: string | null }[];
  /** email (lowercased) → explicit group ids they're placed in. */
  placements: Record<string, string[]>;
}
export type ProgramGroupsModel = GroupsModel;

export async function getProgramGroupsModel(programId: string): Promise<GroupsModel> {
  return request<GroupsModel>(`/api/programs/${programId}/groups-model`);
}
export async function setProgramMemberGroups(programId: string, email: string, groupIds: string[]): Promise<void> {
  await request(`/api/programs/${programId}/members/groups`, {
    method: "PUT",
    body: JSON.stringify({ email, group_ids: groupIds }),
  });
}

// Org-level groups model + placement (org groups = program_id null; reuse the
// existing group CRUD with no program_id).
export async function getOrgGroupsModel(orgId: string): Promise<GroupsModel> {
  return request<GroupsModel>(`/api/platform/orgs/${orgId}/groups-model`);
}
export async function setOrgMemberGroups(orgId: string, email: string, groupIds: string[]): Promise<void> {
  await request(`/api/platform/orgs/${orgId}/team/groups`, {
    method: "PUT",
    body: JSON.stringify({ email, group_ids: groupIds }),
  });
}

// Nexus-level groups (platform scope; org_id null). Operator-only.
export async function getNexusGroupsModel(): Promise<GroupsModel> {
  return request<GroupsModel>(`/api/platform/admin/nexus/groups-model`);
}
export async function createNexusGroup(payload: { name: string; label?: string | null; parent_group_id?: string | null }): Promise<Group> {
  return request<Group>(`/api/platform/admin/nexus/groups`, { method: "POST", body: JSON.stringify(payload) });
}
export async function updateNexusGroup(groupId: string, patch: { name?: string; label?: string | null; parent_group_id?: string | null }): Promise<Group> {
  return request<Group>(`/api/platform/admin/nexus/groups/${groupId}`, { method: "PATCH", body: JSON.stringify(patch) });
}
export async function deleteNexusGroup(groupId: string): Promise<void> {
  await request(`/api/platform/admin/nexus/groups/${groupId}`, { method: "DELETE" });
}
export async function setNexusMemberGroups(email: string, groupIds: string[]): Promise<void> {
  await request(`/api/platform/admin/nexus/team/groups`, {
    method: "PUT",
    body: JSON.stringify({ email, group_ids: groupIds }),
  });
}

// ── Dev-only test login (local only; backend gates it) ──────────────────────
export interface DevPersonaEntry {
  email: string;
  display_name: string | null;
  role: string;
  program_id: string | null;
  kind: "member" | "invite";
}

export async function getDevPersonas(
  org: { slug?: string; id?: string },
): Promise<{ org: { id: string; name: string; slug: string }; personas: DevPersonaEntry[] }> {
  const qs = org.id ? `org_id=${encodeURIComponent(org.id)}` : `org_slug=${encodeURIComponent(org.slug ?? "")}`;
  return request(`/api/platform/dev/personas?${qs}`);
}

/** Become a real member/admin (dev only). Auto-activates a pending invitee. */
export async function devLoginAs(email: string, org?: { slug?: string; id?: string }): Promise<AuthUser> {
  const user = await request<AuthUser>("/api/platform/dev/login-as", {
    method: "POST",
    body: JSON.stringify({ email, org_slug: org?.slug, org_id: org?.id }),
  });
  setToken(user.access_token);
  return user;
}

export interface OrgBranding {
  id: string;
  name: string;
  slug: string;
  theme_accent_color: string | null;
  theme_logo_url: string | null;
  theme_favicon_url?: string | null;
}

/** Orgs the signed-in user belongs to (id/name/slug/role). */
export async function listMyOrgs(): Promise<{ id: string; name: string; slug: string; role: string }[]> {
  return request(`/api/platform/orgs/mine`);
}

/** Public: an org's branding subset, for rendering its login portal pre-auth. */
export async function getOrgBySlug(slug: string): Promise<OrgBranding> {
  return request<OrgBranding>(`/api/platform/orgs/by-slug/${encodeURIComponent(slug)}`);
}

// ── Slice 11: org graph ─────────────────────────────────────────────────────
export async function createInvitation(
  orgId: string,
  payload: { email?: string; display_name?: string; role: string; program_id?: string; offering_id?: string; group_id?: string; expires_at?: string },
): Promise<Invitation> {
  return request<Invitation>(`/api/platform/orgs/${orgId}/invitations`, { method: "POST", body: JSON.stringify(payload) });
}

/** Pending invitations for an org — makes an invite visible before anyone accepts. */
export async function listOrgInvitations(orgId: string): Promise<Invitation[]> {
  return request<Invitation[]>(`/api/platform/orgs/${orgId}/invitations`);
}

export async function listGroups(orgId: string, programId?: string): Promise<Group[]> {
  const qs = programId ? `?program_id=${programId}` : "";
  return request<Group[]>(`/api/platform/orgs/${orgId}/groups${qs}`);
}
export async function createGroup(
  orgId: string,
  payload: { program_id?: string; offering_id?: string; name: string; label?: string; parent_group_id?: string | null },
): Promise<Group> {
  return request<Group>(`/api/platform/orgs/${orgId}/groups`, { method: "POST", body: JSON.stringify(payload) });
}
export async function updateGroup(
  groupId: string,
  patch: { name?: string; parent_group_id?: string | null },
): Promise<Group> {
  return request<Group>(`/api/platform/groups/${groupId}`, { method: "PATCH", body: JSON.stringify(patch) });
}
export async function deleteGroup(groupId: string): Promise<void> {
  await request(`/api/platform/groups/${groupId}`, { method: "DELETE" });
}
export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  return request<GroupMember[]>(`/api/platform/groups/${groupId}/members`);
}
export async function coachAddToGroup(
  groupId: string,
  payload: { email?: string; name?: string; offering_id?: string; participant_type?: string },
): Promise<{ id: string }> {
  return request(`/api/groups/${groupId}/participants/coach-add`, { method: "POST", body: JSON.stringify(payload) });
}

export interface SelectableOrg { id: string; name?: string; slug?: string }
export async function listSelectableOrgs(): Promise<SelectableOrg[]> {
  return request<SelectableOrg[]>(`/api/platform/orgs/selectable`);
}

// Peek an invitation by its raw token (no auth required — the invitee isn't a
// member yet). Returns 404 if the token is unknown.
export async function getInvitation(token: string): Promise<Invitation> {
  return request<Invitation>(`/api/platform/invitations/${encodeURIComponent(token)}`);
}
// Accept an invitation as the currently signed-in user (must be authenticated).
export async function acceptInvitation(token: string, displayName?: string): Promise<Invitation> {
  return request<Invitation>(`/api/platform/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST", body: JSON.stringify({ display_name: displayName ?? null }),
  });
}

export async function listProgramAffiliations(programId: string): Promise<ProgramAffiliation[]> {
  return request<ProgramAffiliation[]>(`/api/platform/programs/${programId}/affiliations`);
}
export async function createProgramAffiliation(
  programId: string,
  payload: { subject_type: string; subject_id: string; affiliation_type: string; represented_organization_id?: string },
): Promise<ProgramAffiliation> {
  return request<ProgramAffiliation>(`/api/platform/programs/${programId}/affiliations`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateProgramAffiliation(id: string, status: string): Promise<ProgramAffiliation> {
  return request<ProgramAffiliation>(`/api/platform/affiliations/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

// ── Program ↔ organization affiliations (invite / accept between orgs) ──────
export async function listProgramOrgAffiliations(programId: string): Promise<ProgramOrgAffiliation[]> {
  return request<ProgramOrgAffiliation[]>(`/api/platform/programs/${programId}/org-affiliations`);
}
export async function createProgramOrgAffiliation(
  programId: string,
  payload: { organization_id: string; affiliation_type: string; tenant_access_mode?: string },
): Promise<ProgramOrgAffiliation> {
  return request<ProgramOrgAffiliation>(`/api/platform/programs/${programId}/org-affiliations`, { method: "POST", body: JSON.stringify(payload) });
}
export async function updateProgramOrgAffiliation(id: string, status: string): Promise<ProgramOrgAffiliation> {
  return request<ProgramOrgAffiliation>(`/api/platform/org-affiliations/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}
/** Partner portal: the gated program view a partner-org member is entitled to,
 *  resolved by the caller's own org affiliation. 403 if no active grant. */
export interface PartnerProgramContext {
  program: { id: string; name: string; description: string | null; branding: { accent: string | null; logo: string | null } | null };
  org_name: string;
  org_slug: string;
  program_slug: string;
  capabilities: string[];
  surfaces: { id: string; label: string; group: string | null }[];
}
export async function getPartnerProgramContext(orgSlug: string, programSlug: string): Promise<PartnerProgramContext> {
  return request<PartnerProgramContext>(`/api/platform/partner/context?org_slug=${encodeURIComponent(orgSlug)}&program_slug=${encodeURIComponent(programSlug)}`);
}

/** Grant a partner org a catalog-based, gated view of a program (capabilities
 *  validated server-side against the program's Access Catalog). */
export async function setProgramOrgAffiliationAccess(
  programId: string,
  affiliationId: string,
  payload: { capabilities: string[]; perms?: Record<string, unknown> },
): Promise<ProgramOrgAffiliation> {
  return request<ProgramOrgAffiliation>(
    `/api/platform/programs/${programId}/org-affiliations/${affiliationId}/access`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}
export async function listIncomingOrgAffiliations(orgId: string): Promise<ProgramOrgAffiliation[]> {
  return request<ProgramOrgAffiliation[]>(`/api/platform/orgs/${orgId}/incoming-affiliations`);
}
export async function listAffiliatedPrograms(orgId: string): Promise<AffiliatedProgram[]> {
  return request<AffiliatedProgram[]>(`/api/platform/orgs/${orgId}/affiliated-programs`);
}
export async function getAffiliatedProgramDetail(orgId: string, programId: string): Promise<AffiliatedProgramDetail> {
  return request<AffiliatedProgramDetail>(`/api/platform/orgs/${orgId}/affiliated-programs/${programId}`);
}

export async function listOrgRelationships(orgId: string): Promise<OrgRelationship[]> {
  return request<OrgRelationship[]>(`/api/platform/orgs/${orgId}/relationships`);
}
export async function updateOrgRelationship(id: string, status: string): Promise<OrgRelationship> {
  return request<OrgRelationship>(`/api/platform/relationships/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}
export async function deleteOrgRelationship(id: string): Promise<void> {
  await request(`/api/platform/relationships/${id}`, { method: "DELETE" });
}
export async function createOrgRelationship(
  orgId: string,
  payload: { target_organization_id: string; relationship_type: string },
): Promise<OrgRelationship> {
  return request<OrgRelationship>(`/api/platform/orgs/${orgId}/relationships`, { method: "POST", body: JSON.stringify(payload) });
}

export async function bulkImportRegistrations(
  offeringId: string,
  rows: Array<{ email?: string; name?: string; age?: number }>,
): Promise<{ created: number }> {
  return request(`/api/offerings/${offeringId}/registrations/bulk-import`, { method: "POST", body: JSON.stringify({ rows }) });
}

export async function deleteProgram(programId: string): Promise<void> {
  await request(`/api/platform/programs/${programId}`, { method: "DELETE" });
}

// ── Org-defined program categories (Settings → Categories) ──────────────────
// Categories are name-identified with an optional `parent` for nesting (a
// folder tree). Programs still reference a category by name (primary + secondary).
export interface CategoryNode { name: string; parent: string | null }
export async function listOrgCategories(orgId: string): Promise<CategoryNode[]> {
  return request<CategoryNode[]>(`/api/platform/orgs/${orgId}/categories`);
}
export async function addOrgCategory(orgId: string, name: string, parent?: string | null): Promise<CategoryNode[]> {
  return request<CategoryNode[]>(`/api/platform/orgs/${orgId}/categories`, {
    method: "POST",
    body: JSON.stringify({ name, parent: parent ?? null }),
  });
}
export async function setOrgCategoryParent(orgId: string, name: string, parent: string | null): Promise<CategoryNode[]> {
  return request<CategoryNode[]>(`/api/platform/orgs/${orgId}/categories/parent`, {
    method: "PUT",
    body: JSON.stringify({ name, parent }),
  });
}
export async function removeOrgCategory(orgId: string, name: string): Promise<CategoryNode[]> {
  return request<CategoryNode[]>(`/api/platform/orgs/${orgId}/categories?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}
export async function renameOrgCategory(orgId: string, from: string, to: string): Promise<CategoryNode[]> {
  return request<CategoryNode[]>(`/api/platform/orgs/${orgId}/categories`, {
    method: "PATCH",
    body: JSON.stringify({ from, to }),
  });
}

export async function createProgram(orgId: string, program: DraftProgramInput): Promise<Program> {
  return request<Program>(`/api/platform/orgs/${orgId}/programs`, {
    method: "POST",
    body: JSON.stringify(program),
  });
}

// ── Partners ("sister programs") ────────────────────────────────────────────
/** Create a partner connected to one of the org's programs. A partner is a
 *  program with its own slug/login and restricted platform views. */
export async function createPartner(
  orgId: string,
  input: {
    name: string;
    description?: string;
    connected_program_id: string;
    slug?: string;
    features?: Record<string, boolean>;
    feature_access?: Record<string, { capabilities: string[] }>;
  },
): Promise<Program> {
  return request<Program>(`/api/platform/orgs/${orgId}/partners`, { method: "POST", body: JSON.stringify(input) });
}
/** The partners connected to a program (its Partners tab). */
export async function listPartnersForProgram(programId: string): Promise<Program[]> {
  return request<Program[]>(`/api/platform/programs/${programId}/partners`);
}
export interface PartnerPortal {
  partner: Program;
  connected_program: { id: string; name: string } | null;
  org_id: string;
  org_slug: string | null;
}
/** Resolve a partner by its login slug (partner portal). */
export async function getPartnerPortal(slug: string): Promise<PartnerPortal> {
  return request<PartnerPortal>(`/api/platform/partner-portal/${encodeURIComponent(slug)}`);
}

/** Update which feature-areas are accessible inside a program (org-admin config).
 *  `featureAccess` carries per-platform Partial capability subsets. */
export async function updateProgramFeatures(
  programId: string,
  features: ProgramFeatures,
  platformsOpen?: boolean,
  featureAccess?: Record<string, { capabilities: string[] }>,
): Promise<Program> {
  const body: Record<string, unknown> = { features };
  if (platformsOpen !== undefined) body.platforms_open = platformsOpen;
  if (featureAccess !== undefined) body.feature_access = featureAccess;
  return request<Program>(`/api/platform/programs/${programId}/features`, {
    method: "PATCH",
    body: JSON.stringify(body),
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

export async function updateOrgName(orgId: string, name: string): Promise<{ id: string; name: string; slug: string }> {
  return request(`/api/platform/orgs/${orgId}/name`, { method: "PATCH", body: JSON.stringify({ name }) });
}

export async function listIntegrations(orgId: string): Promise<Integration[]> {
  return request<Integration[]>(`/api/platform/orgs/${orgId}/integrations`);
}

/** Upload the org's logo (≤1 MB image). Returns its serving URL and sets it on the theme. */
export async function uploadOrgLogo(orgId: string, file: File): Promise<{ logo_url: string }> {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
  return request<{ logo_url: string }>(`/api/platform/orgs/${orgId}/logo`, {
    method: "POST",
    body: JSON.stringify({ data, content_type: file.type }),
  });
}

/** Upload the org's favicon (≤1 MB image) — the browser-tab icon. */
export async function uploadOrgFavicon(orgId: string, file: File): Promise<{ favicon_url: string }> {
  const data = await fileToBase64(file);
  return request<{ favicon_url: string }>(`/api/platform/orgs/${orgId}/favicon`, {
    method: "POST",
    body: JSON.stringify({ data, content_type: file.type }),
  });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

// ── Team & Roles at the ORG and NEXUS altitudes ──────────────────────────────
export interface ScopedRole {
  id: string;
  organization_id: string | null;
  program_id: string | null;
  name: string;
  perms: Record<string, string>;
  display_as_group?: boolean;
  parent_group_id?: string | null;
}

export interface TeamPerson {
  membership_id: string | null;
  invitation_id: string | null;
  email: string | null;
  display_name: string | null;
  membership_role: string;
  status: "active" | "invited";
  role_id: string | null;
  role_name: string | null;
}

export async function listOrgScopedRoles(orgId: string): Promise<ScopedRole[]> {
  return request<ScopedRole[]>(`/api/platform/orgs/${orgId}/roles`);
}
export async function createOrgScopedRole(
  orgId: string,
  payload: { name: string; perms: Record<string, string>; display_as_group?: boolean; parent_group_id?: string | null; capabilities?: string[] },
): Promise<ScopedRole> {
  return request<ScopedRole>(`/api/platform/orgs/${orgId}/roles`, { method: "POST", body: JSON.stringify(payload) });
}
export async function listOrgTeam(orgId: string): Promise<TeamPerson[]> {
  return request<TeamPerson[]>(`/api/platform/orgs/${orgId}/team`);
}
export async function inviteOrgTeamMember(
  orgId: string,
  payload: { email: string; display_name?: string; role_id?: string },
): Promise<Invitation> {
  return request<Invitation>(`/api/platform/orgs/${orgId}/team`, { method: "POST", body: JSON.stringify(payload) });
}
export async function setOrgTeamRole(orgId: string, email: string, roleId: string | null): Promise<void> {
  await request(`/api/platform/orgs/${orgId}/team/role`, { method: "PUT", body: JSON.stringify({ email, role_id: roleId }) });
}
export async function getOrgMyRole(orgId: string): Promise<{ role_id: string; role_name: string | null; perms: Record<string, string> } | null> {
  return request(`/api/platform/orgs/${orgId}/my-role`);
}

export interface NexusOperator {
  profile_id: string | null;
  invitation_id: string | null;
  email: string | null;
  display_name: string | null;
  kind: "admin" | "confined";
  role_id: string | null;
  role_name: string | null;
  status: "active" | "invited";
}

export async function listNexusScopedRoles(): Promise<ScopedRole[]> {
  return request<ScopedRole[]>("/api/platform/admin/nexus/roles");
}
export async function createNexusScopedRole(
  payload: { name: string; perms: Record<string, string>; display_as_group?: boolean; parent_group_id?: string | null; capabilities?: string[] },
): Promise<ScopedRole> {
  return request<ScopedRole>("/api/platform/admin/nexus/roles", { method: "POST", body: JSON.stringify(payload) });
}
export async function listNexusTeam(): Promise<NexusOperator[]> {
  return request<NexusOperator[]>("/api/platform/admin/nexus/team");
}
export async function inviteNexusOperator(payload: { email: string; display_name?: string; role_id?: string }): Promise<Invitation> {
  return request<Invitation>("/api/platform/admin/nexus/team", { method: "POST", body: JSON.stringify(payload) });
}
export async function setNexusTeamRole(email: string, roleId: string | null): Promise<void> {
  await request("/api/platform/admin/nexus/team/role", { method: "PUT", body: JSON.stringify({ email, role_id: roleId }) });
}
export async function removeNexusOperator(email: string): Promise<void> {
  await request(`/api/platform/admin/nexus/team?email=${encodeURIComponent(email)}`, { method: "DELETE" });
}

// ── Branding: Nexus platform + per-program ───────────────────────────────────
export interface PlatformBranding {
  accent: string | null;
  logo: string | null;
  favicon?: string | null;
  title?: string | null;
}

export async function getPlatformBranding(): Promise<PlatformBranding> {
  return request<PlatformBranding>("/api/platform/platform/branding");
}
export async function updatePlatformTheme(accent: string): Promise<PlatformBranding> {
  return request<PlatformBranding>("/api/platform/admin/platform/theme", {
    method: "PATCH",
    body: JSON.stringify({ accent_color: accent }),
  });
}
export async function updatePlatformName(title: string): Promise<PlatformBranding> {
  return request<PlatformBranding>("/api/platform/admin/platform/name", {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}
export async function uploadPlatformLogo(file: File): Promise<{ logo_url: string }> {
  const data = await fileToBase64(file);
  return request<{ logo_url: string }>("/api/platform/admin/platform/logo", {
    method: "POST",
    body: JSON.stringify({ data, content_type: file.type }),
  });
}
export async function uploadPlatformFavicon(file: File): Promise<{ favicon_url: string }> {
  const data = await fileToBase64(file);
  return request<{ favicon_url: string }>("/api/platform/admin/platform/favicon", {
    method: "POST",
    body: JSON.stringify({ data, content_type: file.type }),
  });
}

export async function updateProgramTheme(
  programId: string,
  opts: { accent?: string; revert?: boolean },
): Promise<{ branding: { accent: string | null; logo: string | null; favicon?: string | null } | null }> {
  return request(`/api/platform/programs/${programId}/theme`, {
    method: "PATCH",
    body: JSON.stringify({ accent_color: opts.accent, revert: opts.revert }),
  });
}
export async function updateProgramName(programId: string, name: string): Promise<Program> {
  return request<Program>(`/api/platform/programs/${programId}/name`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}
export async function updateProgramCategories(
  programId: string,
  patch: { category?: string; secondary_categories?: string[] },
): Promise<Program> {
  return request<Program>(`/api/platform/programs/${programId}/categories`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
export async function uploadProgramLogo(programId: string, file: File): Promise<{ logo_url: string }> {
  const data = await fileToBase64(file);
  return request<{ logo_url: string }>(`/api/platform/programs/${programId}/logo`, {
    method: "POST",
    body: JSON.stringify({ data, content_type: file.type }),
  });
}

/** Upload a program's favicon (≤1 MB image) — the browser-tab icon. */
export async function uploadProgramFavicon(programId: string, file: File): Promise<{ favicon_url: string }> {
  const data = await fileToBase64(file);
  return request<{ favicon_url: string }>(`/api/platform/programs/${programId}/favicon`, {
    method: "POST",
    body: JSON.stringify({ data, content_type: file.type }),
  });
}

/** Upload a program's card cover image (≤4 MB). Returns its serving URL. */
export async function uploadProgramCover(programId: string, file: File): Promise<{ cover_url: string }> {
  const data = await fileToBase64(file);
  return request<{ cover_url: string }>(`/api/platform/programs/${programId}/cover`, {
    method: "POST",
    body: JSON.stringify({ data, content_type: file.type }),
  });
}

/** Clear a program's card cover, leaving its accent/logo intact. */
export async function removeProgramCover(programId: string): Promise<void> {
  await request(`/api/platform/programs/${programId}/theme`, {
    method: "PATCH",
    body: JSON.stringify({ remove_cover: true }),
  });
}

// ── Audit log + Entitlements ─────────────────────────────────────────────────
export async function listAuditEvents(orgId: string, limit = 50): Promise<AuditEvent[]> {
  return request<AuditEvent[]>(`/api/platform/orgs/${orgId}/audit?limit=${limit}`);
}

export interface PlatformAuditEvent extends AuditEvent {
  organization_name: string | null;
}

/** Platform operator: audit feed across every organization. */
export async function listAllAuditEvents(limit = 100): Promise<PlatformAuditEvent[]> {
  return request<PlatformAuditEvent[]>(`/api/platform/admin/audit?limit=${limit}`);
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

// ── Capability envelope (§3.5 governance): what an org may create ───────────
export interface OrgCapabilities {
  programTypes: Record<string, boolean>;
  offeringTypes: Record<string, boolean>;
  /** Feature-areas the org may use — same six keys as per-program features. */
  features: Record<string, boolean>;
  /** Per-platform "Partial" provisioning: capability subsets per platform area
   *  (learning/bridge) that clamp what the org's programs and roles can grant. */
  featureAccess?: Record<string, { capabilities: string[] }>;
  /** Max programs the org may create; null = unlimited. */
  programCapacity?: number | null;
  /** May org-level admins enter the org's programs? Absent/true = yes. */
  adminsEnterPrograms?: boolean;
}

export async function getOrgCapabilities(orgId: string): Promise<OrgCapabilities> {
  return request<OrgCapabilities>(`/api/platform/orgs/${orgId}/capabilities`);
}

export async function setOrgCapabilities(orgId: string, patch: Partial<OrgCapabilities>): Promise<OrgCapabilities> {
  return request<OrgCapabilities>(`/api/platform/orgs/${orgId}/capabilities`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

/** Owner (Super Admin) only: toggle whether org admins may open this org's
 *  programs. Lives in the org's own Settings, not the Nexus console. */
export async function setOrgAccess(orgId: string, adminsEnterPrograms: boolean): Promise<OrgCapabilities> {
  return request<OrgCapabilities>(`/api/platform/orgs/${orgId}/access`, {
    method: "PATCH",
    body: JSON.stringify({ admins_enter_programs: adminsEnterPrograms }),
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
  platform_module?: PlatformModule;
  external_runtime_url?: string;
  participant_label_singular?: string;
  participant_label_plural?: string;
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

export async function deleteOffering(offeringId: string): Promise<void> {
  await request(`/api/offerings/${offeringId}`, { method: "DELETE" });
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

/** Delete an App Studio: its published versions and launch tokens go with it; offerings/registrations that pointed at it are detached, not deleted. */
export async function deleteApp(appId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/apps/${appId}`, { method: "DELETE" });
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

/** Remove a participant — deactivates their participant row (revokes access immediately). */
export async function removeRegistration(registrationId: string): Promise<Registration> {
  return request<Registration>(`/api/registrations/${registrationId}/remove`, { method: "POST" });
}

/** The program's participant roster (program-level + offering-level registrations). */
export async function listProgramRegistrations(programId: string): Promise<Registration[]> {
  return request<Registration[]>(`/api/programs/${programId}/participant-registrations`);
}

// ── Gates: program entrance pages ───────────────────────────────────────────
export type GateAudience = "participant" | "member";
export type GateLevel = "program" | "organization" | "nexus";
export interface Gate {
  id: string;
  organization_id: string | null;
  program_id: string | null;
  /** program (org+program), organization (org-scoped staff), or nexus (operator). */
  level: GateLevel;
  slug: string;
  title: string | null;
  subtitle: string | null;
  audience: GateAudience;
  /** Legacy single role; superseded by role_ids. */
  role_id: string | null;
  /** Roles a member gate offers at sign-up; the signer picks one. */
  role_ids: string[];
  allow_signin: boolean;
  allow_signup: boolean;
  approval_required: boolean;
  landing: string | null;
  config: Record<string, unknown>;
  org_slug?: string | null;
}
export interface PublicGate extends Gate {
  /** Offered roles resolved to {id,name}, in the gate's order (member gates). */
  roles: { id: string; name: string }[];
  /** All fields null for a nexus (operator) gate — it has no org; the page then
   * renders platform branding instead. */
  org: { id: string | null; slug: string | null; name: string | null; theme_accent_color: string | null; theme_logo_url: string | null };
  program_name: string | null;
}
export interface GateWrite {
  slug?: string;
  title?: string | null;
  subtitle?: string | null;
  audience?: GateAudience;
  role_ids?: string[];
  allow_signin?: boolean;
  allow_signup?: boolean;
  approval_required?: boolean;
  landing?: string | null;
}

export async function listGates(programId: string): Promise<Gate[]> {
  return request<Gate[]>(`/api/programs/${programId}/gates`);
}
export async function createGate(programId: string, payload: GateWrite): Promise<Gate> {
  return request<Gate>(`/api/programs/${programId}/gates`, { method: "POST", body: JSON.stringify(payload) });
}
export async function updateGate(gateId: string, patch: GateWrite): Promise<Gate> {
  return request<Gate>(`/api/gates/${gateId}`, { method: "PATCH", body: JSON.stringify(patch) });
}
export async function deleteGate(gateId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/gates/${gateId}`, { method: "DELETE" });
}

// ── Org-level gates (org-scoped staff onboarding; members only) ─────────────
export interface OrgGateWrite {
  title?: string | null;
  subtitle?: string | null;
  role_ids?: string[];
  allow_signin?: boolean;
  allow_signup?: boolean;
  approval_required?: boolean;
  landing?: string | null;
}
export async function listOrgGates(orgId: string): Promise<Gate[]> {
  return request<Gate[]>(`/api/platform/orgs/${orgId}/gates`);
}
export async function createOrgGate(orgId: string, payload: OrgGateWrite): Promise<Gate> {
  return request<Gate>(`/api/platform/orgs/${orgId}/gates`, { method: "POST", body: JSON.stringify(payload) });
}

// ── Nexus (operator) gates — platform altitude, mandatory approval ──────────
// Admission is ALWAYS approval-gated and offered roles are confined nexus roles
// only (enforced server-side): a public gate can never mint an operator, only
// queue a request for a platform_admin to approve.
export interface NexusGateWrite {
  title?: string | null;
  subtitle?: string | null;
  role_ids?: string[];
  allow_signin?: boolean;
  allow_signup?: boolean;
  landing?: string | null;
}
export interface GateRequest {
  id: string;
  gate_id: string;
  level: string;
  email: string;
  display_name: string | null;
  role_id: string | null;
  role_name: string | null;
  status: "pending" | "approved" | "rejected";
  gate_title: string | null;
  gate_slug: string | null;
  created_at: string;
}
export async function listNexusGates(): Promise<Gate[]> {
  return request<Gate[]>("/api/platform/admin/nexus/gates");
}
export async function createNexusGate(payload: NexusGateWrite): Promise<Gate> {
  return request<Gate>("/api/platform/admin/nexus/gates", { method: "POST", body: JSON.stringify(payload) });
}
export async function deleteNexusGate(gateId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/platform/admin/nexus/gates/${gateId}`, { method: "DELETE" });
}
export async function getPublicNexusGate(slug: string): Promise<PublicGate> {
  return request<PublicGate>(`/api/platform/nexus/gates/by-slug/${encodeURIComponent(slug)}`);
}
export async function listNexusGateRequests(status = "pending"): Promise<GateRequest[]> {
  return request<GateRequest[]>(`/api/platform/admin/nexus/gate-requests?status=${encodeURIComponent(status)}`);
}
export async function approveNexusGateRequest(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/platform/admin/nexus/gate-requests/${id}/approve`, { method: "POST" });
}
export async function rejectNexusGateRequest(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/platform/admin/nexus/gate-requests/${id}/reject`, { method: "POST" });
}

// Member-gate approval queues at the org and program altitudes. Same GateRequest
// shape as the operator queue; approving applies the membership + role the gate
// would have granted immediately.
export async function listOrgGateRequests(orgId: string, status = "pending"): Promise<GateRequest[]> {
  return request<GateRequest[]>(`/api/platform/orgs/${orgId}/gate-requests?status=${encodeURIComponent(status)}`);
}
export async function approveOrgGateRequest(orgId: string, id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/platform/orgs/${orgId}/gate-requests/${id}/approve`, { method: "POST" });
}
export async function rejectOrgGateRequest(orgId: string, id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/platform/orgs/${orgId}/gate-requests/${id}/reject`, { method: "POST" });
}
export async function listProgramGateRequests(programId: string, status = "pending"): Promise<GateRequest[]> {
  return request<GateRequest[]>(`/api/platform/programs/${programId}/gate-requests?status=${encodeURIComponent(status)}`);
}
export async function approveProgramGateRequest(programId: string, id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/platform/programs/${programId}/gate-requests/${id}/approve`, { method: "POST" });
}
export async function rejectProgramGateRequest(programId: string, id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/platform/programs/${programId}/gate-requests/${id}/reject`, { method: "POST" });
}

/** Public pre-auth gate config (no session needed). */
/** A partner's own gate, resolved by the partner's slug (/partner/:slug/:gate). */
export async function getPublicPartnerGate(partnerSlug: string, gateSlug: string): Promise<PublicGate> {
  return request<PublicGate>(`/api/gates/partner/${encodeURIComponent(partnerSlug)}/${encodeURIComponent(gateSlug)}`);
}
export async function getPublicGate(orgSlug: string, gateSlug: string): Promise<PublicGate> {
  return request<PublicGate>(`/api/gates/by-path/${encodeURIComponent(orgSlug)}/${encodeURIComponent(gateSlug)}`);
}
export async function gateSignup(
  gateId: string,
  payload: { email: string; password: string; name?: string; role_id?: string },
): Promise<{ access_token?: string; pending: boolean; landing: string | null }> {
  // access_token is omitted when the gate is approval-gated (e.g. every nexus
  // gate) — there is no session until an operator approves the request.
  return request(`/api/platform/gates/${gateId}/signup`, { method: "POST", body: JSON.stringify(payload) });
}
export async function gateSignin(
  gateId: string,
  payload: { email: string; password: string },
): Promise<{ access_token: string; landing: string | null }> {
  return request(`/api/platform/gates/${gateId}/signin`, { method: "POST", body: JSON.stringify(payload) });
}

/** Invite a participant into the PROGRAM (not an offering) — the access unit. */
export async function inviteProgramParticipant(programId: string, payload: { email: string; name?: string }): Promise<Registration> {
  return request<Registration>(`/api/programs/${programId}/participants`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

// ── Program-administrator assignment (§3.5 delegation) ──────────────────────
export interface ProgramAdministrator {
  membership_id?: string | null;
  invitation_id?: string | null;
  email: string;
  display_name: string | null;
  role: string;
  status: "active" | "invited";
}

// ── Nexus-level org administrators (boundary governance, Edit tab) ──────────
export interface OrgAdmin {
  membership_id: string | null;
  invitation_id: string | null;
  email: string | null;
  display_name: string | null;
  role: string;
  status: "active" | "invited";
}

export async function listOrgAdmins(orgId: string): Promise<OrgAdmin[]> {
  return request<OrgAdmin[]>(`/api/platform/admin/organizations/${orgId}/admins`);
}

export async function addOrgAdmin(
  orgId: string,
  payload: { email: string; display_name?: string },
): Promise<Invitation> {
  return request<Invitation>(`/api/platform/admin/organizations/${orgId}/admins`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function removeOrgAdmin(
  orgId: string,
  ref: { membership_id?: string; invitation_id?: string },
): Promise<void> {
  const q = ref.membership_id
    ? `membership_id=${encodeURIComponent(ref.membership_id)}`
    : `invitation_id=${encodeURIComponent(ref.invitation_id ?? "")}`;
  await request(`/api/platform/admin/organizations/${orgId}/admins?${q}`, { method: "DELETE" });
}

export async function listProgramAdministrators(programId: string): Promise<ProgramAdministrator[]> {
  return request<ProgramAdministrator[]>(`/api/programs/${programId}/administrators`);
}

/** Inviting now enrolls immediately: the person is an active member with an account. */
export interface MemberEnrollResult {
  active: boolean;
  email: string;
  created: boolean;
  temp_password: string | null;
}

export async function assignProgramAdministrator(
  programId: string,
  email: string,
  displayName?: string,
): Promise<MemberEnrollResult> {
  return request<MemberEnrollResult>(`/api/programs/${programId}/administrators`, {
    method: "POST",
    body: JSON.stringify({ email, display_name: displayName || undefined }),
  });
}

// ── Program members + custom-role assignment (Team & Roles: People) ─────────
export interface ProgramMember {
  membership_id: string | null;
  invitation_id: string | null;
  email: string | null;
  display_name: string | null;
  membership_role: string;
  status: "active" | "invited";
  role_id: string | null;
  role_name: string | null;
  /** Pre-built platform role assigned inside Bridge (read-only here). */
  bridge_role?: string | null;
  /** All platform-role assignments: { bridge?, learning?, … } (read-only here). */
  platform_roles?: Record<string, string> | null;
}

/** Remove a member (org- or program-scoped membership). */
export async function removeMember(membershipId: string): Promise<void> {
  await request(`/api/platform/members/${membershipId}`, { method: "DELETE" });
}

/** Withdraw a pending invitation — its activation link stops working. */
export async function revokeInvitation(invitationId: string): Promise<void> {
  await request(`/api/platform/invitations/${invitationId}`, { method: "DELETE" });
}

export interface ProgramTeamSummary {
  team: ProgramMember[];
  groups: { platform: string; role: string; count: number }[];
  /** Platform-only members (hold a platform role, no core program role). They
   *  can still be placed into groups (placement is email-keyed). */
  platformMembers?: ProgramMember[];
}

export async function getProgramTeamSummary(programId: string): Promise<ProgramTeamSummary> {
  return request<ProgramTeamSummary>(`/api/programs/${programId}/members/summary`);
}

export interface PlatformGroupMember {
  membership_id: string | null;
  invitation_id: string | null;
  email: string | null;
  display_name: string | null;
  status: "active" | "invited";
  platform: string;
  role: string;
}

export async function listProgramPlatformGroup(
  programId: string,
  platform: string,
  role: string,
  offset = 0,
  limit = 25,
): Promise<PlatformGroupMember[]> {
  return request<PlatformGroupMember[]>(
    `/api/programs/${programId}/members/group?platform=${encodeURIComponent(platform)}&role=${encodeURIComponent(role)}&offset=${offset}&limit=${limit}`,
  );
}

export async function listProgramMembers(programId: string): Promise<ProgramMember[]> {
  return request<ProgramMember[]>(`/api/programs/${programId}/members`);
}

export async function inviteProgramMember(
  programId: string,
  payload: { email: string; display_name?: string; role_id?: string; group_ids?: string[] },
): Promise<MemberEnrollResult> {
  return request<MemberEnrollResult>(`/api/programs/${programId}/members`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** The true invite flow: creates a PENDING invitation and returns an activation
 *  link (`/invite/:token`). The person sets their own password at the org portal
 *  and accepts; role + groups (pre-assigned email-keyed) apply on acceptance. */
export async function inviteProgramLink(
  programId: string,
  payload: { email: string; display_name?: string; role_id?: string; group_ids?: string[] },
): Promise<{ token: string; redeem_url: string }> {
  return request<{ token: string; redeem_url: string }>(`/api/programs/${programId}/invite`, {
    method: "POST",
    body: JSON.stringify({ ...payload, platform: "program" }),
  });
}

export async function setProgramMemberRole(programId: string, email: string, roleId: string | null): Promise<void> {
  await request(`/api/programs/${programId}/members/role`, {
    method: "PUT",
    body: JSON.stringify({ email, role_id: roleId }),
  });
}

/** The signed-in member's own custom role (+perms) in a program, or null. */
export async function getMyProgramRole(
  programId: string,
): Promise<{ role_id: string; role_name: string | null; perms: RolePerms } | null> {
  return request(`/api/programs/${programId}/my-role`);
}

/** Dev only: every org (name + slug) so the gate can link all portals. */
export async function listDevOrgs(): Promise<{ id: string; name: string; slug: string }[]> {
  return request(`/api/platform/dev/orgs`);
}

// ── App Studio config + versions (Phase 4) ───────────────────────────────────
export interface ShellSignupField {
  key: string;
  label: string;
  type: string;
  required: boolean;
}

export interface ShellNavTab {
  key: string;
  label: string;
}

/** The App Studio working config. All sections optional — the editor fills them in. */
export interface ShellConfig {
  identity?: { displayName?: string; shortName?: string };
  branding?: {
    primaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;
    logoText?: string;
  };
  copy?: { welcomeTitle?: string; welcomeSubtitle?: string; footerText?: string };
  auth?: { methods?: string[]; allowSelfSignup?: boolean; requireInviteCode?: boolean };
  signupFields?: ShellSignupField[];
  onboarding?: { key: string; label: string; type: string }[];
  navigation?: ShellNavTab[];
}

export interface AppConfigResponse {
  app_id: string;
  config: ShellConfig;
  latest_version: number | null;
  versions: { version: number; created_at: string }[];
}

export async function getAppConfig(appId: string): Promise<AppConfigResponse> {
  return request<AppConfigResponse>(`/api/apps/${appId}/config`);
}

export async function saveAppConfig(appId: string, config: ShellConfig): Promise<void> {
  await request(`/api/apps/${appId}/config`, { method: "PUT", body: JSON.stringify(config) });
}

export async function publishAppVersion(appId: string): Promise<{ version: number }> {
  return request<{ version: number }>(`/api/apps/${appId}/publish-version`, { method: "POST" });
}

// ── Content Studio launch seam (Phase 5) ─────────────────────────────────
export interface LpLaunch {
  app_slug: string;
  launch_url: string | null;
  launch_token: string;
  expires_at: string;
  context: {
    organization_id: string;
    program_id: string;
    program_name: string;
    role: string;
  };
}

/** Mint a verified launch context for the program's Content Studio. */
export async function launchLearningPlatform(programId: string): Promise<LpLaunch> {
  return request<LpLaunch>(`/api/programs/${programId}/learning-platform/launch`, { method: "POST" });
}

/** Mint a verified launch context for the program's Bridge Platform (same seam as the LP). */
export async function launchBridgePlatform(programId: string): Promise<LpLaunch> {
  return request<LpLaunch>(`/api/programs/${programId}/bridge-platform/launch`, { method: "POST" });
}

/** Prove the handshake: swap the single-use launch token for a session (what the LP itself does). */
export async function exchangeLaunchToken(launchToken: string): Promise<{ access_token: string }> {
  return request<{ access_token: string }>(`/api/platform/auth/launch-exchange`, {
    method: "POST",
    body: JSON.stringify({ launch_token: launchToken }),
  });
}
