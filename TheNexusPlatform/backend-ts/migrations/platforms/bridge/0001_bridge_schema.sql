-- Bridge Platform schema — SQUASHED END-STATE (Phase 4 fold into the shared,
-- org-scoped cluster).
--
-- PROVENANCE: consolidated from Applications/BridgePlatform/db/migrations
-- 0001–0016 (as of 0016_kb_versioning, 2026-07-17). That chain is a history
-- with a deliberate demolition step (0013 drops + rebuilds); the Nexus
-- migration runner replays every file on every run, so this pack captures the
-- POST-0013 end state only: current tables, no drops, fully idempotent.
-- The Bridge repo remains the source of truth for schema evolution — when it
-- gains a migration, mirror the delta here (additively).
--
-- Tenancy vocabulary (Bridge plan §3.4/§21):
--   nexus_user_id            — org-scoped person id (Nexus Phase 2/3 contexts)
--   program_organization_id  — partner-org scope within the program (text,
--                              null = program-wide)
-- The kb_* tables are jsonb-primary (scalar columns for identity/ordering
-- only; tenancy fields live inside `record`).

-- ── identity & platform security (kept through the 0013 rework) ─────────────

create table if not exists bridge_user_profiles (
  bridge_user_profile_id uuid primary key default gen_random_uuid(),
  nexus_user_id text not null unique,
  display_name_at_table text,
  preferred_seat text,
  bridge_experience_level text,
  bidding_system_familiarity jsonb not null default '[]'::jsonb,
  preferred_feedback_mode text,
  active_program_organization_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only audit trail: the application never updates or deletes rows
-- (enforced by grants in 9000_nexus_hardening.sql).
create table if not exists bridge_audit_log (
  audit_id text primary key,
  ts timestamptz not null,
  actor_user_id text not null,
  actor_access_level text not null,
  program_organization_id text,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  details jsonb not null default '{}'::jsonb
);
create index if not exists idx_audit_actor on bridge_audit_log (actor_user_id, ts desc);
create index if not exists idx_audit_resource on bridge_audit_log (resource_id, ts desc);

create table if not exists bridge_program_organization_profiles (
  program_organization_id text primary key,
  bridge_org_type text not null,
  allowed_bidding_systems jsonb not null default '[]'::jsonb,
  default_learner_level text,
  default_convention_profile_id text,
  allow_ben_players boolean not null default false,
  allow_ai_players boolean not null default true,
  updated_by text not null,
  updated_at timestamptz not null
);

create table if not exists bridge_coach_affiliations (
  coach_affiliation_id text primary key,
  nexus_user_id text not null,
  program_organization_id text,
  group_id text,
  affiliation_type text not null,
  status text not null default 'active',
  created_at timestamptz not null
);
create index if not exists idx_affiliations_user on bridge_coach_affiliations (nexus_user_id);

-- ── taxonomy mirrors (source of truth is @bridge/taxonomy in code) ──────────

create table if not exists bridge_skill_taxonomy (
  skill_id text primary key,
  domain_id text not null default 'bridge',
  category text not null,
  name text not null,
  description text,
  level_band text not null
);

create table if not exists bridge_concept_taxonomy (
  concept_id text primary key,
  domain_id text not null default 'bridge',
  name text not null,
  description text,
  related_skill_ids jsonb not null default '[]'::jsonb
);

-- ── knowledge bases (0013 rework; jsonb-primary) ─────────────────────────────

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

-- sources v2

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

-- compiled artifacts (immutable; live pointer on bridge_kbs)

create table if not exists bridge_kb_compiles (
  compile_id text primary key,
  kb_id text not null references bridge_kbs (kb_id),
  version integer not null,
  artifact jsonb not null,
  compiled_at timestamptz not null,
  unique (kb_id, version)
);

-- ── sessions v2 (0014) ───────────────────────────────────────────────────────

create table if not exists bridge_kb_sessions (
  session_id text primary key,
  kb_id text not null,
  created_by text not null,
  record jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  program_organization_id text
);
create index if not exists idx_kb_sessions_kb on bridge_kb_sessions (kb_id, created_at desc);
create index if not exists idx_kb_sessions_user on bridge_kb_sessions (created_by, created_at desc);
-- org scoping (0019): upgrade pre-0019 databases in place (end-state replay).
alter table bridge_kb_sessions add column if not exists program_organization_id text;
create index if not exists idx_kb_sessions_org on bridge_kb_sessions (program_organization_id, created_at desc);

-- ── fellows' library (0015) ──────────────────────────────────────────────────

create table if not exists bridge_kb_library (
  entry_id text primary key,
  kind text not null,
  created_by text not null,
  entry jsonb not null,
  created_at timestamptz not null,
  program_organization_id text
);
create index if not exists idx_kb_library_kind on bridge_kb_library (kind, created_at desc);
create index if not exists idx_kb_library_user on bridge_kb_library (created_by, created_at desc);
-- org scoping (0019): upgrade pre-0019 databases in place (end-state replay).
alter table bridge_kb_library add column if not exists program_organization_id text;
create index if not exists idx_kb_library_org on bridge_kb_library (program_organization_id, created_at desc);

-- ── two-level versioning (0016, Stage H) ─────────────────────────────────────

create table if not exists bridge_kb_item_versions (
  item_id text not null,
  version_number integer not null,
  record jsonb not null,
  committed_at timestamptz not null,
  primary key (item_id, version_number)
);
create index if not exists idx_kb_item_versions_item
  on bridge_kb_item_versions (item_id, version_number desc);

create table if not exists bridge_kb_versions (
  version_id text primary key,
  kb_id text not null,
  version_number integer not null,
  record jsonb not null,
  published_at timestamptz not null,
  unique (kb_id, version_number)
);
create index if not exists idx_kb_versions_kb
  on bridge_kb_versions (kb_id, version_number desc);

-- ── RLS on (policies live in 9000_nexus_hardening.sql) ───────────────────────

alter table bridge_user_profiles enable row level security;
alter table bridge_audit_log enable row level security;
alter table bridge_program_organization_profiles enable row level security;
alter table bridge_coach_affiliations enable row level security;
alter table bridge_skill_taxonomy enable row level security;
alter table bridge_concept_taxonomy enable row level security;
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
alter table bridge_kb_sessions enable row level security;
alter table bridge_kb_library enable row level security;
alter table bridge_kb_item_versions enable row level security;
alter table bridge_kb_versions enable row level security;

-- ── play submissions + coach comments (0020, coach/learner Phase 2) ──────────

create table if not exists bridge_play_submissions (
  submission_id text primary key,
  program_organization_id text,
  session_id text not null,
  learner_id text not null,
  learner_name text,
  coach_id text not null,
  coach_name text,
  status text not null default 'submitted',
  note text,
  board jsonb not null,
  created_at timestamptz not null,
  reviewed_at timestamptz
);
create index if not exists idx_play_submissions_coach
  on bridge_play_submissions (coach_id, created_at desc);
create index if not exists idx_play_submissions_learner
  on bridge_play_submissions (learner_id, created_at desc);
create index if not exists idx_play_submissions_session
  on bridge_play_submissions (session_id);

create table if not exists bridge_play_comments (
  comment_id text primary key,
  submission_id text not null references bridge_play_submissions(submission_id) on delete cascade,
  author_id text not null,
  author_name text,
  body text not null,
  created_at timestamptz not null
);
create index if not exists idx_play_comments_submission
  on bridge_play_comments (submission_id, created_at);

alter table bridge_play_submissions enable row level security;
alter table bridge_play_comments enable row level security;

-- ── coach assignments (0021, coach/learner Phase 3) ──────────────────────────

create table if not exists bridge_assignments (
  assignment_id text primary key,
  program_organization_id text,
  coach_id text not null,
  coach_name text,
  learner_id text not null,
  learner_name text,
  entry_id text not null,
  entry_kind text not null,
  entry_name text not null,
  note text,
  status text not null default 'assigned',
  session_id text,
  created_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists idx_assignments_learner
  on bridge_assignments (learner_id, created_at desc);
create index if not exists idx_assignments_coach
  on bridge_assignments (coach_id, created_at desc);
create index if not exists idx_assignments_session
  on bridge_assignments (session_id);

alter table bridge_assignments enable row level security;

-- ── instance scoping + copy provenance (0022, library rework Phase A) ────────
-- Scope columns land as idempotent alters (end-state replay; no backfill here
-- — the tenant-aware backfill lives in the bridge repo's own 0022).

alter table bridge_kb_sessions add column if not exists nexus_program_id text;
create index if not exists idx_kb_sessions_program
  on bridge_kb_sessions (nexus_program_id, created_by, created_at desc);

alter table bridge_kb_library add column if not exists scope_level text;
alter table bridge_kb_library add column if not exists nexus_program_id text;
alter table bridge_kb_library add column if not exists source_ref jsonb;
create index if not exists idx_kb_library_scope
  on bridge_kb_library (scope_level, nexus_program_id, created_by, created_at desc);

alter table bridge_play_submissions add column if not exists nexus_program_id text;
alter table bridge_assignments add column if not exists nexus_program_id text;
alter table bridge_assignments add column if not exists source_entry_id text;

-- 0023: library collections (curated mixed-kind groupings; designation unit)
create table if not exists bridge_library_collections (
  collection_id text primary key,
  program_organization_id text,
  nexus_program_id text,
  scope_level text,
  created_by text not null,
  record jsonb not null,
  created_at timestamptz not null
);
create index if not exists idx_blc_scope
  on bridge_library_collections (nexus_program_id, scope_level);
