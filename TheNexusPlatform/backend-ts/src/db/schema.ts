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
  email: text("email").notNull(),
  role: text("role").notNull().default("student"),
  name: text("name"),
  grade: text("grade"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  ownerId: uuid("owner_id"),
  settings: jsonb("settings").notNull().default({}),
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
  instructorLabel: text("instructor_label"),
  learnerLabel: text("learner_label"),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const registrations = pgTable("registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  programId: uuid("program_id"),
  offeringId: uuid("offering_id").notNull(),
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
  offeringId: uuid("offering_id").notNull(),
  stageNodeId: uuid("stage_node_id"),
  userId: uuid("user_id"),
  participantType: text("participant_type").notNull().default("learner"),
  status: text("status").notNull().default("active"),
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

/** All tenant-scoped tables + their org-id column — used by the Slice 2 RLS check. */
export const schema = {
  profiles, organizations, challenges, challengeStageConfig, stageNodes, joinCodes,
  orgPermissionDefaults, orgMemberships, studentRegistrations, programs, integrations,
  registeredApps, offerings, registrations, participants, appLaunchTokens, auditEvents, entitlements,
};
