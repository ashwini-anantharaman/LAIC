-- 0014: sessions v2 (Knowledge Rework Stage F). Jsonb-primary like 0013:
-- the full SessionRecord (incl. the event stream with decision traces)
-- lives in `record`; scalar columns exist for tenant/KB filtering only.

create table if not exists bridge_kb_sessions (
  session_id text primary key,
  kb_id text not null,
  created_by text not null,
  record jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists idx_kb_sessions_kb on bridge_kb_sessions (kb_id, created_at desc);
create index if not exists idx_kb_sessions_user on bridge_kb_sessions (created_by, created_at desc);

alter table bridge_kb_sessions enable row level security;
