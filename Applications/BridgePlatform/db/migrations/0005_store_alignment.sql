-- Alignment migration: objects added to the store models after 0001-0004
-- were authored (Phase 9 ingestion jobs + run warnings + package baselines;
-- the teaching-levels correction; evaluation embedding on signals; a jsonb
-- record column making bridge_sessions the hybrid jsonb-primary store the
-- dev store shape maps onto 1:1).

create table if not exists bridge_ingestion_jobs (
  job_id text primary key,
  source_id text not null,
  extractor text not null,
  system_family text not null,
  requested_by text not null,
  created_at timestamptz not null default now(),
  status text not null,
  stats jsonb not null default '{}'::jsonb,
  candidate_item_ids jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb
);

-- Coach-owned teaching scopes (levels are coach judgment, not system truth)
create table if not exists bridge_teaching_scopes (
  teaching_scope_id text primary key,
  name text not null,
  description text,
  owner_type text not null,
  owner_id text,
  program_organization_id text,
  derived_from_item_id text,
  evaluator_filter jsonb not null,
  target_concept_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bridge_model_generation_runs add column if not exists warnings jsonb not null default '[]'::jsonb;
alter table bridge_published_packages add column if not exists baseline jsonb;
alter table bridge_progress_signals add column if not exists evaluation jsonb;
alter table bridge_sessions add column if not exists record jsonb;

alter table bridge_ingestion_jobs enable row level security;
alter table bridge_teaching_scopes enable row level security;
create index if not exists idx_scopes_owner on bridge_teaching_scopes (owner_id);
