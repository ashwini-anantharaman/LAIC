/**
 * Runtime validation for the LAIC coach contracts (M0).
 *
 * Loads every JSON Schema in contracts/schemas/ into a single Ajv instance so
 * the HTTP surface (and tests) can validate inbound/outbound objects against
 * the SAME schemas the TypeScript types are generated from. One source of
 * truth: schema → generated type (compile time) AND schema → validator (runtime).
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(here, "schemas");

/** The version producers stamp on new contract objects. */
export const CONTRACTS_SCHEMA_VERSION = "1.0.0";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

/** Raw JSON Schemas, keyed by title (e.g. "ActivityEvent"). */
export const schemas: Record<string, Record<string, unknown>> = {};

for (const file of readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".schema.json"))) {
  const schema = JSON.parse(readFileSync(path.join(SCHEMA_DIR, file), "utf8")) as {
    title: string;
  };
  schemas[schema.title] = schema as Record<string, unknown>;
  ajv.addSchema(schema, schema.title);
}

/** The core contract names (8 from M0 + the M2 config contracts). */
export type ContractName =
  | "ActivityEvent"
  | "KnowledgeChunk"
  | "CoachProfile"
  | "CoachingPolicy"
  | "KnowledgeScope"
  | "Recommendation"
  | "LearnerDomainProfile"
  | "CoachInstance"
  | "CoachingPolicyProfile"
  | "CoachCapabilityScope";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate `data` against a named contract schema. Throws on unknown name. */
export function validate(name: ContractName | string, data: unknown): ValidationResult {
  const fn = ajv.getSchema(name) as ValidateFunction | undefined;
  if (!fn) throw new Error(`Unknown contract schema: ${name}`);
  const valid = fn(data) as boolean;
  const errors = valid
    ? []
    : (fn.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`);
  return { valid, errors };
}
