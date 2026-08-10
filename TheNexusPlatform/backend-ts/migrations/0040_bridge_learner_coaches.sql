-- A learner can hire SEVERAL coaches (owner direction 2026-08-09), and picks
-- which coach each game goes to. The single-coach model kept the whole
-- relationship in participants.group_id — one roster group, so hiring a
-- second coach REPLACED the first. That column stays (it is what rosters,
-- assignments and existing surfaces key on — the learner's PRIMARY coach);
-- this table carries the additional hires beside it.
--
-- Coach identity is the PROFILE id, same as coach_roster groups' metadata and
-- platform_role_assignments resolution — one id space end to end. Rows cascade
-- with the participant: leaving the program dissolves the relationships.
create table if not exists bridge_learner_coaches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  program_id uuid not null references programs (id) on delete cascade,
  participant_id uuid not null references participants (id) on delete cascade,
  coach_profile_id uuid not null,
  created_at timestamptz not null default now(),
  unique (participant_id, coach_profile_id)
);

create index if not exists bridge_learner_coaches_coach_idx
  on bridge_learner_coaches (organization_id, program_id, coach_profile_id);
