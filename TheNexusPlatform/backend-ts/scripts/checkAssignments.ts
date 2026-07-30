import "dotenv/config";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const rows = await sql`select assignment_id, status, session_id, entry_name, learner_id from bridge_assignments`;
console.log(JSON.stringify(rows, null, 1));
await sql.end();
