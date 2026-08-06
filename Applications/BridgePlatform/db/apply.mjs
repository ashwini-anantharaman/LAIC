#!/usr/bin/env node
// Migration runner. Applies every db/migrations/*.sql not yet in the
// bridge_migrations ledger, in filename order, through the service-role key —
// no browser, no DB password.
//
//   node db/apply.mjs            # apply pending migrations to prod
//   node db/apply.mjs --status   # list applied vs pending, apply nothing
//   node db/apply.mjs --bootstrap# print the one-time bootstrap SQL and exit
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
// apps/bridge-web/.env.local (or the environment). Idempotent: a migration is
// recorded in the ledger only after it succeeds, and each runs in one
// bridge_exec_migration call (statements share a transaction via plpgsql).

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "migrations");
const ENV_FILE = join(HERE, "..", "apps", "bridge-web", ".env.local");

function loadEnv() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      if (out[k] === undefined) out[k] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* env file optional when the vars are already in the environment */
  }
  const url = out.NEXT_PUBLIC_SUPABASE_URL;
  const key = out.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY " +
        `(looked in the environment and ${ENV_FILE}).`,
    );
    process.exit(1);
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function rpc({ url, key }, fn, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function ledger(env) {
  // A plain PostgREST select on the ledger table.
  const res = await fetch(
    `${env.url}/rest/v1/bridge_migrations?select=filename`,
    { headers: { apikey: env.key, Authorization: `Bearer ${env.key}` } },
  );
  if (res.status === 404 || !res.ok) return null; // table missing → not bootstrapped
  return new Set((await res.json()).map((r) => r.filename));
}

const BOOTSTRAP_HINT =
  "Runner not bootstrapped. Run db/_bootstrap.sql once (Supabase SQL editor or " +
  "any DDL connection), then re-run `node db/apply.mjs`.";

async function main() {
  const arg = process.argv[2];
  if (arg === "--bootstrap") {
    process.stdout.write(readFileSync(join(HERE, "_bootstrap.sql"), "utf8"));
    return;
  }

  const env = loadEnv();
  const applied = await ledger(env);
  if (applied === null) {
    console.error(BOOTSTRAP_HINT);
    process.exit(2);
  }

  const files = readdirSync(MIGRATIONS)
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort();
  const pending = files.filter((f) => !applied.has(f));

  if (arg === "--status") {
    console.log(`applied: ${files.length - pending.length}   pending: ${pending.length}`);
    for (const f of pending) console.log(`  pending  ${f}`);
    return;
  }

  if (!pending.length) {
    console.log("Up to date — no pending migrations.");
    return;
  }

  console.log(`Applying ${pending.length} migration(s):`);
  for (const f of pending) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    process.stdout.write(`  ${f} … `);
    const r = await rpc(env, "bridge_exec_migration", { migration_sql: sql });
    if (!r.ok) {
      console.log("FAILED");
      console.error(`\n${f} failed (HTTP ${r.status}):\n${r.text}\n`);
      console.error("Stopped. Fix the migration and re-run; earlier ones are recorded.");
      process.exit(1);
    }
    // Record only after the DDL succeeded.
    const rec = await rpc(env, "bridge_exec_migration", {
      migration_sql: `insert into bridge_migrations (filename) values (${literal(f)}) on conflict do nothing;`,
    });
    if (!rec.ok) {
      console.log("APPLIED but LEDGER WRITE FAILED");
      console.error(`\nCould not record ${f} (HTTP ${rec.status}): ${rec.text}`);
      process.exit(1);
    }
    console.log("ok");
  }
  console.log("Done.");
}

// Minimal SQL string literal (filenames are ASCII, no quotes — but be safe).
function literal(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
