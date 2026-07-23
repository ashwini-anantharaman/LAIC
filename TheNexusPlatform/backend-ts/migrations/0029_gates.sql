-- Gates: customizable sign-up/sign-in pages at the PROGRAM level (later also
-- platform level). Each gate lives at /@/<org-slug>/<gate-slug>, decides
-- whether it allows sign-in / sign-up / both, who it's for, and where the
-- person lands. A program may have several. This is the org-portal pattern
-- pushed down to the program. Access itself is still resolved from
-- participation + role — a gate is the ENTRANCE, not a new permission.
create table if not exists gates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  program_id uuid not null,
  slug text not null,                              -- forms the URL, unique per org
  title text,
  subtitle text,
  allow_signin boolean not null default true,
  allow_signup boolean not null default false,
  approval_required boolean not null default false,
  landing text,                                    -- landing hint (reserved; v1 uses default routing)
  config jsonb not null default '{}'::jsonb,       -- branding/copy overrides
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists gates_org_slug_idx on gates (organization_id, slug);
create index if not exists gates_program_idx on gates (program_id);
grant select, insert, update, delete on gates to nexus_app;
