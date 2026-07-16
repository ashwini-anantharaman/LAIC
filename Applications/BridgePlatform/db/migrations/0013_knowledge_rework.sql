-- 0013: Knowledge Rework demolition + new model (spec 2026-07-14).
-- Owner decisions 14/17/18: fresh start, hard wipe of everything bridge
-- except identity. KEPT: bridge_audit_log (append-only trail),
-- bridge_user_profiles, bridge_program_organization_profiles,
-- bridge_coach_affiliations, and the taxonomy mirrors (reference vocabulary).
-- Everything else content-coupled is dropped; sessions v2 tables arrive with
-- Stage F's migration.
--
-- New tables are jsonb-primary (the 0011 hybrid pattern): scalar columns only
-- for identity/tenant filtering, the full record in `record`.

-- ---- demolition ------------------------------------------------------------

drop table if exists bridge_share_links cascade;
drop table if exists bridge_saved_boards cascade;
drop table if exists bridge_session_lifecycle cascade;
drop table if exists bridge_position_snapshots cascade;
drop table if exists bridge_seat_assignments cascade;
drop table if exists bridge_events cascade;
drop table if exists bridge_boards cascade;
drop table if exists bridge_action_evaluations cascade;
drop table if exists bridge_progress_signals cascade;
drop table if exists bridge_mistake_patterns cascade;
drop table if exists bridge_learner_profiles cascade;
drop table if exists bridge_sessions cascade;
drop table if exists bridge_convention_cards cascade;
drop table if exists bridge_sandboxes cascade;
drop table if exists bridge_ai_player_profiles cascade;
drop table if exists bridge_teaching_scopes cascade;
drop table if exists bridge_generated_artifacts cascade;
drop table if exists bridge_model_generation_runs cascade;
drop table if exists bridge_published_packages cascade;
drop table if exists bridge_readable_knowledge_item_revisions cascade;
drop table if exists bridge_readable_knowledge_items cascade;
drop table if exists bridge_knowledge_gaps cascade;
drop table if exists bridge_ingestion_jobs cascade;
drop table if exists bridge_source_passages cascade;
drop table if exists bridge_source_documents cascade;
drop table if exists bridge_knowledge_sources cascade;

-- ---- knowledge bases (spec §1) ----------------------------------------------

create table if not exists bridge_kbs (
  kb_id text primary key,
  record jsonb not null,
  updated_at timestamptz not null
);

create table if not exists bridge_kb_items (
  item_id text primary key,
  record jsonb not null,
  updated_at timestamptz not null
);

create table if not exists bridge_kb_memberships (
  kb_id text not null references bridge_kbs (kb_id),
  item_id text not null references bridge_kb_items (item_id),
  primary key (kb_id, item_id)
);

create table if not exists bridge_kb_edges (
  edge_id text primary key,
  from_item_id text not null,
  to_item_id text,
  record jsonb not null
);
create index if not exists idx_kb_edges_from on bridge_kb_edges (from_item_id);
create index if not exists idx_kb_edges_to on bridge_kb_edges (to_item_id);

create table if not exists bridge_kb_packs (
  pack_id text primary key,
  kb_id text not null references bridge_kbs (kb_id),
  record jsonb not null,
  updated_at timestamptz not null
);
create index if not exists idx_kb_packs_kb on bridge_kb_packs (kb_id);

create table if not exists bridge_kb_players (
  player_id text primary key,
  kb_id text not null references bridge_kbs (kb_id),
  record jsonb not null,
  updated_at timestamptz not null
);
create index if not exists idx_kb_players_kb on bridge_kb_players (kb_id);

create table if not exists bridge_kb_sandboxes (
  sandbox_id text primary key,
  kb_id text not null references bridge_kbs (kb_id),
  record jsonb not null,
  updated_at timestamptz not null
);

create table if not exists bridge_kb_suggestions (
  suggestion_id text primary key,
  kb_id text not null references bridge_kbs (kb_id),
  record jsonb not null,
  created_at timestamptz not null
);
create index if not exists idx_kb_suggestions_kb on bridge_kb_suggestions (kb_id, created_at desc);

-- ---- sources v2 (spec §1: same proven design, new lineage) -------------------

create table if not exists bridge_kb_sources (
  source_id text primary key,
  record jsonb not null
);

create table if not exists bridge_kb_documents (
  source_id text primary key references bridge_kb_sources (source_id),
  record jsonb not null
);

create table if not exists bridge_kb_passages (
  passage_id text primary key,
  source_id text not null references bridge_kb_sources (source_id),
  ordinal integer not null,
  record jsonb not null,
  unique (source_id, ordinal)
);

create table if not exists bridge_kb_jobs (
  job_id text primary key,
  kb_id text not null,
  source_id text not null,
  record jsonb not null,
  created_at timestamptz not null
);
create index if not exists idx_kb_jobs_kb on bridge_kb_jobs (kb_id, created_at desc);

-- ---- compiled artifacts (spec §3: immutable; live pointer on bridge_kbs) ----

create table if not exists bridge_kb_compiles (
  compile_id text primary key,
  kb_id text not null references bridge_kbs (kb_id),
  version integer not null,
  artifact jsonb not null,
  compiled_at timestamptz not null,
  unique (kb_id, version)
);

alter table bridge_kbs enable row level security;
alter table bridge_kb_items enable row level security;
alter table bridge_kb_memberships enable row level security;
alter table bridge_kb_edges enable row level security;
alter table bridge_kb_packs enable row level security;
alter table bridge_kb_players enable row level security;
alter table bridge_kb_sandboxes enable row level security;
alter table bridge_kb_suggestions enable row level security;
alter table bridge_kb_sources enable row level security;
alter table bridge_kb_documents enable row level security;
alter table bridge_kb_passages enable row level security;
alter table bridge_kb_jobs enable row level security;
alter table bridge_kb_compiles enable row level security;
