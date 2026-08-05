/**
 * One-off: stamp sessions that were created without `nexus_program_id`.
 *
 * Program-scoped reads (My Games, Resume, the app's summary counts) filter on
 * that column, so an unstamped session is invisible to its own owner — the
 * symptom was a learner completing an assigned board and never seeing it.
 * Code paths are fixed; this repairs the rows they already wrote. Only rows
 * whose org matches the program's org are touched, and only when NULL.
 *
 *   npx tsx scripts/backfillSessionProgram.ts [--apply]
 */
import "dotenv/config";
import postgres from "postgres";

const PROGRAM_ID = "eef9985b-b85f-4eeb-bd1e-bcc1f66b0f83"; // LAIC Bridge Program
const ORG_ID = "c2a81633-c9fa-46d4-962b-f21457137778"; // Life in AI Center

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });
const apply = process.argv.includes("--apply");

async function main() {
  const [before] = await sql`
    select count(*) as n from bridge_kb_sessions
    where nexus_program_id is null and program_organization_id = ${ORG_ID}`;
  console.log(`unstamped sessions in this org: ${before!.n}`);
  // Sessions with no org at all are left alone: we can't prove where they belong.
  const [orphans] = await sql`
    select count(*) as n from bridge_kb_sessions
    where nexus_program_id is null and program_organization_id is null`;
  console.log(`unstamped AND org-less (left untouched): ${orphans!.n}`);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write.");
    await sql.end();
    return;
  }
  const rows = await sql`
    update bridge_kb_sessions
    set nexus_program_id = ${PROGRAM_ID}
    where nexus_program_id is null and program_organization_id = ${ORG_ID}
    returning session_id`;
  console.log(`stamped ${rows.length} sessions.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
