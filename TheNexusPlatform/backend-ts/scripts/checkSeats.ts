import "dotenv/config";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const rows = await sql`
  select session_id, created_at::date as d,
         record->'seats'->'N'->>'kind' as n_kind, record->'seats'->'N'->>'label' as n_label,
         record->'seats'->'S'->>'kind' as s_kind
  from bridge_kb_sessions order by created_at desc limit 6`;
console.log(JSON.stringify(rows, null, 1));
const agg = await sql`
  select record->'seats'->'N'->>'kind' as ai_kind, count(*) 
  from bridge_kb_sessions group by 1 order by 2 desc`;
console.log("all sessions by North seat kind:", JSON.stringify(agg));
await sql.end();
