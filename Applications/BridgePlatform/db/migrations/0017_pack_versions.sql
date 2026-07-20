-- 0017: knowledge-set (pack) auto-version snapshots (2026-07 UX rework).
-- Jsonb-primary like 0016: the full KbPackVersion lives in `record`; scalar
-- columns exist for identity/ordering only. Every set save writes a snapshot
-- (deduped when identical to the latest); restore re-saves, minting the next.

create table if not exists bridge_kb_pack_versions (
  pack_id text not null,
  version_number integer not null,
  kb_id text not null,
  record jsonb not null,
  saved_at timestamptz not null,
  primary key (pack_id, version_number)
);
create index if not exists idx_kb_pack_versions_pack
  on bridge_kb_pack_versions (pack_id, version_number desc);
create index if not exists idx_kb_pack_versions_kb
  on bridge_kb_pack_versions (kb_id);

alter table bridge_kb_pack_versions enable row level security;
