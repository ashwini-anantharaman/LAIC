#!/usr/bin/env tsx
/**
 * One-off: apply BridgePlatform migration 0019 (org scoping for
 * bridge_kb_sessions / bridge_kb_library) to the configured database.
 * The bridge pack mirror (migrations/platforms/bridge/0001) carries the same
 * end-state; this applies it directly since the full core replay currently
 * aborts before reaching the packs (org_memberships_role_check drift at 0004).
 *
 *   npx tsx scripts/applyBridge0019.ts
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
  "0019_session_library_org_scope.sql",
);

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Set DATABASE_URL first.");
    return 1;
  }
  const sql = postgres(url, { prepare: false, onnotice: () => {} });

  const state = () =>
    sql`select table_name,
               count(*) filter (where program_organization_id is not null) as scoped,
               count(*) as total
        from (
          select 'bridge_kb_sessions' as table_name, program_organization_id from bridge_kb_sessions
          union all
          select 'bridge_kb_library', program_organization_id from bridge_kb_library
        ) t
        group by table_name order by table_name`;

  try {
    await sql.unsafe(readFileSync(MIGRATION, "utf8"));
    console.log("after:", JSON.stringify(await state()));
    return 0;
  } finally {
    await sql.end();
  }
}

process.exit(await main());
