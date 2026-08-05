#!/usr/bin/env tsx
/**
 * One-off: apply BridgePlatform migration 0023 (library collections
 * provenance, library rework Phase A). Same rationale as applyBridge0019-21.
 *
 *   npx tsx scripts/applyBridge0023.ts
 */

import "dotenv/config";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const _here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  _here,
  "..", "..", "..",
  "Applications", "BridgePlatform", "db", "migrations",
  "0023_library_collections.sql",
);

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Set DATABASE_URL first.");
    return 1;
  }
  const sql = postgres(url, { prepare: false, onnotice: () => {} });
  try {
    await sql.unsafe(readFileSync(MIGRATION, "utf8"));
    const check = await sql`
      select scope_level, count(*) as n from bridge_kb_library group by scope_level order by scope_level`;
    console.log("library scopes:", JSON.stringify(check));
    const s = await sql`
      select count(*) filter (where nexus_program_id is not null) as scoped, count(*) as total
      from bridge_kb_sessions`;
    console.log("sessions program-scoped:", JSON.stringify(s));
    return 0;
  } finally {
    await sql.end();
  }
}

process.exit(await main());
