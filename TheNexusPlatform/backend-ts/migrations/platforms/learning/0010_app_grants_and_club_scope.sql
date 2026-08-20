-- An APP can be granted content, and an app's publication can be club-scoped.
--
-- Two additions, both serving the same chain of decisions:
--
--   content manager  →  grants an object to an APP
--   app administrator →  decides it goes ON the app, for everyone or one club
--   club administrator →  decides their club sees it in the program
--
-- 1. subject_type gains 'app'.
--
-- The fourth kind of subject on learning_object_grants, beside profile, role and
-- club (0008). Granting to an app is, in practice, granting to its
-- ADMINISTRATORS: nobody "is" an app, so the row means "this app's admins may
-- see this content and decide whether to carry it". The app is named by its slug
-- in subject_id, the same slug learning_object_app_targets.app_key uses.
--
-- Deliberately the same table again. Four subject kinds, one predicate, one place
-- to look for "who can see this" — the alternative is four join tables whose
-- visibility rules have to be kept in step by hand.
--
-- 2. app targets gain club_program_id.
--
-- Publishing to an app was one bit per (object, app): on the app or not. An app
-- administrator needs finer than that — "this folder goes on Bridge Bird, but only
-- the Highbury club sees it there" — so a target now optionally names a club.
--
-- NULL means the whole app, and that is the value every existing row has: the
-- column is additive, and nothing that is published today becomes club-scoped by
-- being migrated. An object can carry several rows for one app, one per club, plus
-- a NULL row for everyone.
--
-- The unique index has to change with it. A plain (object_id, app_key,
-- club_program_id) index would let duplicate NULL rows accumulate, because NULLs
-- never conflict in a unique index — so the key coalesces to a sentinel uuid. That
-- keeps "published to the whole app" a single row and makes the upsert's
-- ON CONFLICT target stable.
--
-- Replayed on every `npm run migrate` (see ../README.md) — end-state and
-- idempotent, never drop-and-rebuild.

-- ── 1. 'app' as a subject ───────────────────────────────────────────────────
-- Found by DEFINITION, not by name: 0007 declared its check inline and 0008
-- replaced it under a name we control, but a database that has only ever seen
-- 0007 still carries the generated one. Drop whatever check mentions
-- subject_type, then assert ours.
do $$
declare
  c text;
begin
  if to_regclass('public.learning_object_grants') is null then
    return; -- 0007 has not run yet; it creates the table and this replays after
  end if;

  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'learning_object_grants'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%subject_type%'
      and pg_get_constraintdef(con.oid) not ilike '%''app''%'
  loop
    execute format('alter table learning_object_grants drop constraint %I', c);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_object_grants_subject_type_chk'
  ) then
    alter table learning_object_grants
      add constraint learning_object_grants_subject_type_chk
      check (subject_type in ('profile', 'role', 'club', 'app'));
  end if;
end $$;

comment on column learning_object_grants.subject_type is
  'profile = a person, role = everyone holding it, club = a partner program, app = that app''s administrators. All four widen visibility; none narrows it.';

-- "What has this app been granted?" — the app administrator's own library.
create index if not exists idx_learning_object_grants_app
  on learning_object_grants (subject_id)
  where subject_type = 'app';

-- ── 2. club-scoped app publication ──────────────────────────────────────────
alter table if exists learning_object_app_targets
  add column if not exists club_program_id uuid;

comment on column learning_object_app_targets.club_program_id is
  'Which club sees this on the app. NULL = the whole app, which is what every row predating 0010 means.';

-- The old key was (object_id, app_key) and cannot hold a per-club row. Replace it
-- with one that coalesces NULL so "the whole app" stays a single row.
drop index if exists learning_object_app_target_uniq;
create unique index if not exists learning_object_app_target_scope_uniq
  on learning_object_app_targets (
    object_id,
    app_key,
    coalesce(club_program_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- "What is on this app for this club?" — the reader's question, once app targets
-- become a filter rather than a record (see 0009's header).
create index if not exists idx_learning_object_app_targets_app_club
  on learning_object_app_targets (app_key, club_program_id);
