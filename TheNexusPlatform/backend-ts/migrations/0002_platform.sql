-- LIAC Platform Layer — additive migration.
-- Run in Supabase SQL editor after schema.sql / migration_v2.sql.
-- Does NOT touch legacy LIAC wedge tables (sources, concepts, simulations).

create extension if not exists "uuid-ossp";

-- ── Extend profiles ─────────────────────────────────────────────────────────
alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists updated_at timestamptz not null default now();

-- Relax role constraint to include platform roles (drop/recreate if exists).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
  ) then
    alter table profiles drop constraint profiles_role_check;
  end if;
end $$;

alter table profiles add constraint profiles_role_check
  check (role in ('student', 'teacher', 'org_admin', 'platform_admin'));

-- ── Organizations ───────────────────────────────────────────────────────────
create table if not exists organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text unique not null,
  owner_id    uuid references profiles(id) on delete set null,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists organizations_owner_id_idx on organizations(owner_id);
create index if not exists organizations_slug_idx on organizations(slug);

-- ── Challenges (1 per org for v1) ─────────────────────────────────────────────
create table if not exists challenges (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null unique references organizations(id) on delete cascade,
  enabled     boolean not null default false,
  name        text,
  created_at  timestamptz not null default now()
);

-- ── Challenge stage type config (UI checkboxes) ───────────────────────────────
create table if not exists challenge_stage_config (
  id            uuid primary key default uuid_generate_v4(),
  challenge_id  uuid not null references challenges(id) on delete cascade,
  stage_type    text not null check (stage_type in ('international', 'national', 'state', 'chapter')),
  position      int not null default 0,
  enabled       boolean not null default true,
  unique (challenge_id, stage_type)
);

create index if not exists challenge_stage_config_challenge_id_idx
  on challenge_stage_config(challenge_id);

-- ── Stage hierarchy tree ──────────────────────────────────────────────────────
create table if not exists stage_nodes (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id) on delete cascade,
  challenge_id  uuid references challenges(id) on delete cascade,
  parent_id     uuid references stage_nodes(id) on delete cascade,
  stage_type    text not null check (stage_type in ('international', 'national', 'state', 'chapter')),
  name          text not null,
  depth         int not null default 0,
  path          text not null default '/',
  discord_url   text,
  event_at      timestamptz,
  qualifier_status text default 'pending',
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists stage_nodes_org_id_idx on stage_nodes(org_id);
create index if not exists stage_nodes_parent_id_idx on stage_nodes(parent_id);
create index if not exists stage_nodes_path_idx on stage_nodes(org_id, path);
create index if not exists stage_nodes_challenge_id_idx on stage_nodes(challenge_id);

-- ── Join codes ────────────────────────────────────────────────────────────────
create table if not exists join_codes (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references organizations(id) on delete cascade,
  stage_node_id   uuid not null references stage_nodes(id) on delete cascade,
  code            text unique not null,
  kind            text not null check (kind in ('student', 'teacher', 'administrator')),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists join_codes_org_id_idx on join_codes(org_id);
create index if not exists join_codes_stage_node_id_idx on join_codes(stage_node_id);
create index if not exists join_codes_code_idx on join_codes(code);

-- ── Org permission defaults (from org-setup UI) ───────────────────────────────
create table if not exists org_permission_defaults (
  id                    uuid primary key default uuid_generate_v4(),
  org_id                uuid not null references organizations(id) on delete cascade,
  role                  text not null check (role in ('administrator', 'teacher')),
  default_access        text not null check (default_access in ('view', 'edit', 'per_level')),
  per_level_overrides   jsonb not null default '{}'::jsonb,
  unique (org_id, role)
);

-- ── Org memberships ───────────────────────────────────────────────────────────
create table if not exists org_memberships (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references organizations(id) on delete cascade,
  profile_id      uuid not null references profiles(id) on delete cascade,
  role            text not null check (role in ('owner', 'administrator', 'teacher')),
  stage_node_id   uuid references stage_nodes(id) on delete set null,
  access          text not null default 'view' check (access in ('view', 'edit')),
  created_at      timestamptz not null default now(),
  unique (org_id, profile_id, stage_node_id)
);

create index if not exists org_memberships_org_id_idx on org_memberships(org_id);
create index if not exists org_memberships_profile_id_idx on org_memberships(profile_id);
create index if not exists org_memberships_stage_node_id_idx on org_memberships(stage_node_id);

-- ── Student registrations (learning platform writes on join-code signup) ────────
create table if not exists student_registrations (
  id                      uuid primary key default uuid_generate_v4(),
  org_id                  uuid not null references organizations(id) on delete cascade,
  stage_node_id           uuid not null references stage_nodes(id) on delete cascade,
  profile_id              uuid not null references profiles(id) on delete cascade,
  join_code_id            uuid references join_codes(id) on delete set null,
  current_stage_node_id   uuid references stage_nodes(id) on delete set null,
  registered_at           timestamptz not null default now(),
  unique (profile_id, org_id)
);

create index if not exists student_registrations_org_id_idx on student_registrations(org_id);
create index if not exists student_registrations_stage_node_id_idx on student_registrations(stage_node_id);
create index if not exists student_registrations_profile_id_idx on student_registrations(profile_id);

-- ── Link learning platform tables ─────────────────────────────────────────────
alter table courses add column if not exists org_id uuid references organizations(id) on delete set null;
alter table courses add column if not exists stage_node_id uuid references stage_nodes(id) on delete set null;
alter table courses add column if not exists teacher_profile_id uuid references profiles(id) on delete set null;

alter table enrollments add column if not exists profile_id uuid references profiles(id) on delete set null;

create index if not exists courses_org_id_idx on courses(org_id);
create index if not exists courses_stage_node_id_idx on courses(stage_node_id);
create index if not exists enrollments_profile_id_idx on enrollments(profile_id);
