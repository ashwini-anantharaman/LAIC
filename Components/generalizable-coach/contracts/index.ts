/**
 * @laic/coach contracts — the schema-first foundation (LAIC M0).
 *
 * The eight core contracts are defined once as JSON Schemas in ./schemas, from
 * which both the TypeScript types (./generated, via `npm run contracts:gen`)
 * and the runtime validator (./validate) are derived. Nothing here is
 * hand-mirrored; a CI drift check fails the build if generated types fall out
 * of sync with the schemas.
 */
export type {
  ActivityEvent,
  KnowledgeChunk,
  CoachProfile,
  CoachingPolicy,
  KnowledgeScope,
  Recommendation,
  LearnerDomainProfile,
  CoachInstance,
  CoachingPolicyProfile,
  CoachCapabilityScope,
} from "./generated/index";

export {
  validate,
  schemas,
  type ContractName,
  type ValidationResult,
} from "./validate";

// Sourced from its own module, not the validator: this barrel pulls ajv and
// reads contracts/schemas from disk at import time, which an embedded host
// cannot do. Code that needs only the version imports ./version.js directly
// (see the note there); it stays exported here for the service and the tests.
export { CONTRACTS_SCHEMA_VERSION } from "./version";
