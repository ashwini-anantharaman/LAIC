#!/usr/bin/env tsx
/**
 * One-off: apply BridgePlatform migration 0020 (play submissions + coach
 * comments, coach/learner Phase 2) to the configured database. Same rationale
 * as applyBridge0019: the full core replay aborts before the platform packs.
 *
 *   npx tsx scripts/applyBridge0020.ts
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
  "0020_play_submissions.sql",
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
      where table_name in ('bridge_play_submissions','bridge_play_comments')
      order by table_name`;
    console.log("created:", JSON.stringify(check));
    return 0;
  } finally {
    await sql.end();
  }
}

process.exit(await main());
