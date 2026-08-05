-- UNUSED as of the tester v2 rework: saved views moved to the browser
-- (localStorage key `bridge.tester.views.v1`); this table is no longer read or
-- written. Kept as an applied-in-prod historical record — do not drop here.
--
-- 0021: saved views for the component tester. One row per named view mapping to
-- the full TesterView read model (id, name, the URL-state config, createdBy,
-- createdAt). Jsonb-primary like 0015/0018/0019/0020: the whole view lives in
-- `view`; scalar columns exist for identity and ordering only. Saved views are
-- program-wide dev/harness state — no org/program tenanting here.

create table if not exists bridge_tester_views (
  id text primary key,
  view jsonb not null,
  created_at timestamptz not null default now()
);

alter table bridge_tester_views enable row level security;
