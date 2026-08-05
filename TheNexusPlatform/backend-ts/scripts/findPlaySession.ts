import "dotenv/config";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const r = await sql`select session_id, created_by,
  jsonb_array_length(record->'events') as events, record->>'status' as status
  from bridge_kb_sessions
  where jsonb_array_length(record->'events') > 12 and record->>'status' <> 'completed'
  order by updated_at desc limit 4`;
console.log(JSON.stringify(r));
await sql.end();
