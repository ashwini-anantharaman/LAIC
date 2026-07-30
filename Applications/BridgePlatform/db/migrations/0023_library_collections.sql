-- 0023: library collections — curated, mixed-kind groupings of library
-- entries (library-core LibraryCollection). The unit of designation: roles
-- (and later subscriptions/packages) grant visibility per collection.
-- jsonb-primary like the library itself; scalar columns for scope filtering.

create table if not exists bridge_library_collections (
  collection_id text primary key,
  program_organization_id text,
  nexus_program_id text,
  scope_level text,
  created_by text not null,
  record jsonb not null,
  created_at timestamptz not null
);

create index if not exists idx_blc_scope
  on bridge_library_collections (nexus_program_id, scope_level);
