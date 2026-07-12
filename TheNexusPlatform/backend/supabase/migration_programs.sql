-- Programs (Game / Edu category) — additive migration.
-- Run in Supabase SQL editor after schema.sql / migration_platform.sql.

create extension if not exists "uuid-ossp";

-- ── Programs ───────────────────────────────────────────────────────────────
create table if not exists programs (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  category    text not null check (category in ('game', 'edu')),
  created_at  timestamptz not null default now()
);

create index if not exists programs_org_id_idx on programs(org_id);

-- ── Join codes: allow program-scoped codes (no stage required) ──────────────
alter table join_codes alter column stage_node_id drop not null;
alter table join_codes add column if not exists program_id uuid references programs(id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'join_codes_target_check'
  ) then
    alter table join_codes add constraint join_codes_target_check
      check (stage_node_id is not null or program_id is not null);
  end if;
end $$;

create index if not exists join_codes_program_id_idx on join_codes(program_id);

-- ── Org memberships: track which program a teacher/coach belongs to ─────────
alter table org_memberships add column if not exists program_id uuid references programs(id) on delete set null;

create index if not exists org_memberships_program_id_idx on org_memberships(program_id);
