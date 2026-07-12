#!/usr/bin/env tsx
/**
 * One-shot migration of the local JSON store → Postgres.
 *
 * Moves the platform DATA tables (orgs, profiles, memberships, programs,
 * offerings, apps, stage nodes, entitlements, audit, …). Auth credentials
 * (platform_auth_users.json) STAY local — in the no-Supabase setup the backend
 * still authenticates against the local auth store; Postgres holds the data,
 * linked by user id.
 *
 * Profiles are made org-scoped on the way in (auth_user_id = id, organization_id
 * from the membership), matching migration 0010. FK order is bypassed with
 * session_replication_role = replica (superuser) so rows can load in any order.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nexus_dev \
 *     LOCAL_DATA_DIR=../backend/.local_data npx tsx scripts/importLocalToPostgres.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const _here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.LOCAL_DATA_DIR || join(_here, "..", "..", "backend", ".local_data");

// local file (without platform_ prefix / .json) → postgres table
const TABLES: Array<[string, string]> = [
  ["organizations", "organizations"],
  ["profiles", "profiles"],
  ["challenges", "challenges"],
  ["stage_nodes", "stage_nodes"],
  ["programs", "programs"],
  ["memberships", "org_memberships"],
  ["permission_defaults", "org_permission_defaults"],
  ["offerings", "offerings"],
  ["registered_apps", "registered_apps"],
  ["entitlements", "entitlements"],
  ["integrations", "integrations"],
  ["join_codes", "join_codes"],
  ["registrations", "registrations"],
  ["participants", "participants"],
  ["audit_events", "audit_events"],
];

type Row = Record<string, unknown>;

function readLocal(name: string): Row[] {
  const p = join(DATA_DIR, `platform_${name}.json`);
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL to the Postgres target.");
    return 1;
  }
  const sql = postgres(url, { max: 1 });

  // profile_id -> org_id, from memberships (first).
  const orgByProfile = new Map<string, string>();
  for (const m of readLocal("memberships")) {
    const pid = m.profile_id as string;
    if (pid && !orgByProfile.has(pid)) orgByProfile.set(pid, m.org_id as string);
  }

  try {
    // Column sets per table.
    const cols = new Map<string, Set<string>>();
    for (const [, table] of TABLES) {
      const rows = await sql<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = ${table}`;
      cols.set(table, new Set(rows.map((r) => r.column_name)));
    }

    let grand = 0;
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`; // bypass FK order
      for (const [file, table] of TABLES) {
        const columns = cols.get(table)!;
        const rows = readLocal(file);
        let n = 0;
        for (const raw of rows) {
          const row: Row = {};
          for (const [k, v] of Object.entries(raw)) if (columns.has(k)) row[k] = v;
          if (table === "profiles") {
            if (columns.has("auth_user_id") && row.auth_user_id == null) row.auth_user_id = raw.id;
            if (columns.has("organization_id") && row.organization_id == null) {
              row.organization_id = orgByProfile.get(raw.id as string) ?? null;
            }
          }
          if (Object.keys(row).length === 0) continue;
          await tx`insert into ${tx(table)} ${tx(row)} on conflict (id) do nothing`;
          n += 1;
        }
        if (n) console.log(`  ${table}: ${n}`);
        grand += n;
      }
    });
    console.log(`\n✅ Imported ${grand} rows into Postgres.`);
    return 0;
  } finally {
    await sql.end();
  }
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error("Import failed:", e);
  process.exit(1);
});
