-- 0019: organization scoping for sessions + library entries (coach/learner
-- groundwork, Phase 0). Sessions and library entries belong to the org whose
-- program they were created in; list reads filter on it so one org's plays
-- are never visible to another org (and, in the UI, plays are additionally
-- owner-scoped). Follows the existing bridge convention:
-- program_organization_id is TEXT (see bridge_coach_affiliations).
--
-- Backfill: every pre-0019 row was created in the Life in AI Center Bridge
-- Program (the only production tenant to date).

alter table bridge_kb_sessions add column if not exists program_organization_id text;
alter table bridge_kb_library  add column if not exists program_organization_id text;

update bridge_kb_sessions
   set program_organization_id = 'c2a81633-c9fa-46d4-962b-f21457137778'
 where program_organization_id is null;
update bridge_kb_library
   set program_organization_id = 'c2a81633-c9fa-46d4-962b-f21457137778'
 where program_organization_id is null;

create index if not exists idx_kb_sessions_org on bridge_kb_sessions (program_organization_id, created_at desc);
create index if not exists idx_kb_library_org  on bridge_kb_library  (program_organization_id, created_at desc);
