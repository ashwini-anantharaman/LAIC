-- 0019: role-based access catalogue (§7 area gating, extended). One row per
-- catalogue — today just the program-wide "global" — mapping gateable feature
-- keys to the roles allowed to see/use them. Jsonb-primary like 0015/0018: the
-- full AccessCatalogue lives in `catalogue`; scalar columns exist for identity,
-- tenant (org overrides land later without migration), and audit only.

create table if not exists bridge_access_catalogue (
  catalogue_id text primary key,
  program_organization_id text,
  catalogue jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table bridge_access_catalogue enable row level security;
