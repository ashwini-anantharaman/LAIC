#!/usr/bin/env tsx
import "dotenv/config";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
await sql.unsafe(`
  alter table learning_object_versions
    add column if not exists status text not null default 'committed';
  do $$ begin
    alter table learning_object_versions
      add constraint learning_object_versions_status_chk
      check (status in ('committed','draft'));
  exception when duplicate_object then null; end $$;
`);
const cols = await sql`select column_name from information_schema.columns where table_name='learning_object_versions' order by ordinal_position`;
console.log("columns:", cols.map((c:any)=>c.column_name).join(", "));
await sql.end();
