-- Bridge session tables (Bridge plan §8, §15.1-15.2, §3.4). The JSON dev
-- store (packages/bridge-sessions) denormalizes these into one record + an
-- event stream; the Postgres store maps 1:1 back onto them.

create table if not exists bridge_user_profiles (
  bridge_user_profile_id uuid primary key default gen_random_uuid(),
  nexus_user_id uuid not null unique,
  display_name_at_table text,
  preferred_seat text,
  bridge_experience_level text,
  bidding_system_familiarity jsonb not null default '[]'::jsonb,
  preferred_feedback_mode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bridge_sessions (
  bridge_session_id text primary key,
  -- NexusBridgeContext snapshot: the tenant-scoping anchor (§21)
  nexus_user_id text not null,
  laic_org_id text not null,
  program_id text not null default 'bridge_program',
  program_organization_id text,
  group_id text,
  app_id text not null,
  context_snapshot jsonb not null,
  session_type text not null,
  status text not null default 'created',
  -- replay stability (§11.4): exact package version + resolved-config hash
  package_id text not null,
  package_version text not null,
  resolved_values jsonb not null,
  resolved_value_hash text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists bridge_boards (
  bridge_board_id uuid primary key default gen_random_uuid(),
  bridge_session_id text not null references bridge_sessions,
  source_type text not null default 'random',
  name text not null,
  dealer text not null,
  vulnerability text not null,
  hands jsonb not null,
  tags jsonb not null default '[]'::jsonb,
  difficulty_level text,
  target_concept_ids jsonb not null default '[]'::jsonb
);

create table if not exists bridge_seat_assignments (
  bridge_session_id text not null references bridge_sessions,
  seat text not null,
  player_kind text not null,
  occupant_id text,
  primary key (bridge_session_id, seat)
);

-- §15.2 verbatim shape (+ text session id)
create table if not exists bridge_events (
  id uuid primary key default gen_random_uuid(),
  bridge_session_id text not null references bridge_sessions,
  bridge_board_id uuid,
  seq integer not null,
  event_category text not null,
  event_type text not null,
  actor_kind text not null,
  actor_id text,
  seat text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (bridge_session_id, seq)
);

create table if not exists bridge_position_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  bridge_session_id text not null references bridge_sessions,
  bridge_board_id uuid,
  as_of_seq integer not null,
  state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_org on bridge_sessions (program_organization_id, status);
create index if not exists idx_sessions_creator on bridge_sessions (created_by);
create index if not exists idx_events_session on bridge_events (bridge_session_id, seq);
