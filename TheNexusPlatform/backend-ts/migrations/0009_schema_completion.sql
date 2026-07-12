-- Slice 9 — Schema completion (Nexus v0.4 §7/§8/§18).
--
-- Additive: fills the field gaps on existing tables and creates the missing
-- object tables (relationships, affiliations, groups, RBAC, invitations,
-- identities), each org-scoped + RLS. Also adds the platform-admin RLS bypass
-- (Wall 1's `has_platform_role`). Does NOT touch app_shells or org-scoped users
-- (their own slices). Idempotent.

-- ── Field gaps: profiles ────────────────────────────────────────────────────
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists status text not null default 'active';

-- ── Field gaps: organizations ───────────────────────────────────────────────
alter table organizations add column if not exists short_name text;
alter table organizations add column if not exists organization_type text;
alter table organizations add column if not exists tenant_mode text not null default 'full_tenant';
alter table organizations add column if not exists parent_organization_id uuid references organizations(id) on delete set null;
alter table organizations add column if not exists status text not null default 'active';
alter table organizations add column if not exists mission_summary text;
alter table organizations add column if not exists website_url text;
alter table organizations add column if not exists logo_url text;
alter table organizations add column if not exists theme_json jsonb;
alter table organizations add column if not exists data_residency text not null default 'shared';
alter table organizations add column if not exists public_profile_enabled boolean not null default false;
alter table organizations add column if not exists created_by_user_id uuid references profiles(id) on delete set null;

-- ── Field gaps: programs ────────────────────────────────────────────────────
alter table programs add column if not exists status text not null default 'active';
alter table programs add column if not exists default_visibility text not null default 'private';
alter table programs add column if not exists owner_user_id uuid references profiles(id) on delete set null;
alter table programs add column if not exists metadata_json jsonb not null default '{}'::jsonb;

-- ── Field gaps: org_memberships (generalized scope) ─────────────────────────
alter table org_memberships add column if not exists scope_type text not null default 'organization';
alter table org_memberships add column if not exists scope_id uuid;
alter table org_memberships add column if not exists status text not null default 'active';

-- ── Identities (email/phone/provider → user) ────────────────────────────────
create table if not exists identities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  identifier_type text not null check (identifier_type in ('email','phone','google','apple')),
  identifier text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (identifier_type, identifier)
);
create index if not exists identities_user_idx on identities(user_id);

-- ── Groups (freeform; hierarchy via parent_group_id) ────────────────────────
create table if not exists groups (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  program_id uuid references programs(id) on delete set null,
  offering_id uuid references offerings(id) on delete set null,
  name text not null,
  label text,
  visibility text not null default 'private' check (visibility in ('private','organization','program','public')),
  parent_group_id uuid references groups(id) on delete set null,
  owner_user_id uuid references profiles(id) on delete set null,
  owner_organization_id uuid references organizations(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists groups_org_idx on groups(organization_id);
create index if not exists groups_parent_idx on groups(parent_group_id);

create table if not exists group_memberships (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists group_memberships_group_idx on group_memberships(group_id);

-- participants.group_id (now that groups exists)
alter table participants add column if not exists group_id uuid references groups(id) on delete set null;

-- ── Organization relationships ──────────────────────────────────────────────
create table if not exists organization_relationships (
  id uuid primary key default uuid_generate_v4(),
  source_organization_id uuid not null references organizations(id) on delete cascade,
  target_organization_id uuid not null references organizations(id) on delete cascade,
  relationship_type text not null check (relationship_type in
    ('parent','child','member','partner','affiliate','chapter_of','club_of','sponsor','host','collaborator')),
  status text not null default 'proposed' check (status in ('proposed','active','paused','ended')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists org_rel_source_idx on organization_relationships(source_organization_id);

-- ── Program ↔ organization affiliations ─────────────────────────────────────
create table if not exists program_organization_affiliations (
  id uuid primary key default uuid_generate_v4(),
  program_id uuid not null references programs(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  affiliation_type text not null check (affiliation_type in
    ('partner','club','coach_org','reviewer_org','host','sponsor','chapter','region','content_partner')),
  tenant_access_mode text not null default 'none' check (tenant_access_mode in ('none','limited_admin','full_subtenant')),
  visibility text not null default 'program' check (visibility in ('private','program','public')),
  status text not null default 'invited' check (status in ('invited','active','paused','archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists prog_org_aff_program_idx on program_organization_affiliations(program_id);

-- ── Program affiliations (actor → program) ──────────────────────────────────
create table if not exists program_affiliations (
  id uuid primary key default uuid_generate_v4(),
  program_id uuid not null references programs(id) on delete cascade,
  subject_type text not null check (subject_type in ('user','organization','group')),
  subject_id uuid not null,
  affiliation_type text not null check (affiliation_type in
    ('independent_coach','org_affiliated_coach','coach_org','club','school','reviewer','advisor','fellow','volunteer','instructor','learner_group','partner')),
  represented_organization_id uuid references organizations(id) on delete set null,
  status text not null default 'invited' check (status in ('invited','active','inactive','archived')),
  visibility text not null default 'program' check (visibility in ('private','program','public')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists prog_aff_program_idx on program_affiliations(program_id);

-- ── RBAC reference + assignments ────────────────────────────────────────────
create table if not exists roles (
  role_key text primary key,
  label text,
  default_scope text
);
create table if not exists permissions (
  permission_key text primary key,
  description text
);
create table if not exists role_permissions (
  role_key text not null references roles(role_key) on delete cascade,
  permission_key text not null references permissions(permission_key) on delete cascade,
  primary key (role_key, permission_key)
);
create table if not exists role_assignments (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,  -- null = global
  user_id uuid not null references profiles(id) on delete cascade,
  role_key text not null,
  scope_type text not null check (scope_type in ('global','organization','program','offering','group')),
  scope_id uuid,
  status text not null default 'active' check (status in ('active','invited','suspended','removed')),
  created_by_user_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists role_assignments_user_idx on role_assignments(user_id);
create index if not exists role_assignments_org_idx on role_assignments(organization_id);

-- Seed the canonical role keys (idempotent).
insert into roles (role_key, label, default_scope) values
  ('nexus_super_admin','Nexus Super Admin','global'),
  ('nexus_admin','Nexus Admin','global'),
  ('organization_owner','Organization Owner','organization'),
  ('organization_admin','Organization Admin','organization'),
  ('program_owner','Program Owner','program'),
  ('program_admin','Program Admin','program'),
  ('program_advisor','Program Advisor','program'),
  ('program_reviewer','Program Reviewer','program'),
  ('fellow','Fellow','program'),
  ('volunteer','Volunteer','program'),
  ('instructor','Instructor','program'),
  ('offering_owner','Offering Owner','offering'),
  ('offering_admin','Offering Admin','offering'),
  ('learner','Learner','offering'),
  ('participant','Participant','offering')
on conflict (role_key) do nothing;

-- ── Invitations (secure-token invites) ──────────────────────────────────────
create table if not exists invitations (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  program_id uuid references programs(id) on delete set null,
  offering_id uuid references offerings(id) on delete set null,
  group_id uuid references groups(id) on delete set null,
  token_hash text not null unique,
  email text,
  role text not null default 'learner',
  invited_by_user_id uuid references profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz,
  accepted_by_user_id uuid references profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invitations_org_idx on invitations(organization_id);

-- ── RLS: platform-admin bypass (Wall 1) ─────────────────────────────────────
-- Depends on role_assignments existing (created above).
create or replace function has_platform_role(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from role_assignments ra
    where ra.user_id = uid and ra.scope_type = 'global' and ra.status = 'active'
      and ra.role_key in ('nexus_super_admin','nexus_admin')
  );
$$;

-- Fold the bypass into the single membership helper → every existing policy that
-- calls nexus_is_org_member() gains the platform-admin bypass at once.
create or replace function nexus_is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_memberships m
    where m.org_id = target_org and m.profile_id = nexus_current_user_id()
  ) or has_platform_role(nexus_current_user_id());
$$;

-- ── RLS on the new org-scoped tables ────────────────────────────────────────
alter table groups enable row level security;
drop policy if exists nexus_org_scope on groups;
create policy nexus_org_scope on groups for all using (nexus_is_org_member(organization_id)) with check (nexus_is_org_member(organization_id));

alter table group_memberships enable row level security;
drop policy if exists nexus_org_scope on group_memberships;
create policy nexus_org_scope on group_memberships for all using (nexus_is_org_member(organization_id)) with check (nexus_is_org_member(organization_id));

alter table organization_relationships enable row level security;
drop policy if exists nexus_org_scope on organization_relationships;
create policy nexus_org_scope on organization_relationships for all
  using (nexus_is_org_member(source_organization_id) or nexus_is_org_member(target_organization_id))
  with check (nexus_is_org_member(source_organization_id));

alter table program_organization_affiliations enable row level security;
drop policy if exists nexus_org_scope on program_organization_affiliations;
create policy nexus_org_scope on program_organization_affiliations for all
  using (nexus_is_org_member(organization_id) or nexus_is_org_member((select org_id from programs p where p.id = program_id)))
  with check (nexus_is_org_member((select org_id from programs p where p.id = program_id)));

alter table program_affiliations enable row level security;
drop policy if exists nexus_org_scope on program_affiliations;
create policy nexus_org_scope on program_affiliations for all
  using (nexus_is_org_member((select org_id from programs p where p.id = program_id)))
  with check (nexus_is_org_member((select org_id from programs p where p.id = program_id)));

alter table role_assignments enable row level security;
drop policy if exists nexus_org_scope on role_assignments;
create policy nexus_org_scope on role_assignments for all
  using (organization_id is null or nexus_is_org_member(organization_id))
  with check (organization_id is null or nexus_is_org_member(organization_id));

alter table invitations enable row level security;
drop policy if exists nexus_org_scope on invitations;
create policy nexus_org_scope on invitations for all using (nexus_is_org_member(organization_id)) with check (nexus_is_org_member(organization_id));

-- identities: user-scoped; RLS comes with org-scoped users (Slice 10). roles /
-- permissions / role_permissions are global reference data (no org column) — no RLS.

-- ── Grants: nexus_app on the new tables ─────────────────────────────────────
grant select, insert, update, delete on all tables in schema public to nexus_app;
