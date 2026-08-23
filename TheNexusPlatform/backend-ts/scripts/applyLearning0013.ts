#!/usr/bin/env tsx
/** One-off: apply learning migration 0013 (learning_object_versions). */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
const _here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(_here, "..", "migrations", "platforms", "learning", "0013_object_versions.sql");
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
await sql.unsafe(readFileSync(MIGRATION, "utf8"));
const [c] = await sql`select count(*)::int n from learning_object_versions`;
console.log(`learning_object_versions ready — ${c.n} rows`);
await sql.end();
