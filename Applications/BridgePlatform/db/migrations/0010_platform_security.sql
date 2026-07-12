-- 0010: Phase 16 platform & security (BP §21, §3.4-3.5).
-- Audit log is APPEND-ONLY: the application never updates or deletes rows;
-- revoke UPDATE/DELETE from application roles when roles are provisioned.

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

-- §3.4: bridge-owned extension of a Nexus program organization.
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

-- §3.5: many-to-many coach affiliations; context switching is explicit.
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

alter table bridge_audit_log enable row level security;
alter table bridge_program_organization_profiles enable row level security;
alter table bridge_coach_affiliations enable row level security;

-- §3.5: the user's explicitly selected acting organization (context switch).
alter table bridge_user_profiles
  add column if not exists active_program_organization_id text;
