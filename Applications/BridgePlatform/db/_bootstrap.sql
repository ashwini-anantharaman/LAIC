-- One-time migration-runner bootstrap. Run this ONCE in the Supabase SQL editor
-- (or via any connection with DDL rights). After it exists, db/apply.mjs applies
-- every migration through the service-role key alone — no browser, no DB password.
--
-- bridge_exec_migration is SECURITY DEFINER and granted to service_role ONLY
-- (revoked from anon/authenticated/public), so it exposes nothing the service
-- key doesn't already represent. bridge_migrations is the applied-ledger.

create table if not exists bridge_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);
alter table bridge_migrations enable row level security;

create or replace function bridge_exec_migration(migration_sql text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  execute migration_sql;
end;
$fn$;

revoke all on function bridge_exec_migration(text) from public;
revoke all on function bridge_exec_migration(text) from anon;
revoke all on function bridge_exec_migration(text) from authenticated;
grant execute on function bridge_exec_migration(text) to service_role;

-- Seed the ledger with everything already applied to prod through 0026 so the
-- first `apply` run does not re-run history.
insert into bridge_migrations (filename) values
  ('0001_knowledge.sql'),('0002_sessions.sql'),('0003_profiles.sql'),
  ('0004_learner.sql'),('0005_store_alignment.sql'),('0006_degovernance.sql'),
  ('0007_source_documents.sql'),('0008_table_experience.sql'),('0009_taxonomy.sql'),
  ('0010_platform_security.sql'),('0011_sandboxes.sql'),('0012_user_profile_ids.sql'),
  ('0013_knowledge_rework.sql'),('0014_sessions_v2.sql'),('0015_library.sql'),
  ('0016_kb_versioning.sql'),('0017_pack_versions.sql'),('0018_benchmark.sql'),
  ('0019_access_catalogue.sql'),('0020_table_config.sql'),('0021_tester_views.sql'),
  ('0022_session_library_org_scope.sql'),('0023_play_submissions.sql'),
  ('0024_assignments.sql'),('0025_scopes_provenance.sql'),('0026_library_collections.sql')
on conflict (filename) do nothing;
