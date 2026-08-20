import { z } from "zod";

import { HttpError } from "./httpError";

// ── Shared literal enums (mirror schemas_platform.py; DB CHECK constraints match) ──
export const signupType = z.enum(["org", "administrator", "teacher", "student"]);
export const stageType = z.enum(["international", "national", "state", "chapter"]);
export const accessLevel = z.enum(["view", "edit", "per_level"]);
// Stored membership role. "teacher" is renamed to the canonical "instructor" per the
// Nexus addendum; the public-facing signup vocabulary ("Teacher"/"Coach" by category)
// still comes from roleLabel(), not from this stored value.
export const membershipRole = z.enum(["owner", "administrator", "instructor"]);
export const joinCodeKind = z.enum(["student", "teacher", "administrator"]);
// Categories are org-defined free text (the old "game"/"edu" presets remain
// meaningful: "game" flips role words to Coach/Player and skips the edu stage
// scaffold; anything else behaves like an education program).
export const programCategory = z.string().trim().min(1).max(60);
export const deliveryMethod = z.enum(["join_code", "email_direct"]);
export const integrationType = z.enum(["discord"]);
export const integrationPermissionLevel = z.enum(["can_edit", "can_view", "per_level"]);
export const viewEdit = z.enum(["view", "edit"]);

export type StageType = z.infer<typeof stageType>;
export type ProgramCategory = z.infer<typeof programCategory>;
export type MembershipRole = z.infer<typeof membershipRole>;

// Pydantic (lax mode) coerces "17" -> 17 for int fields; match that without
// z.coerce (which would also coerce null -> 0).
const intLike = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
  z.number().int(),
);

// Datetimes arrive as ISO strings and stay strings end-to-end (FastAPI parsed
// then re-serialized; we pass through).
const isoDateTime = z.string();

const jsonRecord = z.record(z.string(), z.any());

// ── Per-program feature accessibility ───────────────────────────────────────
// When an org admin creates a program they pick which feature-areas are
// accessible inside it. These are the same areas custom roles grant access to
// (Team & Roles) — a role can only grant an area the program has enabled.
export const PROGRAM_FEATURE_KEYS = [
  "learning",
  "bridge",
  /** The Bridge Bird mobile app — its own Access Catalogue (provider club-app),
   *  provisioned No/Partial/Full like a platform. */
  "clubapp",
  "appbuilder",
  "community",
  "teams",
  "partners",
] as const;
export type ProgramFeatureKey = (typeof PROGRAM_FEATURE_KEYS)[number];

// ── Apps content can be published TO ────────────────────────────────────────
//
// The destination a "content access granter" picks when publishing. A constant,
// not a table read, because there is nothing to read: `registered_apps` (core
// 0005) has ids and CRUD but no row for Bridge Bird, which is a hardcoded Expo
// client pinned to a literal program id. Inventing a row to point at would be
// fiction dressed as a foreign key.
//
// This IS the migration target though — when Bridge Bird becomes a real
// registered_apps record, this list becomes a query and `key` stays as the
// stable slug already written into learning_object_app_targets.app_key.
export const CONTENT_APP_TARGETS = [
  { key: "clubapp", label: "Bridge Bird" },
] as const;
export const CONTENT_APP_TARGET_KEYS: ReadonlySet<string> = new Set(
  CONTENT_APP_TARGETS.map((a) => a.key),
);

// New programs get everything on; the org admin then trims what they don't want.
export const DEFAULT_PROGRAM_FEATURES: Record<ProgramFeatureKey, boolean> = {
  learning: true,
  bridge: true,
  clubapp: true,
  appbuilder: true,
  community: true,
  teams: true,
  partners: true,
};

export const programFeatures = z
  .object(
    Object.fromEntries(PROGRAM_FEATURE_KEYS.map((k) => [k, z.boolean()])) as Record<
      ProgramFeatureKey,
      z.ZodBoolean
    >,
  )
  .partial();
export type ProgramFeatures = Record<ProgramFeatureKey, boolean>;

/** Fill any unspecified feature with the default (all-on), dropping unknown keys. */
export function normalizeProgramFeatures(input?: Record<string, unknown> | null): ProgramFeatures {
  const out = { ...DEFAULT_PROGRAM_FEATURES };
  for (const k of PROGRAM_FEATURE_KEYS) {
    if (input && typeof input[k] === "boolean") out[k] = input[k] as boolean;
  }
  return out;
}

/** Per-platform "Partial" provisioning: a capability subset per platform area.
 *  Keys are platform feature keys (learning/bridge); server validates the ids. */
export const featureAccessSchema = z.record(
  z.string(),
  z.object({ capabilities: z.array(z.string()) }),
);

export const programFeaturesUpdate = z.object({
  features: programFeatures,
  // Per-program platform lock: may this program's own admins/members open the
  // platform runtimes (Learning, App Shell, Bridge)? Optional so callers that
  // only touch feature toggles are unchanged.
  platforms_open: z.boolean().optional(),
  // Partial-access capability subsets per platform area (optional).
  feature_access: featureAccessSchema.optional(),
});

// ── Platform request schemas ────────────────────────────────────────────────

export const programInput = z.object({
  name: z.string(),
  category: programCategory,
  secondary_categories: z.array(z.string().trim().min(1).max(60)).optional(),
  description: z.string().nullish(),
  icon: z.string().nullish(),
  // Configurable per-program overrides for the instructor/learner display words
  // (defaults are derived from category in roleLabel() when unset).
  instructor_label: z.string().nullish(),
  learner_label: z.string().nullish(),
  // Which feature-areas are accessible inside this program (see PROGRAM_FEATURE_KEYS).
  features: programFeatures.optional(),
  // Edu: which single stage level this program's admin group tree is rooted at.
  stage_type: stageType.nullish(),
  // Game: flat "class" names for this program (no multi-level hierarchy).
  class_names: z.array(z.string()).default([]),
});
export type ProgramInput = z.infer<typeof programInput>;

const permissionDefaultInput = z.object({
  default_access: accessLevel,
  per_level_overrides: z.record(z.string(), viewEdit).nullish(),
});
export type PermissionDefaultInput = z.infer<typeof permissionDefaultInput>;

// Recursive stage-node input (self-referencing children).
export type StageNodeInputT = {
  stage_type: z.infer<typeof stageType>;
  name: string;
  discord_url?: string | null;
  event_at?: string | null;
  program_id?: string | null;
  children?: StageNodeInputT[];
};

export const stageNodeInput: z.ZodType<StageNodeInputT> = z.lazy(() =>
  z.object({
    stage_type: stageType,
    name: z.string(),
    discord_url: z.string().nullish(),
    event_at: isoDateTime.nullish(),
    program_id: z.string().nullish(),
    children: z.array(stageNodeInput).default([]),
  }),
);

export const signupSchema = z.object({
  signup_type: signupType,
  org_name: z.string().nullish(),
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().nullish(),
  join_code: z.string().nullish(),
});

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const createOrgSchema = z.object({
  name: z.string(),
});

export const orgThemeUpdateSchema = z.object({
  accent_color: z.string().nullish(),
  logo_url: z.string().nullish(),
});

export const orgSetupSchema = z.object({
  has_challenge: z.boolean().default(false),
  challenge_name: z.string().nullish(),
  stage_types: z.array(stageType).default([]),
  permission_defaults: z
    .record(z.enum(["administrator", "teacher"]), permissionDefaultInput)
    .default({}),
  initial_stages: z.array(stageNodeInput).default([]),
  discord_link: z.string().nullish(),
  discord_permission_level: integrationPermissionLevel.nullish(),
  programs: z.array(programInput).default([]),
});

export const createJoinCodeSchema = z.object({
  kind: joinCodeKind.default("student"),
  delivery_method: deliveryMethod.default("join_code"),
  email: z.string().email().nullish(),
  max_uses: intLike.nullish(),
  expires_at: isoDateTime.nullish(),
});

export const integrationInputSchema = z.object({
  integration_type: integrationType,
  config: jsonRecord.default({}),
  permission_level: integrationPermissionLevel.default("per_level"),
  program_id: z.string().nullish(),
});

export const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["administrator", "teacher"]),
  stage_node_id: z.string(),
  access: viewEdit.default("view"),
});

export const updateMemberSchema = z.object({
  access: viewEdit,
});

export const registerViaJoinCodeSchema = z.object({
  display_name: z.string().nullish(),
});

export const launchExchangeSchema = z.object({
  launch_token: z.string(),
});

// ── Offerings, Registered Apps, and the Signup Hook (Nexus v0.3) ────────────
export const offeringType = z.enum([
  "course", "challenge", "app", "cohort", "class", "event", "assessment", "pilot",
]);
export const offeringStatus = z.enum([
  "draft", "private_beta", "open", "closed", "completed", "archived",
]);
export const approvalMode = z.enum(["auto_approve", "manual_approve"]);
export const platformModule = z.enum(["nexus_only", "learning", "coaching", "bridge", "mixed"]);
export const allowedIdentifiers = z.enum(["email", "phone", "both"]);

/**
 * A username usable as a sign-in identifier. Deliberately narrow: 3–32 chars of
 * letters, digits, dot, underscore or hyphen. No "@" — that keeps username and
 * email unambiguous when one field accepts either. Mirrored by the
 * profiles_username_shape constraint in migration 0038.
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^[A-Za-z0-9._-]+$/, "Use only letters, numbers, dot, underscore or hyphen");

/**
 * A profile picture as a base64 data URL.
 *
 * Mirrors the profiles_avatar_shape constraint in migration 0040: one of the
 * three formats a phone camera produces, capped at 200 kB of base64. The app
 * downsizes to 256x256 JPEG first, which lands around 40 kB — the cap is a
 * backstop against a client that skips that step, not the expected size.
 */
export const avatarDataUrlSchema = z
  .string()
  .max(200_000, "That picture is too large")
  .regex(
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/,
    "Expected a base64 JPEG, PNG or WebP data URL",
  );

/** Minimum we are willing to set as a password on someone's behalf. */
export const adminSetPasswordSchema = z
  .string()
  .min(3, "Password must be at least 3 characters")
  .max(128, "Password must be at most 128 characters");
export const appStatus = z.enum(["active", "paused", "revoked"]);
export const registrationSource = z.enum([
  "app_hook", "admin_add", "coach_add", "invite_link", "bulk_import",
]);
export const registrationStatus = z.enum([
  "pending_review", "approved", "rejected", "waitlisted", "withdrawn", "directly_added",
]);
export const participantType = z.enum([
  "learner", "coach", "reviewer", "advisor", "volunteer", "organizer", "instructor",
]);
export const participantStatus = z.enum(["active", "inactive", "completed", "removed"]);
export const signupFieldType = z.enum(["text", "number", "email", "phone", "select", "boolean"]);

export type OfferingStatus = z.infer<typeof offeringStatus>;
export type PlatformModule = z.infer<typeof platformModule>;
export type ParticipantType = z.infer<typeof participantType>;
export type RegistrationStatus = z.infer<typeof registrationStatus>;

export const signupFieldDef = z.object({
  key: z.string(),
  label: z.string(),
  type: signupFieldType.default("text"),
  required: z.boolean().default(false),
  options: z.array(z.string()).nullish(),
});
export type SignupFieldDef = z.infer<typeof signupFieldDef>;

export const DEFAULT_SIGNUP_FIELDS: Array<Record<string, unknown>> = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "age", label: "Age", type: "number", required: false },
  { key: "email", label: "Email", type: "email", required: true },
];

/**
 * Normalize a stored signup-field dict to the full SignupFieldDef response
 * shape, applying the same defaults FastAPI's response_model does when it
 * serializes `SignupFieldDef(**f)` (type -> "text", required -> false,
 * options -> null). Keeps the JSON contract byte-compatible with the Python API.
 */
export function normalizeSignupField(f: Record<string, unknown>): Record<string, unknown> {
  return {
    key: f.key,
    label: f.label,
    type: f.type ?? "text",
    required: f.required ?? false,
    options: f.options ?? null,
  };
}

export const offeringCreateSchema = z.object({
  name: z.string(),
  offering_type: offeringType,
  slug: z.string().nullish(),
  stage_node_id: z.string().nullish(),
  description: z.string().nullish(),
  start_date: isoDateTime.nullish(),
  end_date: isoDateTime.nullish(),
  registration_open: z.boolean().default(false),
  approval_mode: approvalMode.default("manual_approve"),
  signup_fields: z.array(signupFieldDef).nullish(),
  platform_module: platformModule.default("nexus_only"),
  registered_app_id: z.string().nullish(),
  external_runtime_url: z.string().nullish(),
  participant_label_singular: z.string().nullish(),
  participant_label_plural: z.string().nullish(),
  metadata: jsonRecord.default({}),
});

export const offeringUpdateSchema = z.object({
  name: z.string().nullish(),
  status: offeringStatus.nullish(),
  description: z.string().nullish(),
  start_date: isoDateTime.nullish(),
  end_date: isoDateTime.nullish(),
  registration_open: z.boolean().nullish(),
  approval_mode: approvalMode.nullish(),
  signup_fields: z.array(signupFieldDef).nullish(),
  platform_module: platformModule.nullish(),
  registered_app_id: z.string().nullish(),
  external_runtime_url: z.string().nullish(),
  participant_label_singular: z.string().nullish(),
  participant_label_plural: z.string().nullish(),
  metadata: jsonRecord.nullish(),
});

export const appCreateSchema = z.object({
  app_name: z.string(),
  app_slug: z.string().nullish(),
  offering_id: z.string().nullish(),
  allowed_identifiers: allowedIdentifiers.default("email"),
  launch_url: z.string().nullish(),
  launch_context: jsonRecord.default({}),
});

export const appUpdateSchema = z.object({
  app_name: z.string().nullish(),
  offering_id: z.string().nullish(),
  allowed_identifiers: allowedIdentifiers.nullish(),
  status: appStatus.nullish(),
  launch_url: z.string().nullish(),
  launch_context: jsonRecord.nullish(),
});

export const hookRegistrationSchema = z.object({
  offering_id: z.string(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  name: z.string().nullish(),
  age: intLike.nullish(),
  field_data: jsonRecord.default({}),
});

export const adminAddRegistrationSchema = z.object({
  email: z.string().email(),
  name: z.string().nullish(),
  age: intLike.nullish(),
  phone: z.string().nullish(),
  stage_node_id: z.string().nullish(),
  participant_type: participantType.default("learner"),
  field_data: jsonRecord.default({}),
});

// ── Audit Log + Entitlements (Nexus v0.3 Sections 32 / 20) ──────────────────
export const moduleKey = z.enum(["nexus", "learning", "coaching", "analytics", "community"]);
export const entitlementStatus = z.enum(["active", "trial", "requested", "disabled"]);
export type ModuleKey = z.infer<typeof moduleKey>;

export const setEntitlementSchema = z.object({
  status: entitlementStatus,
});

// ── Game (mock scenario generator; schemas_game.py) ─────────────────────────
export const generateScenarioSchema = z.object({
  program_id: z.string(),
  game_type: z.string(),
  prompt: z.string().min(1),
});

const scenarioStep = z.object({
  narration: z.string(),
  dialogue: z.string().nullish(),
});

/** Validates Claude's JSON output for scenario generation (mirrors ScenarioResult). */
export const scenarioResultSchema = z.object({
  title: z.string(),
  setup: z.string(),
  steps: z.array(scenarioStep).default([]),
  outcome: z.string(),
});
export type ScenarioResult = z.infer<typeof scenarioResultSchema>;

// ── Parse helpers ────────────────────────────────────────────────────────────

/**
 * Parse a request body with a schema, raising a FastAPI-style 422 with the
 * `{ detail: [{ loc, msg, type }] }` array shape the frontends already parse.
 */
export function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const detail = result.error.issues.map((i) => ({
      loc: ["body", ...i.path],
      msg: i.message,
      type: i.code,
    }));
    throw new HttpError(422, detail);
  }
  return result.data;
}

/**
 * PATCH-body parser matching Pydantic's `model_dump(exclude_unset=True)`:
 * validates against the schema, then returns only the keys that were actually
 * present in the raw JSON — explicit `null` survives, absent keys are dropped.
 */
export function parsePatch<S extends z.ZodObject<z.ZodRawShape>>(
  schema: S,
  body: unknown,
): Partial<z.output<S>> {
  const parsed = parseBody(schema, body);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return parsed;
  }
  const raw = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(schema.shape)) {
    if (key in raw) out[key] = (parsed as Record<string, unknown>)[key];
  }
  return out as Partial<z.output<S>>;
}
