-- Bridge Knowledge Base tables (Bridge plan §12.4, §15.5-15.7, §12.11).
-- Target: the shared Supabase Postgres project (same one TheNexusPlatform
-- uses). Apply when credentials are wired; until then the app runs on the
-- JSON-file dev store, whose shapes mirror these tables 1:1
-- (packages/bridge-knowledge/src/model.ts).

create table if not exists bridge_knowledge_sources (
  source_id text primary key,
  title text not null,
  source_type text not null,
  system_family text,
  rights_status text not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  status text not null default 'registered',
  locator text,
  notes text
);

create table if not exists bridge_readable_knowledge_items (
  item_id text primary key,
  system_family text not null,
  item_type text not null,
  title text not null,
  human_readable_rule text not null,
  structured_fields jsonb not null default '{}'::jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  related_item_ids jsonb not null default '[]'::jsonb,
  gap_ids jsonb not null default '[]'::jsonb,
  reviewer_notes text,
  status text not null default 'draft',
  version text not null default '1',
  created_by text not null,
  created_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz
);

-- Append-only history of superseded item revisions (the KB never loses history).
create table if not exists bridge_readable_knowledge_item_revisions (
  revision_id uuid primary key default gen_random_uuid(),
  item_id text not null,
  snapshot jsonb not null,
  superseded_at timestamptz not null default now()
);

create table if not exists bridge_knowledge_gaps (
  gap_id text primary key,
  system_family text not null,
  area text not null,
  description text not null,
  detected_from jsonb not null default '[]'::jsonb,
  severity text not null,
  resolution_status text not null default 'open',
  expert_resolution text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists bridge_model_generation_runs (
  run_id text primary key,
  system_family text not null,
  requested_by text not null,
  created_at timestamptz not null default now(),
  status text not null,
  input_items jsonb not null default '[]'::jsonb,
  diff jsonb,
  errors jsonb not null default '[]'::jsonb,
  result_package_id text,
  result_version text
);

create table if not exists bridge_published_packages (
  package_id text not null,
  version text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  published_by text,
  published_at timestamptz,
  package jsonb not null,
  primary key (package_id, version)
);

create table if not exists bridge_generated_artifacts (
  artifact_id text primary key,
  artifact_type text not null,
  generated_from_knowledge_item_ids jsonb not null default '[]'::jsonb,
  generated_from_source_ids jsonb not null default '[]'::jsonb,
  package_id text not null,
  version text not null,
  status text not null default 'draft',
  artifact_payload jsonb not null
);

create index if not exists idx_knowledge_items_family_status
  on bridge_readable_knowledge_items (system_family, status);
create index if not exists idx_gaps_status on bridge_knowledge_gaps (resolution_status);
create index if not exists idx_artifacts_package on bridge_generated_artifacts (package_id, version);
