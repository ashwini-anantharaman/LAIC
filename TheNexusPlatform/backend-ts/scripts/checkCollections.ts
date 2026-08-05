import "dotenv/config";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const rows = await sql`select collection_id, scope_level, nexus_program_id from bridge_library_collections`;
console.log(JSON.stringify(rows));
await sql.end();
