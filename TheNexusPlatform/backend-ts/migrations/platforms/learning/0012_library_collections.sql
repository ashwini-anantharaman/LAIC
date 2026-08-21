-- 0012 — folders that exist on the server, and grants that name one.
--
-- Until now a "folder" was a string. The Studio kept its folder tree in the
-- authoring browser's localStorage (objectCollectionsStore.ts), and every
-- consumer — including the Nexus Content Library tab — reconstructed a flat list
-- by reading the `collection_ids`/`collection_names` each object happened to
-- carry (0003, 0011). That has three consequences worth naming, because this
-- table exists to end all three:
--
--   1. An EMPTY folder did not exist. Nothing carried its name, so nothing could
--      show it. You could not create a folder and then fill it.
--   2. Folders were PER AUTHOR. Two people had two different trees for the same
--      content, and neither could see the other's.
--   3. A folder could not be SHARED, because there was no row to share. Sharing
--      was per object only (0007), so "give these three people this folder and
--      nothing else" had to be spelled as a grant per object, and said nothing
--      about objects added later.
--
-- ── WHY id IS text ─────────────────────────────────────────────────────────
-- learning_objects.id and learning_assets.id are text, and both carry folder
-- membership as a jsonb ARRAY OF IDS. A server folder id has to be droppable
-- straight into those arrays beside the Studio's legacy 'ocol-…' strings, or
-- every reader needs to know which of two id spaces it is holding. Text, one
-- space, prefixed 'lcol-' so its origin is legible at a glance.
--
-- ── NESTING ────────────────────────────────────────────────────────────────
-- parent_id, self-referencing, null = a root folder of this program's library.
-- ON DELETE CASCADE: deleting a folder deletes its descendants, because a
-- subfolder whose parent is gone is not a fact about anything. It does NOT
-- delete the content filed inside — that lives in learning_objects, keeps its
-- own row, and simply becomes unfiled. Losing a folder must never mean losing
-- content.
--
-- A UNIQUE SIBLING NAME, and a coalesced parent to get it. Postgres treats NULLs
-- as distinct in a unique index, so ('B2F3', null) could be inserted twice at the
-- root; coalescing to a sentinel makes "one B2F3 at the top level" actually hold.
--
-- ── GRANTS: THE SUBTREE, NOT THE FOLDER ────────────────────────────────────
-- learning_collection_grants names ONE folder, and means that folder AND
-- everything beneath it. Subfolders are not granted individually and do not carry
-- their own rows — "Nitin can see B2F3" is one fact, and it must not silently
-- stop being true when someone adds a fifth subfolder. Inheritance therefore
-- lives in the read path as a recursive walk (see collectionSubtreeFor in
-- orgGraphRepo.ts), never as copied rows that can drift out of step with the tree.
--
-- Same four subject kinds as learning_object_grants after 0008/0010 — profile,
-- role, club, app — so a folder is shareable with exactly who a single object is,
-- and the two share one vocabulary rather than inventing a second.
--
-- CONFINEMENT is enforced in the endpoint, not here, for the same reason 0007
-- gives: a foreign key can say a profile exists, never that it belongs to the
-- club that owns this folder. The absence of a database constraint is not the
-- absence of the rule.
--
-- Replayed on every `npm run migrate` (see ../README.md) — end-state and
-- idempotent, never drop-and-rebuild.

create table if not exists learning_collections (
  id               text primary key,
  organization_id  uuid not null,
  -- The program whose library this folder belongs to. Null would mean "every
  -- program's", which is never what a folder is.
  program_id       uuid,
  parent_id        text references learning_collections(id) on delete cascade,
  name             text not null,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A folder with no name is a folder nobody can refer to.
  constraint learning_collections_name_not_empty check (char_length(btrim(name)) > 0)
);

comment on table learning_collections is
  'Content Library folders, per program, nestable via parent_id. Replaces the Studio''s per-browser localStorage tree as the shared truth about folders.';
comment on column learning_collections.id is
  'Text, prefixed lcol-, so it drops into learning_objects.collection_ids beside the Studio''s legacy ocol- ids without a second id space.';
comment on column learning_collections.parent_id is
  'Parent folder; null = a root folder of this program''s library. Cascades on delete — descendants go, filed CONTENT does not.';

-- One folder of a given name per parent, per program. Coalesce because a unique
-- index treats NULL parents as all different from each other.
create unique index if not exists idx_learning_collections_sibling_name
  on learning_collections (
    organization_id,
    coalesce(program_id::text, '-'),
    coalesce(parent_id, '-'),
    lower(btrim(name))
  );

-- The library listing: this program's tree.
create index if not exists idx_learning_collections_program
  on learning_collections (organization_id, program_id);

-- The recursive walk down from a granted folder.
create index if not exists idx_learning_collections_parent
  on learning_collections (parent_id);

create table if not exists learning_collection_grants (
  collection_id  text not null references learning_collections(id) on delete cascade,
  subject_type   text not null check (subject_type in ('profile', 'role', 'club', 'app')),
  subject_id     text not null,
  level          text not null check (level in ('view', 'edit', 'admin')),
  granted_by     uuid,
  created_at     timestamptz not null default now(),
  -- One grant per subject per folder; re-sharing at a different level is an
  -- upsert. Two rows disagreeing about one person's level has no correct answer.
  primary key (collection_id, subject_type, subject_id)
);

comment on table learning_collection_grants is
  'Who may see a folder. Names ONE folder and means its whole subtree — inheritance is a read-time walk, never copied rows.';

-- "Which folders am I allowed into?" — the read path's join, per viewer.
create index if not exists idx_learning_collection_grants_subject
  on learning_collection_grants (subject_type, subject_id);

-- "Who is this folder shared with?" — the share sheet, per folder.
create index if not exists idx_learning_collection_grants_collection
  on learning_collection_grants (collection_id);

-- Same wall as the rest of the pack. 9000_nexus_hardening.sql picks both tables
-- up by their learning_% names for the grants; the policy is declared here too so
-- a partial apply never leaves a table with RLS on and nothing to satisfy it.
alter table learning_collections enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'learning_service') then
    execute 'revoke all on table learning_collections from public';
    execute 'grant select, insert, update, delete on table learning_collections to learning_service';
    execute 'revoke all on table learning_collection_grants from public';
    execute 'grant select, insert, update, delete on table learning_collection_grants to learning_service';
    execute 'drop policy if exists learning_collections_service_scope on learning_collections';
    execute $pol$
      create policy learning_collections_service_scope on learning_collections
        for all to learning_service
        using (nexus_platform_org_check(organization_id::text))
        with check (nexus_platform_org_check(organization_id::text));
    $pol$;
  end if;
end $$;

-- ── TWO WRITERS, TWO ID SPACES ─────────────────────────────────────────────
--
-- learning_objects.collection_ids is written by two things that know nothing
-- about each other:
--
--   the Content Studio's autosave  sends the folder ids from the AUTHOR'S BROWSER
--                                  ('ocol-…', objectCollectionsStore.ts)
--   PUT …/objects/:id/folders      sends PROGRAM folder ids ('lcol-…', this file)
--
-- Both used to replace the whole array, so whichever wrote last erased the other.
-- Concretely: a club mentor files a tutorial into B2F3 › Tutorials, types one more
-- character in the Studio, and 2.5 seconds later the autosave puts the array back
-- to their own local folders — the tutorial silently leaves the shared folder,
-- with no error anywhere, because both writes succeeded.
--
-- The fix is an ownership rule rather than a lock: each writer replaces its own id
-- space and preserves the other's. Neither has to know the other exists.
--
-- ONE FUNCTION PER WRITER, returning ids and names TOGETHER. An earlier attempt
-- used a generic prefix-merge for each array separately, which quietly lost the
-- Studio's folder NAMES: names for ids the writer had not sent were re-resolved
-- from learning_collections, and a Studio folder has no row there to resolve. Ids
-- and names are one fact about one folder (0003 keeps them side by side), so they
-- are computed in one place from one input.
--
-- Names for lcol- ids are always looked up rather than trusted from a payload,
-- which also means a folder RENAME propagates the next time anything touches the
-- row.

drop function if exists learning_merge_collection_ids(jsonb, jsonb, text);
drop function if exists learning_merge_collection_names(jsonb, jsonb, jsonb);

/*
 * The Content Studio saved an object. Its folder list is the author's own; the
 * program library's folders on this row are none of its business and survive.
 */
create or replace function learning_apply_studio_folders(
  existing_ids    jsonb,
  incoming_ids    jsonb,
  incoming_names  jsonb
) returns jsonb
language sql
stable
as $fn$
  with kept as (
    -- The program-library folders already on this row, with their CURRENT names.
    select c.id, c.name
    from jsonb_array_elements_text(coalesce(existing_ids, '[]'::jsonb)) as t(id)
    join learning_collections c on c.id = t.id
    where t.id like 'lcol-%'
  ),
  ids as (
    select t.id from jsonb_array_elements_text(coalesce(incoming_ids, '[]'::jsonb)) as t(id)
    union select id from kept
  ),
  names as (
    select t.name from jsonb_array_elements_text(coalesce(incoming_names, '[]'::jsonb)) as t(name)
    union select name from kept
  )
  select jsonb_build_object(
    'ids',   (select coalesce(jsonb_agg(distinct id), '[]'::jsonb) from ids),
    'names', (select coalesce(jsonb_agg(distinct name), '[]'::jsonb) from names)
  );
$fn$;

comment on function learning_apply_studio_folders(jsonb, jsonb, jsonb) is
  'Apply a Studio save''s folder list while preserving the row''s program-library (lcol-) folders. Returns {ids, names}.';

/*
 * Someone filed this object into program-library folders. The author's own Studio
 * folders survive: filing content into a shared folder says nothing about how the
 * author organises their own library.
 */
create or replace function learning_apply_program_folders(
  existing_ids    jsonb,
  existing_names  jsonb,
  incoming_ids    jsonb
) returns jsonb
language sql
stable
as $fn$
  with mine_now as (
    -- The program folders currently on the row — these are the ones being replaced.
    select c.id, c.name
    from jsonb_array_elements_text(coalesce(existing_ids, '[]'::jsonb)) as t(id)
    join learning_collections c on c.id = t.id
    where t.id like 'lcol-%'
  ),
  kept_ids as (
    -- Everything that is not a program folder id stays exactly as it was.
    select t.id
    from jsonb_array_elements_text(coalesce(existing_ids, '[]'::jsonb)) as t(id)
    where t.id not like 'lcol-%'
  ),
  kept_names as (
    -- The row's existing names LESS the names of the program folders being
    -- replaced. Subtracting by name is right here because the surviving ids have
    -- no row to look a name up in — the existing array is the only record of them.
    select t.name
    from jsonb_array_elements_text(coalesce(existing_names, '[]'::jsonb)) as t(name)
    where t.name not in (select name from mine_now)
  ),
  new_folders as (
    select c.id, c.name
    from jsonb_array_elements_text(coalesce(incoming_ids, '[]'::jsonb)) as t(id)
    join learning_collections c on c.id = t.id
  ),
  ids as (select id from kept_ids union select id from new_folders),
  names as (select name from kept_names union select name from new_folders)
  select jsonb_build_object(
    'ids',   (select coalesce(jsonb_agg(distinct id), '[]'::jsonb) from ids),
    'names', (select coalesce(jsonb_agg(distinct name), '[]'::jsonb) from names)
  );
$fn$;

comment on function learning_apply_program_folders(jsonb, jsonb, jsonb) is
  'Apply a program-library filing while preserving the author''s own Studio folders on the row. Returns {ids, names}.';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'learning_service') then
    execute 'grant execute on function learning_apply_studio_folders(jsonb, jsonb, jsonb) to learning_service';
    execute 'grant execute on function learning_apply_program_folders(jsonb, jsonb, jsonb) to learning_service';
  end if;
end $$;
