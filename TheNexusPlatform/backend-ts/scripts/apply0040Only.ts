#!/usr/bin/env tsx
/**
 * One-off: apply migration 0040 (bridge_learner_coaches — a learner can hire
 * several coaches; see the migration's header). Same rationale as
 * apply0028Only: the full runner replays history and trips on legacy data.
 *
 *   npx tsx scripts/apply0040Only.ts
 */

import "dotenv/config";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const _here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(_here, "..", "migrations", "0040_bridge_learner_coaches.sql");

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Set DATABASE_URL first.");
    return 1;
  }
  const sql = postgres(url, { prepare: false, onnotice: () => {} });
  try {
    await sql.unsafe(readFileSync(MIGRATION, "utf8"));
    const check = await sql`select count(*) as n from bridge_learner_coaches`;
    console.log("bridge_learner_coaches rows:", JSON.stringify(check));
    return 0;
  } finally {
    await sql.end();
  }
}

process.exit(await main());
