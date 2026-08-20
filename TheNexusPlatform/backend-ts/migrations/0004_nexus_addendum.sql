-- Nexus Addendum + Review-Notes migration — additive.
-- Run in Supabase SQL editor after schema.sql / migration_platform.sql / migration_programs.sql.
-- Covers: program label/description/icon fields, program-scoped groups (stage_nodes.program_id),
-- unified invitation columns on join_codes, canonical instructor role, generic integrations table,
-- and org-scoped Row Level Security policies.

create extension if not exists "uuid-ossp";

-- ── Programs: description, icon, and configurable role-label overrides ──────
alter table programs add column if not exists description text;
alter table programs add column if not exists icon text;
alter table programs add column if not exists instructor_label text;
alter table programs add column if not exists learner_label text;

-- ── Program-scoped Groups: tag each stage_node with its owning program ──────
alter table stage_nodes add column if not exists program_id uuid references programs(id) on delete cascade;
create index if not exists stage_nodes_program_id_idx on stage_nodes(program_id);

-- ── Canonical instructor role (was "teacher") on org_memberships ────────────
-- Migrate existing rows, then relax the CHECK constraint to the new vocabulary.
update org_memberships set role = 'instructor' where role = 'teacher';

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'org_memberships_role_check'
  ) then
    alter table org_memberships drop constraint org_memberships_role_check;
  end if;
end $$;

--
-- STATED AS THE UNION, not as this file's era. The runner has no ledger and
-- replays every migration on every run (scripts/runMigrations.ts), so a check
-- constraint here is not a historical step — it is asserted again today, against
-- today's rows. Naming only the roles this file introduced meant the ALTER could
-- not validate once later roles existed, and a failed ALTER aborts the whole run:
-- every migration after it, core and platform packs alike, silently never applied.
-- Widening later is safe; narrowing is what breaks, so each definition states
-- every role in use.
alter table org_memberships add constraint org_memberships_role_check
  check (role in ('owner', 'administrator', 'instructor', 'member', 'learner'));

-- ── Unified Invitation columns on join_codes ────────────────────────────────
alter table join_codes add column if not exists delivery_method text not null default 'join_code'
  check (delivery_method in ('join_code', 'email_direct'));
alter table join_codes add column if not exists email text;
alter table join_codes add column if not exists max_uses int;
alter table join_codes add column if not exists uses_remaining int;
alter table join_codes add column if not exists expires_at timestamptz;
alter table join_codes add column if not exists created_by_user_id uuid references profiles(id) on delete set null;

-- ── Integrations (generic external tools — not hardcoded to Discord) ────────
create table if not exists integrations (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  program_id        uuid references programs(id) on delete cascade,
  integration_type  text not null check (integration_type in ('discord')),
  config            jsonb not null default '{}'::jsonb,
  permission_level  text not null default 'per_level' check (permission_level in ('can_edit', 'can_view', 'per_level')),
  status            text not null default 'active',
  created_at        timestamptz not null default now()
);

create index if not exists integrations_organization_id_idx on integrations(organization_id);
create index if not exists integrations_program_id_idx on integrations(program_id);

-- ── Row Level Security: org-scoped tenant isolation ─────────────────────────
-- Every org-owned row is only visible to callers holding an org_memberships row
-- for that org. The backend's service-role key bypasses RLS (BYPASSRLS), so this
-- is defense-in-depth for any future direct/anon client access.
--
-- Helper: is the current auth user a member of the given org?
create or replace function nexus_is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_memberships m
    where m.org_id = target_org and m.profile_id = auth.uid()
  );
$$;

-- organizations
alter table organizations enable row level security;
drop policy if exists org_member_read on organizations;
create policy org_member_read on organizations
  for select using (nexus_is_org_member(id) or owner_id = auth.uid());
drop policy if exists org_member_write on organizations;
create policy org_member_write on organizations
  for all using (nexus_is_org_member(id) or owner_id = auth.uid())
  with check (nexus_is_org_member(id) or owner_id = auth.uid());

-- Generic org-scoped tables (all have an org_id column).
do $$
declare
  t text;
begin
  foreach t in array array[
    'programs', 'stage_nodes', 'join_codes', 'org_memberships',
    'student_registrations', 'challenges'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists nexus_org_scope on %I;', t);
    execute format(
      'create policy nexus_org_scope on %I for all using (nexus_is_org_member(org_id)) with check (nexus_is_org_member(org_id));',
      t
    );
  end loop;
end $$;

-- integrations uses organization_id rather than org_id.
alter table integrations enable row level security;
drop policy if exists nexus_org_scope on integrations;
create policy nexus_org_scope on integrations
  for all using (nexus_is_org_member(organization_id))
  with check (nexus_is_org_member(organization_id));
