-- Which VERSION of a Content Studio object is the published one.
--
-- learning_objects holds one row per object, so consumer apps read whatever
-- content was written last. That made publishing implicit: every submit
-- replaced what readers saw, and an author had no way to say "ship v2, keep
-- working on v3". Publishing is now a deliberate per-version act, and these
-- columns record which version the row's content came from.
--
-- version_number is the author-facing number (v1, v2, …) rather than the
-- internal id, because that is what a reader would display next to the
-- content, and it stays meaningful even if the authoring side re-keys.
--
-- Null on every existing row: content published before this migration has no
-- version recorded, which is honest — we do not know which one it was.
--
-- Replayed on every `npm run migrate` (see ../README.md), so it is end-state
-- and idempotent — never a drop-and-rebuild.

alter table if exists learning_objects
  add column if not exists version_number integer;

alter table if exists learning_objects
  add column if not exists published_at timestamptz;

comment on column learning_objects.version_number is
  'Author-facing version number (v1, v2, …) whose content this row holds. Null = published before versions were tracked.';

comment on column learning_objects.published_at is
  'When an author last explicitly published a version into this row.';
