-- 0008: Phase 14 table & play experience (BP §8.2/§8.4/§9.1/§15.1).
-- Lifecycle events get their OWN table + seq space: bridge_events' seq
-- belongs to the engine's single-writer controller and must stay gap-free
-- for refold/undo. Saved boards (library) are distinct from bridge_boards
-- (per-session board rows). Share links are short immutable capabilities.

create table if not exists bridge_session_lifecycle (
  bridge_session_id text not null references bridge_sessions,
  lifecycle_seq integer not null,
  ts timestamptz not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  primary key (bridge_session_id, lifecycle_seq)
);

create table if not exists bridge_saved_boards (
  board_id uuid primary key,
  name text not null,
  board jsonb not null,
  context_snapshot jsonb not null,
  program_organization_id text,
  tags jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null
);

create table if not exists bridge_share_links (
  token text primary key,
  board_id uuid not null references bridge_saved_boards,
  created_by text not null,
  created_at timestamptz not null
);

-- Position snapshots reuse 0002's bridge_position_snapshots; the full record
-- (board + event prefix + package/config) lives in the state jsonb column.

create index if not exists idx_saved_boards_org
  on bridge_saved_boards (program_organization_id);

alter table bridge_session_lifecycle enable row level security;
alter table bridge_saved_boards enable row level security;
alter table bridge_share_links enable row level security;
