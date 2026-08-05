#!/usr/bin/env tsx
// Diagnostic: how library rows are scoped after 0022.
import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, onnotice: () => {} });
const rows = await sql`
  select kind, scope_level, nexus_program_id is not null as has_program, count(*) as n
  from bridge_kb_library group by 1,2,3 order by 1,2`;
console.log(JSON.stringify(rows, null, 1));
await sql.end();
process.exit(0);
