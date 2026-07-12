#!/usr/bin/env tsx
/**
 * Apply platform schema to Supabase Postgres when DATABASE_URL is configured.
 *
 * Usage:
 *   export DATABASE_URL='postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres'
 *   npm run migrate
 *
 * Get the connection string from Supabase Dashboard → Project Settings → Database,
 * or use a local Postgres (see .env.example).
 * SQL is read from backend-ts/migrations (this backend owns its schema — v0.4).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const _here = dirname(fileURLToPath(import.meta.url));
// backend-ts owns its schema now (canonical TS backend, v0.4). Migrations live
// in backend-ts/migrations and run in lexical order (0000_, 0001_, …).
const SQL_DIR = join(_here, "..", "migrations");
const SQL_FILES = existsSync(SQL_DIR)
  ? readdirSync(SQL_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join(SQL_DIR, f))
  : [];

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
