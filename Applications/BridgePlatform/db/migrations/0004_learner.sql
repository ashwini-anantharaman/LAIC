-- Bridge learner model, Track 1 (Bridge plan §13, §15.4; LM doc §7). The
-- interpreted skill/concept-state model is NOT here — it belongs to the
-- Coaching Platform. domain_id is always 'bridge' (isolation invariant).

create table if not exists bridge_learner_profiles (
  domain_profile_id text primary key,
  nexus_user_id text not null unique,
  domain_id text not null default 'bridge',
  program_id text not null,
  organization_scope_id text,
  self_declared_level text,
  assessed_level text,
  bridge_experience_level text not null default 'beginner',
  known_systems jsonb not null default '[]'::jsonb,
  active_learning_system text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bridge_skill_taxonomy (
  skill_id text primary key,
  domain_id text not null default 'bridge',
  category text not null,
  name text not null,
  level_band text not null
);

create table if not exists bridge_action_evaluations (
  evaluation_id text primary key,
  bridge_session_id text not null,
  action_event_seq integer not null,
  seat text not null,
  kind text not null,
  evaluated_action text not null,
  evaluation_mode text not null default 'system_alignment',
  judgment text not null,
  system_action text,
  matched_rule_ids jsonb not null default '[]'::jsonb,
  missed_rule_ids jsonb not null default '[]'::jsonb,
  confidence numeric not null,
  created_at timestamptz not null default now()
);

-- §15.4 shape
create table if not exists bridge_progress_signals (
  progress_signal_id text primary key,
  domain_id text not null default 'bridge',
  program_id text not null,
  bridge_session_id text not null,
  bridge_board_id text,
  nexus_user_id text not null,
  domain_profile_id text,
  seat text,
  signal_type text not null,
  related_skill_ids jsonb not null default '[]'::jsonb,
  related_concept_ids jsonb not null default '[]'::jsonb,
  source_event_ids jsonb not null default '[]'::jsonb,
  severity text,
  confidence numeric not null,
  evaluation_id text,
  created_at timestamptz not null default now()
);

create table if not exists bridge_mistake_patterns (
  pattern_id text primary key,
  nexus_user_id text not null,
  domain_id text not null default 'bridge',
  pattern_type text not null,
  related_skill_ids jsonb not null default '[]'::jsonb,
  related_concept_ids jsonb not null default '[]'::jsonb,
  example_event_ids jsonb not null default '[]'::jsonb,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  observation_count integer not null default 1,
  status text not null default 'uncertain'
);

create index if not exists idx_signals_user on bridge_progress_signals (nexus_user_id, domain_id);
create index if not exists idx_signals_session on bridge_progress_signals (bridge_session_id);
create index if not exists idx_patterns_user on bridge_mistake_patterns (nexus_user_id);
