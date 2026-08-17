-- 0007 — invite specific people to a specific piece of content.
--
-- The Docs model, and the reason it needs a table rather than a column: sharing is
-- many-to-one and it carries a level. "This tutorial, with Priya as an editor and
-- Sam as a viewer" is three facts about one object, and none of them fit beside it.
--
--   subject_type='profile'  one person, invited individually
--   subject_type='role'     everyone holding a club role, e.g. "Club Mentor"
--   level='view'            can open it
--   level='edit'            can open and change it
--
-- WHAT THIS IS NOT. It is not a second visibility system running beside program
-- scope. A row's DEFAULT audience is still its scope_level + program_id (0006); a
-- grant is the deliberate exception to that default, for one named subject. Reads
-- union the two; writes check ownership first and fall back to a grant.
--
-- ── CONFINEMENT: GRANTS NEVER CROSS A CLUB ─────────────────────────────────
-- A subject must be a member of — or hold a role in — the club that owns the
-- object. This is enforced in the grant endpoint, where the membership is knowable,
-- NOT here: a foreign key can say "this profile exists", never "this profile
-- belongs to the club that owns this object", because the club is on the object and
-- the membership is in another table entirely. The constraint is therefore a
-- server-side check with a test, and this comment exists so nobody reads the absence
-- of a database constraint as the absence of the rule.
--
-- Club isolation is the property the whole system rests on. Sharing is a way to
-- narrow within a club, never a way to reach across one.
--
-- ON DELETE CASCADE, because a grant to a deleted object is not a fact about
-- anything. Note the app's delete is a hard delete with no tombstone (see
-- deleteLearningObject) — so this cascades to nothing rather than orphaning rows.
--
-- IDEMPOTENT END-STATE: the runner has no ledger and replays every file.

create table if not exists learning_object_grants (
  object_id    text not null references learning_objects(id) on delete cascade,
  subject_type text not null check (subject_type in ('profile', 'role')),
  subject_id   text not null,
  level        text not null check (level in ('view', 'edit')),
  granted_by   uuid,
  created_at   timestamptz not null default now(),
  -- One grant per subject per object. Re-inviting someone at a different level is
  -- an upsert, not a second row — two rows disagreeing about one person's level is
  -- a state with no correct answer.
  primary key (object_id, subject_type, subject_id)
);

-- "What am I allowed to see?" — the read path's join, per viewer.
create index if not exists idx_learning_object_grants_subject
  on learning_object_grants (subject_type, subject_id);

-- "Who is this shared with?" — the share sheet, per object.
create index if not exists idx_learning_object_grants_object
  on learning_object_grants (object_id);

-- Same posture as every other table in this pack: the platform's service role owns
-- it, nexus_app and public get nothing. 9000_nexus_hardening.sql sweeps
-- `learning_%` and would catch this table by name anyway; doing it here as well
-- means a partial apply never leaves the table readable by the app role.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'learning_service') then
    execute 'revoke all on table learning_object_grants from public';
    execute 'grant select, insert, update, delete on table learning_object_grants to learning_service';
  end if;
end $$;
