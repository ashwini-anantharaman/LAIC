import "dotenv/config";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const rows = await sql`select status, count(*), array_agg(title) as titles from learning_objects group by status`;
console.log(rows.map(r => `${r.status}: ${r.count} ${JSON.stringify(r.titles)}`).join("\n"));
await sql.end();
