-- Team & Roles at every altitude. The battle-tested program-roles tables gain
-- SCOPE: program_id null = an ORGANIZATION-level role; organization_id null
-- too = a NEXUS (platform) level role. Same builder, same assignment flow.
alter table program_roles alter column program_id drop not null;
alter table program_roles alter column organization_id drop not null;
alter table program_role_assignments alter column program_id drop not null;
alter table program_role_assignments alter column organization_id drop not null;

-- Uniqueness per scope (Postgres treats NULLs as distinct in the old unique).
create unique index if not exists program_role_assignments_org_scope_key
  on program_role_assignments (organization_id, email) where program_id is null and organization_id is not null;
create unique index if not exists program_role_assignments_platform_scope_key
  on program_role_assignments (email) where program_id is null and organization_id is null;

-- Platform-operator invitations have no organization.
alter table invitations alter column organization_id drop not null;

-- Org-LEVEL plain members (confined by a custom org role) join the vocabulary.
alter table org_memberships drop constraint if exists org_memberships_role_check;
alter table org_memberships add constraint org_memberships_role_check
  check (role in ('owner', 'administrator', 'instructor', 'member'));
