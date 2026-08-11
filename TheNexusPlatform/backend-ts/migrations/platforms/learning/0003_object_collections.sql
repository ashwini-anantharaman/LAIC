-- Folder membership travels with a published Content Studio object.
--
-- The Studio organises content into named collections ("bb-tutorials", "quiz",
-- …) that live only in the authoring browser. Consumer apps reading
-- learning_objects therefore saw a flat list: they could render an object but
-- could not say which folder an author filed it under, and had no way to group
-- a Learn tab the way the Studio shows it.
--
-- Two columns rather than one, because ids and names answer different
-- questions. `collection_ids` is the stable key to match on across syncs when a
-- folder is renamed; `collection_names` is what a reader can actually display
-- without holding a copy of the Studio's collection table. Denormalising the
-- names is deliberate — the alternative is exporting the whole folder tree to
-- every consumer for a label.
--
-- Both default to an empty array, so every row that already exists reads as
-- "filed nowhere" rather than null, and consumers can treat the value as an
-- array unconditionally.
--
-- Replayed on every `npm run migrate` (see ../README.md), so it is end-state
-- and idempotent — never a drop-and-rebuild.

alter table if exists learning_objects
  add column if not exists collection_ids jsonb not null default '[]'::jsonb;

alter table if exists learning_objects
  add column if not exists collection_names jsonb not null default '[]'::jsonb;

comment on column learning_objects.collection_ids is
  'Studio collection ids this object is filed under. Stable across renames; match on these.';

comment on column learning_objects.collection_names is
  'Human-readable folder names matching collection_ids, denormalised so readers need no folder table.';
