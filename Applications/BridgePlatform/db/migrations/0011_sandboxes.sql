-- 0011: coach sandboxes — curated configuration surfaces (the prototype's
-- visibility layer, first-class). The full record lives in jsonb with scalar
-- columns for tenant queries, matching the hybrid mapping of 0005.

create table if not exists bridge_sandboxes (
  sandbox_id text primary key,
  program_organization_id text,
  owner_id text,
  record jsonb not null,
  updated_at timestamptz not null
);

create index if not exists idx_sandboxes_org
  on bridge_sandboxes (program_organization_id);

alter table bridge_sandboxes enable row level security;

-- Sandbox lineage on AI player profiles (enforced in the service layer).
alter table bridge_ai_player_profiles
  add column if not exists sandbox_id text;
