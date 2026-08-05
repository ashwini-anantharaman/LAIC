-- Assign people to the per-program custom roles (§3.5 Team & Roles).
--
-- Keyed by email so an assignment can be made at invite time (before the
-- person has an account) and still resolve once they activate. One role per
-- person per program (the prototype's model); reassigning upserts.
create table if not exists program_role_assignments (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  role_id uuid not null references program_roles(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (program_id, email)
);
create index if not exists program_role_assignments_program_idx on program_role_assignments(program_id);
create index if not exists program_role_assignments_email_idx on program_role_assignments(email);

grant select, insert, update, delete on program_role_assignments to nexus_app;

alter table program_role_assignments enable row level security;
drop policy if exists nexus_org_scope on program_role_assignments;
create policy nexus_org_scope on program_role_assignments
  for all using (nexus_is_org_member(organization_id))
  with check (nexus_is_org_member(organization_id));
