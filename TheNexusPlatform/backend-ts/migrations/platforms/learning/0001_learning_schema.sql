-- Learning Platform schema — the org-scoped home in the shared cluster
-- (Phase 4 fold).
--
-- PROVENANCE: the row shape mirrors what the Learning app
-- (Components/laic-learning-platform, src/lib/supabase.ts toRow/fromRow)
-- reads/writes against its standalone Supabase `learning_objects` table today.
-- Phase 6 rewires the app to this home through the learning_service seam;
-- until then this is the prepared, org-scoped landing zone.
--
-- Unlike that standalone table, every object here is stamped with the org (and
-- optionally program) that owns it — same partition keys as the rest of the
-- org space. Idempotent.

create table if not exists learning_objects (
  id text primary key,
  -- Org-space partition keys (Phase 4): who owns this object.
  organization_id uuid,
  program_id uuid,
  -- The app's own fields (supabase.ts row shape).
  type text not null,
  title text not null default '',
  owner_id text,
  owner_name text,
  status text not null default 'draft',
  scope text not null default 'bridge',
  reuse_count integer not null default 0,
  description text not null default '',
  estimated_time text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The app persists in-progress pipeline drafts here (supabase.ts toRow); added
-- when the LAIC content was migrated in. Idempotent for replays.
alter table learning_objects add column if not exists pipeline_draft jsonb;

create index if not exists idx_learning_objects_org on learning_objects (organization_id, updated_at desc);
create index if not exists idx_learning_objects_program on learning_objects (program_id);
create index if not exists idx_learning_objects_owner on learning_objects (owner_id);

alter table learning_objects enable row level security;
