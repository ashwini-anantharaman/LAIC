/**
 * @bridge/pg-stores
 *
 * Supabase/Postgres implementations of the four store seams, over the schema
 * in db/migrations (0001-0005). Server-side only — constructed with the
 * service-role key (RLS bypass); tenant checks live in the service layer by
 * design (execution plan §6). The in-memory/JSON dev stores remain the test
 * and offline-dev backends; selection happens in bridge-web via STORE_BACKEND.
 */

export { check, createPgClient, type PgConfig } from "./client";
export { PgKnowledgeStore } from "./knowledge";
export { PgSessionStore } from "./sessions";
export { PgProfileStore } from "./profiles";
export { PgProgressStore } from "./progress";
