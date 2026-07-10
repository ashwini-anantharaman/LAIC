#!/usr/bin/env tsx
/**
 * Apply platform schema to Supabase Postgres when DATABASE_URL is configured.
 *
 * Usage:
 *   export DATABASE_URL='postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres'
 *   npm run migrate
 *
 * Get the connection string from Supabase Dashboard → Project Settings → Database.
 * SQL is read from the Python backend's supabase/ folder (single source of truth).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const _here = dirname(fileURLToPath(import.meta.url));
// backend-ts/scripts -> ../../backend/supabase
const SQL_DIR = join(_here, "..", "..", "backend", "supabase");
// Same files, same order as backend/scripts/run_platform_migrations.py.
// (migration_v2.sql is intentionally excluded — it is a legacy patch for
// already-applied schema.sql installs, not part of a fresh migration.)
const SQL_FILES = [
  join(SQL_DIR, "schema.sql"),
  join(SQL_DIR, "migration_platform.sql"),
  join(SQL_DIR, "migration_programs.sql"),
  join(SQL_DIR, "migration_nexus_addendum.sql"),
  join(SQL_DIR, "migration_offerings_apps_hook.sql"),
  join(SQL_DIR, "migration_audit_entitlements.sql"),
];

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error(
      "Set DATABASE_URL to your Supabase Postgres connection string.\n" +
        "Until then, the backend uses local JSON storage in backend/.local_data/ for platform tables.",
    );
    return 1;
  }

  const sql = postgres(url, { max: 1 });
  try {
    for (const sqlPath of SQL_FILES) {
      if (!existsSync(sqlPath)) {
        console.error(`Missing ${sqlPath}`);
        return 1;
      }
      console.log(`Running ${sqlPath.split(/[\\/]/).pop()}...`);
      await sql.unsafe(readFileSync(sqlPath, "utf-8"));
      console.log("  OK");
    }
  } finally {
    await sql.end();
  }

  console.log(
    "Migrations complete. Restart the backend to use Supabase tables instead of local storage.",
  );
  return 0;
}

main().then((code) => process.exit(code));
