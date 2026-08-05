#!/usr/bin/env tsx
/**
 * One-off: apply BridgePlatform migration 0021 (coach assignments, Phase 3)
 * to the configured database. Same rationale as applyBridge0019/0020.
 *
 *   npx tsx scripts/applyBridge0021.ts
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
  "0021_assignments.sql",
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
      select table_name from information_schema.tables
      where table_name = 'bridge_assignments'`;
    console.log("created:", JSON.stringify(check));
    return 0;
  } finally {
    await sql.end();
  }
}

process.exit(await main());
