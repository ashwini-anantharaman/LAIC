-- 0015: two-level versioning + KB derivation lineage (Knowledge Rework
-- Stage H). Jsonb-primary like 0013/0014: the full record lives in `record`;
-- scalar columns exist for identity/ordering only.
--
-- No column changes are needed for KB derivation lineage or player version
-- bindings — those are additive fields inside the existing `record` jsonb of
-- bridge_kbs / bridge_kb_players, which round-trips the TS model as-is.

-- Immutable committed snapshots of a knowledge item ("item version 1,2,3…").
create table if not exists bridge_kb_item_versions (
  item_id text not null,
  version_number integer not null,
  record jsonb not null,
  committed_at timestamptz not null,
  primary key (item_id, version_number)
);
create index if not exists idx_kb_item_versions_item
  on bridge_kb_item_versions (item_id, version_number desc);

alter table bridge_kb_item_versions enable row level security;

-- Published KB releases: a manifest pinning committed item versions + the
-- compiled artifact that serves them ("KB version 1,2,3…").
create table if not exists bridge_kb_versions (
  version_id text primary key,
  kb_id text not null,
  version_number integer not null,
  record jsonb not null,
  published_at timestamptz not null,
  unique (kb_id, version_number)
);
create index if not exists idx_kb_versions_kb
  on bridge_kb_versions (kb_id, version_number desc);

alter table bridge_kb_versions enable row level security;
