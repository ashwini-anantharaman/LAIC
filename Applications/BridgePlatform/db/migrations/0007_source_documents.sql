-- 0007: uploaded source documents + deterministic passages (Phase 13 task 3;
-- Bridge plan §12.4 — locators resolve to real text, citations anchor to
-- passages). Documents are replaced wholesale per source on re-upload.

create table if not exists bridge_source_documents (
  source_id text primary key references bridge_knowledge_sources (source_id),
  file_name text not null,
  media_type text not null,
  char_count integer not null,
  uploaded_at timestamptz not null,
  text text not null
);

create table if not exists bridge_source_passages (
  passage_id text primary key,
  source_id text not null references bridge_knowledge_sources (source_id),
  ordinal integer not null,
  anchor text not null,
  text text not null,
  unique (source_id, ordinal)
);

create index if not exists idx_source_passages_source
  on bridge_source_passages (source_id, ordinal);

alter table bridge_source_documents enable row level security;
alter table bridge_source_passages enable row level security;
