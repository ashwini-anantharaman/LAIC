-- 0015: the fellows' library (2026-07-16 UI rework). Saved snapshots of
-- table artifacts — deals, boards, table lineups, plays (drills/puzzles are
-- reserved kinds). Jsonb-primary like 0013/0014: the full LibraryEntry lives
-- in `entry`; scalar columns exist for filtering only.

create table if not exists bridge_kb_library (
  entry_id text primary key,
  kind text not null,
  created_by text not null,
  entry jsonb not null,
  created_at timestamptz not null
);
create index if not exists idx_kb_library_kind on bridge_kb_library (kind, created_at desc);
create index if not exists idx_kb_library_user on bridge_kb_library (created_by, created_at desc);

alter table bridge_kb_library enable row level security;
