-- M4 readiness: tag knowledge chunks for external Coach integration
alter table document_chunks
  add column if not exists concept_ids text[] not null default '{}',
  add column if not exists skill_ids text[] not null default '{}',
  add column if not exists chunk_type text not null default 'explanation';
