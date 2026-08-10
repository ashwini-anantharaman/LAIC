// Guard the seam between the two schema trees.
//
// One database, two sets of SQL, applied by two runners:
//   • db/migrations/                          — this repo, file per migration,
//                                               the source of truth for schema
//                                               evolution
//   • ../../TheNexusPlatform/backend-ts/migrations/
//       platforms/bridge/*.sql                — the bridge pack Nexus replays
//       0*.sql                                — Nexus's own migrations, which
//                                               also create a few bridge_ tables
//                                               (e.g. bridge_learner_coaches)
//
// The Nexus side deliberately mirrors only PART of the bridge schema — it has no
// business creating the KB internals or challenges. So "every table in both
// trees" is the wrong test; it reports 38 non-problems and gets ignored. Two
// things genuinely must hold:
//
//   RULE A (the one that has already broken production shape)
//     Every bridge_ table the NEXUS BACKEND QUERIES must be created somewhere in
//     Nexus's own migrations. Violating this ships code that works on a database
//     built by the bridge repo and fails on a fresh Nexus environment — exactly
//     what happened when getBridgeActivitySummary began reading
//     bridge_learner_coaches before 0040 was applied: /bridge/summary returned
//     500 and the app showed "…" forever with no error anywhere.
//
//   RULE B
//     A table both trees declare must agree on its columns, or the same code
//     reads different shapes depending on who built the database.
//
//   node db/checkTreeParity.mjs           → exits 1 on a violation
//   node db/checkTreeParity.mjs --list    → also lists the bridge-only tables
//
// Types, constraints and indexes are out of scope: they drift in ways that are
// usually harmless. A missing table or column never is.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BRIDGE_MIGRATIONS = join(here, "migrations");
const NEXUS_ROOT = join(here, "..", "..", "..", "TheNexusPlatform", "backend-ts");
const NEXUS_MIGRATIONS = join(NEXUS_ROOT, "migrations");
const NEXUS_PACK = join(NEXUS_MIGRATIONS, "platforms", "bridge");
const NEXUS_SRC = join(NEXUS_ROOT, "src");

// The hardening pass grants and policies whatever exists; it declares nothing.
const IGNORE_FILES = [/^9000_/];

const stripComments = (sql) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

/** table -> Set(columns), from every .sql directly in `dir`. */
function declaredIn(dir) {
  const tables = new Map();
  if (!existsSync(dir)) return tables;
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".sql")) continue;
    if (IGNORE_FILES.some((re) => re.test(file))) continue;
    const full = join(dir, file);
    if (!statSync(full).isFile()) continue;
    const sql = stripComments(readFileSync(full, "utf8"));

    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(bridge_\w+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi,
    )) {
      const cols = tables.get(m[1].toLowerCase()) ?? new Set();
      for (const line of m[2].split("\n")) {
        const col = line.trim().match(/^([a-z_][a-z0-9_]*)\s+/i);
        if (!col) continue;
        const name = col[1].toLowerCase();
        if (["primary", "unique", "foreign", "constraint", "check"].includes(name)) continue;
        cols.add(name);
      }
      tables.set(m[1].toLowerCase(), cols);
    }
    for (const m of sql.matchAll(
      /alter\s+table\s+(bridge_\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi,
    )) {
      const cols = tables.get(m[1].toLowerCase()) ?? new Set();
      cols.add(m[2].toLowerCase());
      tables.set(m[1].toLowerCase(), cols);
    }
  }
  return tables;
}

const merge = (...maps) => {
  const out = new Map();
  for (const m of maps)
    for (const [t, cols] of m) {
      const set = out.get(t) ?? new Set();
      for (const c of cols) set.add(c);
      out.set(t, set);
    }
  return out;
};

/**
 * Every bridge_ table the Nexus backend QUERIES, found by SQL context.
 *
 * Context, not an allowlist. The first version of this filtered candidates
 * against "tables declared somewhere", to drop the role strings that look exactly
 * like table names — bridge_coach, bridge_learner, bridge_reviewer. That filter
 * silently defeated RULE A: a table missing from BOTH trees is also missing from
 * the allowlist, so the one case the rule exists to catch was the one case it
 * skipped. Proven by hiding 0040 and watching the check still pass.
 *
 * FROM / JOIN / INTO / UPDATE is the discriminator: a role string never follows
 * one, and a queried table always does.
 */
function referencedByNexus() {
  const hits = new Set();
  // Anchored on whitespace or an opening paren rather than a word boundary: a
  // \b written through a shell heredoc once landed here as a literal backspace
  // byte, so this regex matched nothing and the guard passed silently.
  const RE = /(?:^|[\s(])(?:from|join|into|update)\s+(bridge_[a-z_]+)/gim;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        for (const m of readFileSync(full, "utf8").matchAll(RE)) hits.add(m[1].toLowerCase());
      }
    }
  };
  if (existsSync(NEXUS_SRC)) walk(NEXUS_SRC);
  return hits;
}

const bridgeTree = declaredIn(BRIDGE_MIGRATIONS);
const nexusPack = declaredIn(NEXUS_PACK);
const nexusOwn = declaredIn(NEXUS_MIGRATIONS);
const nexusAll = merge(nexusPack, nexusOwn);

const failures = [];

// RULE A — Nexus must create every bridge table it queries.
for (const table of [...referencedByNexus()].sort()) {
  if (!nexusAll.has(table)) {
    failures.push(
      `RULE A  ${table} is queried by the Nexus backend but created by NO Nexus migration.\n` +
        `        A fresh Nexus environment will 500 on the first query. Mirror its DDL into\n` +
        `        migrations/platforms/bridge/ (or add a Nexus migration for it).`,
    );
  }
}

// RULE B — shared tables must agree on columns.
for (const [table, nexusCols] of [...nexusAll].sort()) {
  const bridgeCols = bridgeTree.get(table);
  if (!bridgeCols) continue; // Nexus-owned table (e.g. bridge_learner_coaches).
  for (const col of [...bridgeCols].sort())
    if (!nexusCols.has(col))
      failures.push(`RULE B  ${table}.${col} exists in db/migrations but not in Nexus's.`);
  for (const col of [...nexusCols].sort())
    if (!bridgeCols.has(col))
      failures.push(`RULE B  ${table}.${col} exists in Nexus's migrations but not in db/migrations.`);
}

const bridgeOnly = [...bridgeTree.keys()].filter((t) => !nexusAll.has(t)).sort();
console.log(
  `db/migrations: ${bridgeTree.size} bridge tables · Nexus: ${nexusAll.size} ` +
    `(${nexusPack.size} in the bridge pack, ${nexusOwn.size} in its own migrations)`,
);
console.log(`bridge-only (not mirrored, and not queried by Nexus): ${bridgeOnly.length}`);
if (process.argv.includes("--list")) for (const t of bridgeOnly) console.log("    " + t);

if (failures.length === 0) {
  console.log("✓ every bridge table Nexus queries is one Nexus creates, and shared tables agree");
  process.exit(0);
}
console.error(`\n✗ ${failures.length} problem(s):\n`);
for (const f of failures) console.error("  " + f);
process.exit(1);
