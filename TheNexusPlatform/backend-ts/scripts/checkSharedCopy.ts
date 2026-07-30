/** Read-only: verify l1's library copies carry the right provenance kinds. */
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });

async function main() {
  const cols = await sql`
    select column_name from information_schema.columns
    where table_name = 'bridge_kb_library'`;
  console.log("columns:", cols.map((c) => c.column_name).join(", "));
  const jsonCol = cols.some((c) => c.column_name === "entry") ? "entry" : "payload";
  const rows = await sql`
    select ${sql(jsonCol)}->>'name' as name,
           ${sql(jsonCol)}->'sourceRef'->>'kind' as prov,
           scope_level
    from bridge_kb_library
    where created_by = ${"47ab0ea3-0fab-43f3-8433-4262dcbb7b80"}
    order by created_at`;
  for (const r of rows) {
    console.log(`${r.name} | scope=${r.scope_level} | provenance=${r.prov ?? "authored"}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
