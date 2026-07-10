import { z } from "zod";

import { HttpError } from "./httpError";

export const stageType = z.enum(["international", "national", "state", "chapter"]);
export const accessLevel = z.enum(["view", "edit", "per_level"]);
export const joinCodeKind = z.enum(["student", "teacher", "administrator"]);
export const viewEdit = z.enum(["view", "edit"]);

const permissionDefaultInput = z.object({
  default_access: accessLevel,
  per_level_overrides: z.record(z.string(), viewEdit).nullish(),
});

// Recursive stage-node input (self-referencing children).
export type StageNodeInput = {
  stage_type: z.infer<typeof stageType>;
  name: string;
  discord_url?: string | null;
  event_at?: string | null;
  children?: StageNodeInput[];
};

const stageNodeInput: z.ZodType<StageNodeInput> = z.lazy(() =>
  z.object({
    stage_type: stageType,
    name: z.string(),
    discord_url: z.string().nullish(),
    // Accept ISO date-time strings (pydantic accepted datetime); kept as string.
    event_at: z.string().nullish(),
    children: z.array(stageNodeInput).default([]),
  }),
);

export const signupSchema = z.object({
  signup_type: z.enum(["org", "administrator", "teacher", "student"]),
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

export const orgSetupSchema = z.object({
  has_challenge: z.boolean().default(false),
  challenge_name: z.string().nullish(),
  stage_types: z.array(stageType).default([]),
  permission_defaults: z
    .record(z.enum(["administrator", "teacher"]), permissionDefaultInput)
    .default({}),
  initial_stages: z.array(stageNodeInput).default([]),
  discord_link: z.string().nullish(),
});

export const createJoinCodeSchema = z.object({
  kind: joinCodeKind.default("student"),
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

/**
 * Parse a request body with a schema, raising a FastAPI-style 422 with the
 * `{ detail: [{ msg }] }` array shape the frontend already understands.
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
