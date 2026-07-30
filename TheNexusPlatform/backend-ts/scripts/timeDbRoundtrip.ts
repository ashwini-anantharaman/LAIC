/**
 * Read-only latency probe: how long does one Postgres round trip take from
 * this machine, and how long do the queries the bridge context path runs?
 * Usage: npx tsx scripts/timeDbRoundtrip.ts
 */
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });

async function timed(label: string, fn: () => Promise<unknown>) {
  const t0 = performance.now();
  await fn();
  console.log(`${label}: ${(performance.now() - t0).toFixed(0)}ms`);
}

async function main() {
  await timed("connect + select 1 (cold)", () => sql`select 1`);
  await timed("select 1 (warm)", () => sql`select 1`);
  await timed("select 1 (warm)", () => sql`select 1`);
  await timed(
    "profiles by email",
    () => sql`select id from profiles where email = ${"ashvin@laic.org"} limit 1`,
  );
  await timed(
    "participants for program",
    () =>
      sql`select count(*) from participants where program_id = ${"eef9985b-b85f-4eeb-bd1e-bcc1f66b0f83"}`,
  );
  await timed(
    "bridge_kb_library scan (program scope)",
    () => sql`select count(*) from bridge_kb_library where scope_level = 'program'`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
