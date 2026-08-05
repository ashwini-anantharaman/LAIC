-- 0020: per-user table appearance (skins & layout). One row per user mapping to
-- the full TableAppearance read model (skin, hand layout, bid pad, centre frame,
-- fan geometry, colour overrides). Jsonb-primary like 0015/0018/0019: the whole
-- appearance lives in `config`; scalar columns exist for identity and audit
-- only. Appearance is a per-user preference — no org/program tenanting here.

create table if not exists bridge_table_config (
  user_id text primary key,
  config jsonb not null,
  updated_at timestamptz not null default now()
);

alter table bridge_table_config enable row level security;
