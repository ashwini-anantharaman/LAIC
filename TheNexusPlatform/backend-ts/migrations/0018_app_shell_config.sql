-- App Shell config + immutable version snapshots (Phase 4, prototype §D14).
--
-- An App Shell is ONLY configuration: identity, branding, copy, auth methods,
-- signup fields, role buttons, onboarding questions, navigation, modules,
-- content refs. One shared runtime renders any shell's config. The working
-- config lives on registered_apps.shell_config; publishing snapshots it
-- immutably into app_config_versions (the runtime serves the latest published
-- version, the editor edits the working copy).

alter table registered_apps add column if not exists shell_config jsonb not null default '{}';

create table if not exists app_config_versions (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  registered_app_id uuid not null references registered_apps(id) on delete cascade,
  version integer not null,
  config jsonb not null,
  published_by_user_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (registered_app_id, version)
);
create index if not exists app_config_versions_app_idx on app_config_versions(registered_app_id);

grant select, insert, update, delete on app_config_versions to nexus_app;

alter table app_config_versions enable row level security;
drop policy if exists nexus_org_scope on app_config_versions;
create policy nexus_org_scope on app_config_versions
  for all using (nexus_is_org_member(organization_id))
  with check (nexus_is_org_member(organization_id));
