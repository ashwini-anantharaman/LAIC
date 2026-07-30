/**
 * @bridge/pg-stores
 *
 * Supabase/Postgres implementations of the store seams over db/migrations
 * (identity: 0002/0010/0012; knowledge rework: 0013). Server-side only —
 * constructed with the service-role key (RLS bypass); tenant checks live in
 * the service layer by design. The in-memory/JSON dev stores remain the test
 * and offline-dev backends; selection happens in bridge-web via STORE_BACKEND.
 */

export { check, createPgClient, type PgConfig } from "./client";
export { PgProfileStore } from "./profiles";
export { PgAuditStore } from "./audit";
export { PgKbStore } from "./kb";
export { PgSessionStore } from "./sessions";
export { PgLibraryStore } from "./library";
export { PgSubmissionStore } from "./submissions";
export { PgAssignmentStore } from "./assignments";
