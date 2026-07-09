-- AI player profiles & convention cards (Bridge plan §11, §15.1). The
-- published configuration packages themselves live in bridge_published_packages
-- (0001); profiles reference exact versions. Convention cards are DERIVED
-- output (§11.5) — cached render, never a source of truth.

create table if not exists bridge_ai_player_profiles (
  ai_player_profile_id text primary key,
  name text not null,
  description text,
  owner_type text not null, -- system | program_org | coach | learner
  owner_id text,
  program_organization_id text,
  package_id text not null,
  package_version text not null,
  selected_preset_id text,
  value_overrides jsonb not null default '{}'::jsonb,
  resolved_value_hash text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bridge_convention_cards (
  ai_player_profile_id text primary key references bridge_ai_player_profiles,
  card jsonb not null,
  generated_at timestamptz not null default now()
);

create index if not exists idx_profiles_owner on bridge_ai_player_profiles (owner_id);
create index if not exists idx_profiles_org on bridge_ai_player_profiles (program_organization_id, status);
