/**
 * The contracts schema version, on its own.
 *
 * It lives here rather than in validate.ts because seven modules across
 * `platform/*` need only this constant, and importing it from the barrel used
 * to drag the whole runtime validator in with it: ajv, ajv-formats, and a
 * `readdirSync` of contracts/schemas at module load. That is fine for the HTTP
 * service and the tests, and fatal for an embedded host — a bundler will not
 * copy the schema directory, so the read fails at import time and the coach
 * cannot be imported at all.
 *
 * Keeping the constant dependency-free is what makes the domain-free core
 * entrypoint (../core.ts) importable from a Next app with no build step.
 * validate.ts and contracts/index.ts both re-export it, so nothing that
 * imported it from there needs to change.
 */
export const CONTRACTS_SCHEMA_VERSION = "1.0.0";
