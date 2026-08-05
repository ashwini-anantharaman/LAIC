-- Per-program platform role assignments — who holds which PRE-BUILT platform
-- role (Bridge's coach/reviewer/learner/…). Administered from the platform's
-- own UI (e.g. Bridge → People & Roles) but stored HERE: Nexus stays the one
-- identity/access authority, and login/test-as keeps happening at the org
-- portal. Email-keyed like program_role_assignments so an assignment can
-- precede account activation. One role per person per platform per program.
create table if not exists platform_role_assignments (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  platform text not null,
  email text not null,
  role text not null,
  assigned_by_user_id uuid,
  created_at timestamptz not null default now(),
  unique (program_id, platform, email)
);
create index if not exists platform_role_assignments_program_idx on platform_role_assignments(program_id);
create index if not exists platform_role_assignments_email_idx on platform_role_assignments(email);

grant select, insert, update, delete on platform_role_assignments to nexus_app;

alter table platform_role_assignments enable row level security;
-- People data: strict org membership only — the platform operator cannot read
-- an org's assignments (0021's wall applies to this table too).
drop policy if exists nexus_org_scope on platform_role_assignments;
create policy nexus_org_scope on platform_role_assignments
  for all using (nexus_is_org_member_strict(organization_id))
  with check (nexus_is_org_member_strict(organization_id));
