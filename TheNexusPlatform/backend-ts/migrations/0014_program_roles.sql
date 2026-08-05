-- Per-program custom roles (Nexus §3.5 delegation, "Team & Roles").
--
-- A program administrator defines named roles for their program; each role is a
-- name + an access map over the five permissionable areas
-- (learning / appbuilder / community / teams / partners), where each granted
-- area has a level: view | edit | comment. This is the prototype's exact model
-- and is intentionally separate from the global role catalog in 0009 (whose
-- role_key is a global primary key and cannot carry per-program custom names).

create table if not exists program_roles (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  name text not null,
  -- { "<area>": "view" | "edit" | "comment", ... } — only granted areas appear.
  perms jsonb not null default '{}',
  created_by_user_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (program_id, name)
);
create index if not exists program_roles_program_idx on program_roles(program_id);
create index if not exists program_roles_org_idx on program_roles(organization_id);

grant select, insert, update, delete on program_roles to nexus_app;

alter table program_roles enable row level security;
drop policy if exists nexus_org_scope on program_roles;
create policy nexus_org_scope on program_roles
  for all using (nexus_is_org_member(organization_id))
  with check (nexus_is_org_member(organization_id));
