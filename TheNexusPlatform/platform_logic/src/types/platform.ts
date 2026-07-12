export type SignupType = "org" | "administrator" | "teacher" | "student";
export type StageKey = "international" | "national" | "state" | "chapter";
export type JoinCodeKind = "student" | "teacher" | "administrator";
export type Permission = "Can Edit" | "Can View" | "Per Level";
export type ProgramCategory = "game" | "edu";
export type DeliveryMethod = "join_code" | "email_direct";
export type IntegrationPermissionLevel = "can_edit" | "can_view" | "per_level";

export interface Program {
  id: string;
  org_id: string;
  name: string;
  category: ProgramCategory;
  description?: string;
  icon?: string;
  instructor_label?: string;
  learner_label?: string;
  course_count?: number;
  learner_count?: number;
  instructor_count?: number;
}

export interface Integration {
  id: string;
  organization_id: string;
  program_id?: string;
  integration_type: "discord";
  config: Record<string, unknown>;
  permission_level: IntegrationPermissionLevel;
  status: string;
}

export interface AuthUser {
  id: string;
  email: string;
  display_name?: string;
  role: string;
  access_token: string;
}

export interface MembershipSummary {
  id: string;
  org_id: string;
  org_name: string;
  role: string;
  stage_node_id?: string;
  stage_name?: string;
  stage_type?: StageKey;
  access: "view" | "edit";
  program_id?: string;
  program_name?: string;
  program_category?: ProgramCategory;
  registered_app_id?: string;
  app_launch_url?: string;
}

export interface OrgMember {
  id: string;
  profile_id: string;
  email: string;
  display_name?: string;
  role: string; // owner | administrator | instructor
  program_id?: string;
  stage_node_id?: string;
  stage_name?: string;
  access: "view" | "edit";
}

// ── Slice 11: org graph (relationships, affiliations, groups, invitations) ──
export interface Invitation {
  id: string;
  organization_id: string;
  organization_name?: string;
  program_id?: string;
  offering_id?: string;
  group_id?: string;
  email?: string;
  role: string;
  status: string;
  expires_at?: string;
  created_at?: string;
  token?: string;
  redeem_url?: string;
}

export interface Group {
  id: string;
  organization_id: string;
  program_id?: string;
  offering_id?: string;
  name: string;
  label?: string;
  visibility: string;
  parent_group_id?: string;
  owner_user_id?: string;
  created_at?: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id?: string;
  role?: string;
  display_name?: string;
  email?: string;
}

export interface ProgramAffiliation {
  id: string;
  program_id: string;
  subject_type: "user" | "organization" | "group";
  subject_id: string;
  affiliation_type: string;
  status: string;
  created_at?: string;
}

// A program shared with the current org via an accepted affiliation (Org B view).
export interface AffiliatedProgram {
  program_id: string;
  name: string;
  category?: ProgramCategory;
  description?: string;
  owner_organization_id: string;
  affiliation_type: string;
}

export interface AffiliatedProgramDetail {
  program: { id: string; name: string; category?: string; description?: string } | null;
  offerings: Array<{ id: string; name: string; offering_type: string; status: string }>;
  participants: Array<{ id: string; offering_id: string; participant_type: string; status: string; display_name?: string; email?: string }>;
}

// Program ↔ organization affiliation (Org A invites Org B; Org B accepts).
export interface ProgramOrgAffiliation {
  id: string;
  program_id: string;
  organization_id: string; // the invited org (Org B)
  affiliation_type: string;
  tenant_access_mode?: string;
  visibility?: string;
  status: string; // invited | active | paused | archived
  created_at?: string;
  // Enriched on the incoming-requests inbox only:
  program_name?: string;
  from_organization_id?: string; // the inviting org (Org A)
}

export interface OrgRelationship {
  id: string;
  source_organization_id: string;
  target_organization_id: string;
  relationship_type: string;
  status: string;
  created_at?: string;
}

export interface MeResponse {
  id: string;
  email: string;
  display_name?: string;
  role: string;
  memberships: MembershipSummary[];
}

export interface DashboardStageTab {
  id: string;
  stage_type: StageKey;
  name: string;
  signup_count: number;
  event_at?: string;
  discord_url?: string;
  qualifier_status?: string;
}

export interface DashboardData {
  org_id: string;
  org_name: string;
  role_label: string;
  active_stage_id?: string;
  stages: DashboardStageTab[];
  total_signups: number;
  students: Array<{
    id: string;
    profile_id: string;
    display_name?: string;
    email?: string;
    stage_node_id: string;
    stage_name: string;
    registered_at: string;
  }>;
  theme_accent_color?: string;
  theme_logo_url?: string;
}

export interface JoinCode {
  id: string;
  code?: string;
  kind: JoinCodeKind;
  org_id: string;
  stage_node_id?: string;
  stage_name?: string;
  org_name: string;
  program_id?: string;
  program_name?: string;
  program_category?: ProgramCategory;
  delivery_method?: DeliveryMethod;
  email?: string;
  max_uses?: number;
  uses_remaining?: number;
  expires_at?: string;
  redeem_url?: string;
}

export function permissionToApi(p: Permission): "view" | "edit" | "per_level" {
  if (p === "Can Edit") return "edit";
  if (p === "Can View") return "view";
  return "per_level";
}

// ── Offerings, Registered Apps, and the Signup Hook (Nexus v0.3) ────────────
export type OfferingType = "course" | "challenge" | "app" | "cohort" | "class" | "event" | "assessment" | "pilot";
export type OfferingStatus = "draft" | "private_beta" | "open" | "closed" | "completed" | "archived";
export type ApprovalMode = "auto_approve" | "manual_approve";
export type PlatformModule = "nexus_only" | "learning" | "coaching" | "bridge" | "mixed";
export type SignupFieldType = "text" | "number" | "email" | "phone" | "select" | "boolean";
export type AllowedIdentifiers = "email" | "phone" | "both";
export type AppStatus = "active" | "paused" | "revoked";
export type RegistrationSource = "app_hook" | "admin_add" | "coach_add" | "invite_link" | "bulk_import";
export type RegistrationStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "waitlisted"
  | "withdrawn"
  | "directly_added";
export type ParticipantType = "learner" | "coach" | "reviewer" | "advisor" | "volunteer" | "organizer" | "instructor";

export interface SignupField {
  key: string;
  label: string;
  type: SignupFieldType;
  required: boolean;
  options?: string[];
}

export const DEFAULT_SIGNUP_FIELDS: SignupField[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "age", label: "Age", type: "number", required: false },
  { key: "email", label: "Email", type: "email", required: true },
];

export interface Offering {
  id: string;
  organization_id: string;
  program_id: string;
  stage_node_id?: string;
  name: string;
  slug: string;
  offering_type: OfferingType;
  status: OfferingStatus;
  description?: string;
  start_date?: string;
  end_date?: string;
  registration_open: boolean;
  approval_mode: ApprovalMode;
  signup_fields: SignupField[];
  platform_module: PlatformModule;
  registered_app_id?: string;
  external_runtime_url?: string;
  participant_label_singular?: string;
  participant_label_plural?: string;
  metadata: Record<string, unknown>;
  registration_count: number;
  pending_count: number;
  participant_count: number;
}

export interface RegisteredApp {
  id: string;
  organization_id: string;
  program_id?: string;
  offering_id?: string;
  app_name: string;
  app_slug: string;
  key_prefix?: string;
  allowed_identifiers: AllowedIdentifiers;
  status: AppStatus;
  launch_url?: string;
  launch_context: Record<string, unknown>;
}

// ── App Shell (Nexus v0.4 §6) ───────────────────────────────────────────────
// v0.4 re-adopts the App Shell as the single configurable app object. The
// backend still persists a RegisteredApp; the extra shell configuration
// (appType, theme, navigation, feature flags) is carried inside the app's
// `launch_context.shell` blob until the backend grows dedicated columns.
export type AppType = "course_app" | "challenge_app" | "coaching_app" | "bridge_app" | "mixed_app";

export interface AppShellTheme {
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
}

export interface AppShellConfig {
  appType?: AppType;
  theme?: AppShellTheme;
  navSections?: string[];
  featureFlags?: string[];
}

export interface RegisteredAppWithKey extends RegisteredApp {
  api_key: string;
}

export interface AppLaunchContext {
  app_slug: string;
  launch_url?: string;
  launch_token: string;
  expires_at: string;
  context: Record<string, unknown>;
}

export type ModuleKey = "nexus" | "learning" | "coaching" | "analytics";
export type EntitlementStatus = "active" | "trial" | "requested" | "disabled";

export interface Entitlement {
  id: string;
  organization_id: string;
  subject_type: "organization" | "program" | "offering";
  subject_id: string;
  module: ModuleKey;
  status: EntitlementStatus;
  limits: Record<string, unknown>;
}

export interface AuditEvent {
  id: string;
  organization_id?: string;
  actor_user_id?: string;
  actor_name?: string;
  action: string;
  scope_type?: string;
  scope_id?: string;
  target_type?: string;
  target_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Participant {
  id: string;
  organization_id: string;
  program_id?: string;
  offering_id: string;
  stage_node_id?: string;
  user_id?: string;
  participant_type: ParticipantType;
  status: "active" | "inactive" | "completed" | "removed";
  registration_id?: string;
  display_name?: string;
  email?: string;
  created_at: string;
}

export interface Registration {
  id: string;
  organization_id: string;
  program_id?: string;
  offering_id: string;
  stage_node_id?: string;
  registered_app_id?: string;
  registration_source: RegistrationSource;
  email?: string;
  phone?: string;
  name?: string;
  age?: number;
  user_id?: string;
  status: RegistrationStatus;
  field_data: Record<string, unknown>;
  reviewed_by_user_id?: string;
  reviewed_at?: string;
  created_at: string;
}
