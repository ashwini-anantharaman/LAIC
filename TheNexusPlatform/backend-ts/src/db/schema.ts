/**
 * Drizzle schema for the Nexus platform tables — Nexus v0.4, canonical TS backend.
 *
 * This mirrors the hand-written SQL migrations in backend-ts/migrations, which
 * remain the single source of truth for DDL (and, per v0.4, for RLS policies).
 * Drizzle is used here ONLY as the typed query builder — we do not use
 * drizzle-kit to generate or own migrations. Keep this file in sync with the
 * SQL when tables change.
 *
 * Pure Learning-Platform tables (units, unit_content, uploads, module_structures,
 * item_mastery) are intentionally omitted — the Learning Platform owns those.
 */
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: uuid("auth_user_id"),
  organizationId: uuid("organization_id"),
  email: text("email"),
  /** Optional second sign-in identifier; unique case-insensitively (0038). */
  username: text("username"),
  /** When the person set their OWN password (0046). Null = admins may still set
   *  a starting one; set = only they can change it, via a claim code. */
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  /** SHA-256 of a pending single-use claim code, and its expiry (0046). */
  claimCodeHash: text("claim_code_hash"),
  claimCodeExpiresAt: timestamp("claim_code_expires_at", { withTimezone: true }),
  /** Profile picture as a base64 data URL, capped at ~150 kB (0043). */
  avatar: text("avatar"),
  role: text("role").notNull().default("student"),
  name: text("name"),
  grade: text("grade"),
  displayName: text("display_name"),
  phone: text("phone"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  ownerId: uuid("owner_id"),
  settings: jsonb("settings").notNull().default({}),
  shortName: text("short_name"),
  organizationType: text("organization_type"),
  tenantMode: text("tenant_mode").notNull().default("full_tenant"),
  parentOrganizationId: uuid("parent_organization_id"),
  status: text("status").notNull().default("active"),
  missionSummary: text("mission_summary"),
  websiteUrl: text("website_url"),
  logoUrl: text("logo_url"),
  themeJson: jsonb("theme_json"),
  dataResidency: text("data_residency").notNull().default("shared"),
  publicProfileEnabled: boolean("public_profile_enabled").notNull().default(false),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const challenges = pgTable("challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const challengeStageConfig = pgTable("challenge_stage_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  challengeId: uuid("challenge_id").notNull(),
  stageType: text("stage_type").notNull(),
  position: integer("position").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
});

export const stageNodes = pgTable("stage_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  challengeId: uuid("challenge_id"),
  parentId: uuid("parent_id"),
  programId: uuid("program_id"),
  stageType: text("stage_type").notNull(),
  name: text("name").notNull(),
  depth: integer("depth").notNull().default(0),
  path: text("path").notNull().default("/"),
  discordUrl: text("discord_url"),
  eventAt: timestamp("event_at", { withTimezone: true }),
  qualifierStatus: text("qualifier_status").default("pending"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const joinCodes = pgTable("join_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  stageNodeId: uuid("stage_node_id"),
  programId: uuid("program_id"),
  code: text("code").notNull(),
  kind: text("kind").notNull(),
  active: boolean("active").notNull().default(true),
  deliveryMethod: text("delivery_method").notNull().default("join_code"),
  email: text("email"),
  maxUses: integer("max_uses"),
  usesRemaining: integer("uses_remaining"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgPermissionDefaults = pgTable("org_permission_defaults", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  role: text("role").notNull(),
  defaultAccess: text("default_access").notNull(),
  perLevelOverrides: jsonb("per_level_overrides").notNull().default({}),
});

export const orgMemberships = pgTable("org_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  profileId: uuid("profile_id").notNull(),
  role: text("role").notNull(),
  programId: uuid("program_id"),
  stageNodeId: uuid("stage_node_id"),
  access: text("access").notNull().default("view"),
  scopeType: text("scope_type").notNull().default("organization"),
  scopeId: uuid("scope_id"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Club chat: one thread per program (0039). Authors are profile ids. */
export const clubChatMessages = pgTable("club_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id").notNull(),
  authorProfileId: uuid("author_profile_id").notNull(),
  body: text("body").notNull(),
  /** An attached picture as a data URL (0045); a message may be image-only. */
  image: text("image"),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }),
  pinnedBy: uuid("pinned_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studentRegistrations = pgTable("student_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  stageNodeId: uuid("stage_node_id").notNull(),
  profileId: uuid("profile_id").notNull(),
  joinCodeId: uuid("join_code_id"),
  currentStageNodeId: uuid("current_stage_node_id"),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
});

export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  icon: text("icon"),
  /** The club's banner on the app's Club tab, as a data URL (0044). */
  headerImage: text("header_image"),
  instructorLabel: text("instructor_label"),
  learnerLabel: text("learner_label"),
  status: text("status").notNull().default("active"),
  defaultVisibility: text("default_visibility").notNull().default("private"),
  ownerUserId: uuid("owner_user_id"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  programId: uuid("program_id"),
  integrationType: text("integration_type").notNull(),
  config: jsonb("config").notNull().default({}),
  permissionLevel: text("permission_level").notNull().default("per_level"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const registeredApps = pgTable("registered_apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  programId: uuid("program_id"),
  offeringId: uuid("offering_id"),
  appName: text("app_name").notNull(),
  appSlug: text("app_slug").notNull(),
  apiKeyHash: text("api_key_hash"),
  keyPrefix: text("key_prefix"),
  allowedIdentifiers: text("allowed_identifiers").notNull().default("email"),
  status: text("status").notNull().default("active"),
  launchUrl: text("launch_url"),
  launchContext: jsonb("launch_context").notNull().default({}),
  shellConfig: jsonb("shell_config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appConfigVersions = pgTable("app_config_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  registeredAppId: uuid("registered_app_id").notNull(),
  version: integer("version").notNull(),
  config: jsonb("config").notNull(),
  publishedByUserId: uuid("published_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Gates: program-level (later platform-level) sign-up/sign-in pages, each at
// /@/<org-slug>/<slug>. The entrance to a program — access is still resolved
// from participation + role (migration 0029).
export const gates = pgTable("gates", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Null for nexus (operator) gates, which admit to the platform altitude and
  // belong to no organization.
  organizationId: uuid("organization_id"),
  // Null for org-level gates (org-scoped, no program) and nexus gates.
  programId: uuid("program_id"),
  // 'program' | 'organization' | 'nexus' — which altitude this gate admits to.
  level: text("level").notNull().default("program"),
  slug: text("slug").notNull(),
  title: text("title"),
  subtitle: text("subtitle"),
  // 'participant' (students → Registrations) or 'member' (staff → Team & Roles).
  audience: text("audience").notNull().default("participant"),
  roleId: uuid("role_id"), // legacy single role; superseded by roleIds
  // Program roles a member gate offers at sign-up; the signer picks one. Empty
  // for participant gates (and member gates that assign no role).
  roleIds: jsonb("role_ids").notNull().default([]),
  allowSignin: boolean("allow_signin").notNull().default(true),
  allowSignup: boolean("allow_signup").notNull().default(false),
  approvalRequired: boolean("approval_required").notNull().default(false),
  landing: text("landing"),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A pending membership request from an approval-gated gate (mandatory for nexus
// gates). Approving applies the offered role; until then the person has an
// account but no access at the gate's altitude.
export const gateMemberRequests = pgTable("gate_member_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  gateId: uuid("gate_id").notNull(),
  level: text("level").notNull().default("nexus"),
  email: text("email").notNull(),
  displayName: text("display_name"),
  roleId: uuid("role_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: uuid("decided_by"),
});

// Per-user data for a published App Shell app (Phase 2) — a student's onboarding
// answers + completion, keyed by the auth credential.
export const appUserData = pgTable("app_user_data", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  registeredAppId: uuid("registered_app_id").notNull(),
  programId: uuid("program_id"),
  userId: uuid("user_id").notNull(),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  answers: jsonb("answers").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const offerings = pgTable("offerings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  programId: uuid("program_id").notNull(),
  stageNodeId: uuid("stage_node_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  offeringType: text("offering_type").notNull(),
  status: text("status").notNull().default("draft"),
  description: text("description"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  registrationOpen: boolean("registration_open").notNull().default(false),
  approvalMode: text("approval_mode").notNull().default("manual_approve"),
  signupFields: jsonb("signup_fields").notNull(),
  platformModule: text("platform_module").notNull().default("nexus_only"),
  registeredAppId: uuid("registered_app_id"),
  externalRuntimeUrl: text("external_runtime_url"),
  participantLabelSingular: text("participant_label_singular"),
  participantLabelPlural: text("participant_label_plural"),
  metadata: jsonb("metadata").notNull().default({}),
  contentPackage: jsonb("content_package"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const registrations = pgTable("registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  programId: uuid("program_id"),
  // Nullable: a participant joins the PROGRAM; offering is optional (migration 0025).
  offeringId: uuid("offering_id"),
  stageNodeId: uuid("stage_node_id"),
  registeredAppId: uuid("registered_app_id"),
  registrationSource: text("registration_source").notNull().default("app_hook"),
  email: text("email"),
  phone: text("phone"),
  name: text("name"),
  age: integer("age"),
  userId: uuid("user_id"),
  status: text("status").notNull().default("pending_review"),
  fieldData: jsonb("field_data").notNull().default({}),
  reviewedByUserId: uuid("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  programId: uuid("program_id"),
  // Nullable: a participant joins the PROGRAM; offering is optional (migration 0025).
  offeringId: uuid("offering_id"),
  stageNodeId: uuid("stage_node_id"),
  userId: uuid("user_id"),
  participantType: text("participant_type").notNull().default("learner"),
  status: text("status").notNull().default("active"),
  groupId: uuid("group_id"),
  addedByUserId: uuid("added_by_user_id"),
  registrationId: uuid("registration_id"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appLaunchTokens = pgTable("app_launch_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull(),
  registeredAppId: uuid("registered_app_id").notNull(),
  userId: uuid("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id"),
  actorUserId: uuid("actor_user_id"),
  action: text("action").notNull(),
  scopeType: text("scope_type"),
  scopeId: uuid("scope_id"),
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entitlements = pgTable("entitlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  subjectType: text("subject_type").notNull().default("organization"),
  subjectId: uuid("subject_id").notNull(),
  module: text("module").notNull(),
  status: text("status").notNull().default("active"),
  limits: jsonb("limits").notNull().default({}),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Learning-Platform tables (Nexus v0.4 §7: scoped by org + program) ────────
// Content internals live in OWLWISE; Nexus owns the org/program scoping + RLS so
// courses and progress are isolated the same way as every other tenant table.
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  subject: text("subject").notNull(),
  unitTitle: text("unit_title").notNull(),
  teacher: text("teacher"),
  units: integer("units").notNull().default(1),
  joinCode: text("join_code"),
  grade: text("grade"),
  goals: text("goals"),
  orgId: uuid("org_id"),
  programId: uuid("program_id"),
  stageNodeId: uuid("stage_node_id"),
  teacherProfileId: uuid("teacher_profile_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const enrollments = pgTable("enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull(),
  displayName: text("display_name").notNull().default("Student"),
  profileId: uuid("profile_id"),
  orgId: uuid("org_id"),
  programId: uuid("program_id"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Slice 9: relationships, affiliations, groups, RBAC, invitations, identities ──
export const identities = pgTable("identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  identifierType: text("identifier_type").notNull(),
  identifier: text("identifier").notNull(),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  // org_id null = a NEXUS (platform) group; program_id null = org-level.
  organizationId: uuid("organization_id"),
  programId: uuid("program_id"),
  offeringId: uuid("offering_id"),
  name: text("name").notNull(),
  label: text("label"),
  visibility: text("visibility").notNull().default("private"),
  parentGroupId: uuid("parent_group_id"),
  ownerUserId: uuid("owner_user_id"),
  ownerOrganizationId: uuid("owner_organization_id"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const programRoles = pgTable("program_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id"),
  programId: uuid("program_id"),
  name: text("name").notNull(),
  perms: jsonb("perms").notNull().default({}),
  /** Discord-style: when true, holding this role also places the person in a
   * same-named group; when false the role never surfaces as a group. */
  displayAsGroup: boolean("display_as_group").notNull().default(false),
  /** Optional parent group — lets a role nest inside the group hierarchy. */
  parentGroupId: uuid("parent_group_id"),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const programRoleAssignments = pgTable("program_role_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id"),
  programId: uuid("program_id"),
  roleId: uuid("role_id").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Pre-built platform-role assignments (e.g. Bridge coach/learner), managed
 * from the platform's own UI but stored centrally here. Email-keyed. */
export const platformRoleAssignments = pgTable("platform_role_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  programId: uuid("program_id").notNull(),
  platform: text("platform").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  assignedByUserId: uuid("assigned_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Custom Learning-Platform roles (name + per-area view/edit perms) and their
 * email-keyed assignments — the learning app's own People-tab role system. */
export const learningRoles = pgTable("learning_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  programId: uuid("program_id").notNull(),
  name: text("name").notNull(),
  perms: jsonb("perms").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const learningRoleAssignments = pgTable("learning_role_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  programId: uuid("program_id").notNull(),
  email: text("email").notNull(),
  roleId: uuid("role_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMemberships = pgTable("group_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Null for nexus (platform) group placements.
  organizationId: uuid("organization_id"),
  groupId: uuid("group_id").notNull(),
  userId: uuid("user_id"),
  /** Email-keyed placement (matches the People tab); set instead of userId when
   * a person is placed in a group before they have an account. */
  email: text("email"),
  role: text("role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationRelationships = pgTable("organization_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceOrganizationId: uuid("source_organization_id").notNull(),
  targetOrganizationId: uuid("target_organization_id").notNull(),
  relationshipType: text("relationship_type").notNull(),
  status: text("status").notNull().default("proposed"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const programOrganizationAffiliations = pgTable("program_organization_affiliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  affiliationType: text("affiliation_type").notNull(),
  tenantAccessMode: text("tenant_access_mode").notNull().default("none"),
  visibility: text("visibility").notNull().default("program"),
  status: text("status").notNull().default("invited"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const programAffiliations = pgTable("program_affiliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  affiliationType: text("affiliation_type").notNull(),
  representedOrganizationId: uuid("represented_organization_id"),
  status: text("status").notNull().default("invited"),
  visibility: text("visibility").notNull().default("program"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  roleKey: text("role_key").primaryKey(),
  label: text("label"),
  defaultScope: text("default_scope"),
});

export const permissions = pgTable("permissions", {
  permissionKey: text("permission_key").primaryKey(),
  description: text("description"),
});

export const rolePermissions = pgTable("role_permissions", {
  roleKey: text("role_key").notNull(),
  permissionKey: text("permission_key").notNull(),
});

export const roleAssignments = pgTable("role_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id"),
  userId: uuid("user_id").notNull(),
  roleKey: text("role_key").notNull(),
  scopeType: text("scope_type").notNull(),
  scopeId: uuid("scope_id"),
  status: text("status").notNull().default("active"),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id"),
  programId: uuid("program_id"),
  offeringId: uuid("offering_id"),
  groupId: uuid("group_id"),
  tokenHash: text("token_hash").notNull(),
  email: text("email"),
  displayName: text("display_name"),
  role: text("role").notNull().default("learner"),
  invitedByUserId: uuid("invited_by_user_id"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  acceptedByUserId: uuid("accepted_by_user_id"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** All tenant-scoped tables + their org-id column — used by the Slice 2 RLS check. */
export const schema = {
  profiles, organizations, challenges, challengeStageConfig, stageNodes, joinCodes,
  orgPermissionDefaults, orgMemberships, studentRegistrations, programs, integrations,
  registeredApps, offerings, registrations, participants, appLaunchTokens, auditEvents, entitlements,
};

/** Demo-mode auth (Supabase unconfigured): one row per login. Token == id. */
export const demoAuthUsers = pgTable("demo_auth_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


/** Platform-level settings (Nexus branding etc.) — key/value. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Small binary assets (logos) stored as base64 — durable on serverless. */
export const storedFiles = pgTable("stored_files", {
  key: text("key").primaryKey(),
  contentType: text("content_type").notNull(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
