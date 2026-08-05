import "dotenv/config";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
console.log("newest 8 sessions (are NEW ones stamped?):");
console.log(await sql`select session_id, created_at::date as d, nexus_program_id is null as unstamped, record->>'status' as status from bridge_kb_sessions order by created_at desc limit 8`);
console.log("unstamped sessions by date:");
console.log(await sql`select created_at::date as d, count(*) from bridge_kb_sessions where nexus_program_id is null group by 1 order by 1 desc limit 6`);
await sql.end();
