#!/usr/bin/env tsx
/**
 * One-off: apply ONLY migration 0028 (program-scoped participants — drop the
 * NOT NULL on registrations/participants.offering_id) to the configured DB.
 *
 * Why not `npm run migrate`: the full replay currently aborts at 0004 on a
 * pre-existing data/constraint drift (org_memberships_role_check), so it never
 * reaches 0028. This applies the single missing change, with before/after
 * verification. Idempotent — DROP NOT NULL on an already-nullable column is a
 * no-op.
 *
 *   npx tsx scripts/apply0028Only.ts
 */

import "dotenv/config";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const _here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(_here, "..", "migrations", "0028_program_scoped_participants.sql");

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Set DATABASE_URL first.");
    return 1;
  }
  const sql = postgres(url, { prepare: false, onnotice: () => {} });

  const state = () =>
    sql`select table_name, is_nullable from information_schema.columns
        where column_name = 'offering_id' and table_name in ('registrations','participants')
        order by table_name`;

  try {
    console.log("before:", JSON.stringify(await state()));
    await sql.unsafe(readFileSync(MIGRATION, "utf8"));
    console.log("after: ", JSON.stringify(await state()));
    return 0;
  } finally {
    await sql.end();
  }
}

process.exit(await main());
