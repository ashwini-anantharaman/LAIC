-- 0022: instance scoping + copy provenance (library rework Phase A).
--
-- Every artifact belongs to exactly ONE scope: a user, a program, or an org.
-- Content crosses scopes only by being COPIED, carrying provenance in
-- source_ref (how it arrived: assigned | embedded | installed, and where
-- from). Sessions are inherently personal (created_by is the owner) — they
-- gain the program partition only. nexus_program_id is the REAL Nexus program
-- uuid (the contract's programId is a fixed string; the uuid rides the launch
-- and now lands on artifacts, so two programs in one org stay disjoint).
--
-- Backfill: pre-0022 rows all belong to the Life in AI Center Bridge Program.
-- Plays and sessions were always personal → user scope; the shared authored
-- shelves (deals/boards/tables/drills) BECOME the program instance.

-- sessions: program partition
alter table bridge_kb_sessions add column if not exists nexus_program_id text;
update bridge_kb_sessions
   set nexus_program_id = 'eef9985b-b85f-4eeb-bd1e-bcc1f66b0f83'
 where nexus_program_id is null
   and program_organization_id = 'c2a81633-c9fa-46d4-962b-f21457137778';
create index if not exists idx_kb_sessions_program
  on bridge_kb_sessions (nexus_program_id, created_by, created_at desc);

-- library: scope + program + provenance
alter table bridge_kb_library add column if not exists scope_level text;
alter table bridge_kb_library add column if not exists nexus_program_id text;
alter table bridge_kb_library add column if not exists source_ref jsonb;
update bridge_kb_library
   set scope_level = case when kind = 'play' then 'user' else 'program' end
 where scope_level is null;
update bridge_kb_library
   set nexus_program_id = 'eef9985b-b85f-4eeb-bd1e-bcc1f66b0f83'
 where nexus_program_id is null
   and program_organization_id = 'c2a81633-c9fa-46d4-962b-f21457137778';
create index if not exists idx_kb_library_scope
  on bridge_kb_library (scope_level, nexus_program_id, created_by, created_at desc);

-- submissions + assignments: program partition; assignments also remember the
-- SOURCE entry (each learner plays their own copy — grouping needs the source)
alter table bridge_play_submissions add column if not exists nexus_program_id text;
update bridge_play_submissions
   set nexus_program_id = 'eef9985b-b85f-4eeb-bd1e-bcc1f66b0f83'
 where nexus_program_id is null
   and program_organization_id = 'c2a81633-c9fa-46d4-962b-f21457137778';

alter table bridge_assignments add column if not exists nexus_program_id text;
alter table bridge_assignments add column if not exists source_entry_id text;
update bridge_assignments
   set nexus_program_id = 'eef9985b-b85f-4eeb-bd1e-bcc1f66b0f83'
 where nexus_program_id is null
   and program_organization_id = 'c2a81633-c9fa-46d4-962b-f21457137778';
update bridge_assignments set source_entry_id = entry_id where source_entry_id is null;
