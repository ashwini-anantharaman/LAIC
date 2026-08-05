import "dotenv/config";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const r = await sql`select session_id, pg_column_size(record) as bytes,
  jsonb_array_length(record->'events') as events
  from bridge_kb_sessions order by updated_at desc limit 5`;
console.log(JSON.stringify(r));
await sql.end();
