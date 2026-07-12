/**
 * Drizzle client over postgres.js — Nexus v0.4 canonical data path.
 *
 * v0.4 portability rule #1: business logic goes through this ORM with standard
 * SQL, never through Supabase's client-side query helpers. This is the seam that
 * later (Slice 2) runs tenant queries on an RLS-subject connection with a
 * per-request org/user context bound via `SET LOCAL`.
 *
 * Falls back to "not configured" when DATABASE_URL is unset, so the existing
 * local JSON store keeps working for offline/demo runs.
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getSettings } from "../config";
import * as schema from "./schema";

let _sql: ReturnType<typeof postgres> | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;

export function databaseUrl(): string {
  return getSettings().databaseUrl;
}

export function dbEnabled(): boolean {
  return Boolean(databaseUrl());
}

/** Lazily-created shared connection pool + Drizzle instance. */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db;
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not configured");
  _sql = postgres(url, { max: 10 });
  _db = drizzle(_sql, { schema });
  return _db;
}

/** Close the pool (tests / graceful shutdown). */
export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
    _db = null;
  }
}

export { schema };
