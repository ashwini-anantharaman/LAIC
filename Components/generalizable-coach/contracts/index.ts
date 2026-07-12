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
} from "./generated/index.js";

export {
  validate,
  schemas,
  CONTRACTS_SCHEMA_VERSION,
  type ContractName,
  type ValidationResult,
} from "./validate.js";
