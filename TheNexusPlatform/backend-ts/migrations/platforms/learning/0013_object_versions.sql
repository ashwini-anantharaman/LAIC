-- 0013 — version history that exists on the server.
--
-- Until now an object had a version NUMBER and no history. `version_number`
-- said "this is v12"; nothing anywhere held what v11 contained. The Studio does
-- keep a version list, but in the authoring browser's localStorage
-- (objectVersionsStore.ts), which means:
--
--   1. It is PER BROWSER. The person who made v11 is the only one who can see
--      it, and only on that machine.
--   2. A REVIEWER CANNOT DIFF. Somebody given review access on a folder can read
--      the current pipeline and nothing else, so "what changed since I looked?"
--      has no answer.
--   3. RESTORING is likewise private. The Studio can put a version back for its
--      own author; the program library cannot.
--
-- So this table holds a snapshot per committed save: the content, who wrote it,
-- when, and the number it was given.
--
-- ── WHY ONLY COMMITTED SAVES ────────────────────────────────────────────────
-- Every write used to bump version_number, autosaves included, so a tutorial
-- reached v11 from being opened and looked at. A history of eleven identical
-- entries is worse than none: it buries the two saves somebody actually made.
-- A snapshot is cut when the caller says the save is deliberate (the pipeline
-- endpoint's `commit` flag, set by the Save button and never by an autosave).
-- Autosaves still persist the content -- they just do not claim to be versions.
--
-- ── WHO MAY READ IT ─────────────────────────────────────────────────────────
-- Whoever may read the object's pipeline: review access is enough. Reading
-- history is reading, and a reviewer who cannot see what changed is being asked
-- to review a moving target. Writing is separate and still needs edit access.

create table if not exists learning_object_versions (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- text, matching learning_objects.id (see 0012's note on the id space).
  object_id      text not null,
  version_number integer not null,
  title          text,
  -- The whole content at that moment. Snapshots are deliberately SELF-CONTAINED
  -- rather than diffs: a version has to render on its own years later, without
  -- replaying every save before it.
  blocks         jsonb not null default '[]'::jsonb,
  pipeline_draft jsonb,
  -- Who committed it, kept as BOTH a profile id and a name. The id is the truth;
  -- the name is what a history list has to show after somebody leaves the
  -- program and the join comes back empty.
  created_by     uuid,
  created_by_name text,
  -- The author's own words about the save, when they gave any.
  note           text,
  created_at     timestamptz not null default now()
);

-- One row per (object, version). A retried save must not double-record.
create unique index if not exists learning_object_versions_object_number_idx
  on learning_object_versions (object_id, version_number);

-- The list view reads newest-first for one object.
create index if not exists learning_object_versions_object_created_idx
  on learning_object_versions (object_id, created_at desc);

alter table learning_object_versions enable row level security;

-- ── DRAFT VERSIONS ──────────────────────────────────────────────────────────
-- Two ways a version comes to exist, and a history has to tell them apart:
--
--   'committed'  somebody pressed Save to Content Library. They are saying this
--                is the version they mean.
--   'draft'      they closed the editor with edits that were never committed.
--                The work is kept -- losing it because they clicked the wrong X
--                would be indefensible -- but it is not a version anybody
--                declared, and a list that showed it as one would put an
--                accident beside a decision.
alter table learning_object_versions
  add column if not exists status text not null default 'committed'
  check (status in ('committed', 'draft'));
