#!/usr/bin/env tsx
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
const _here = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
await sql.unsafe(readFileSync(join(_here, "..", "migrations", "platforms", "learning", "0014_drives.sql"), "utf8"));
const cols = await sql`select column_name from information_schema.columns where table_name='learning_drive_permissions' order by ordinal_position`;
console.log("learning_drive_permissions:", cols.map((c:any)=>c.column_name).join(", "));
const dc = await sql`select column_name from information_schema.columns where table_name='learning_collections' and column_name like 'owner%'`;
console.log("learning_collections gained:", dc.map((c:any)=>c.column_name).join(", "));
await sql.end();
