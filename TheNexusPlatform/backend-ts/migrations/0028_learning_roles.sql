-- Custom roles for the Learning Platform (its own People tab, mirroring the
-- Nexus scoped-role model but with LEARNING-app areas). A role is a name plus
-- per-area view/edit perms; assignments are email-keyed so they survive from
-- invite → activation, exactly like program_role_assignments.
-- Idempotent: replayed on every boot.

create table if not exists learning_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  program_id uuid not null,
  name text not null,
  perms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_learning_roles_program on learning_roles (program_id);

create table if not exists learning_role_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  program_id uuid not null,
  email text not null,
  role_id uuid not null,
  created_at timestamptz not null default now()
);
create unique index if not exists learning_role_assignment_uniq
  on learning_role_assignments (program_id, lower(email));
